import time
import uuid
import re
from datetime import datetime, timezone
from typing import List, Tuple, Dict, Any, Optional
from app.models.document import Document
from app.schemas.chunk import ChunkResponse
from app.repositories.document_repository import DocumentRepository
from app.repositories.chunk_repository import ChunkRepository
from app.chunking.recursive_chunker import RecursiveCharacterTextSplitter

class DocumentNotFoundError(Exception):
    """Raised when the requested document does not exist in the repository."""
    pass

class DocumentProcessingService:
    """
    Manages document processing pipelines: text cleaning, segmentation,
    recursive chunking, database storage, and statistic analytics.
    """
    def __init__(self, doc_repo: DocumentRepository, chunk_repo: ChunkRepository):
        self.doc_repo = doc_repo
        self.chunk_repo = chunk_repo

    async def process_document(
        self, 
        doc_id: str, 
        chunk_size: int = 1000, 
        chunk_overlap: int = 200
    ) -> Dict[str, Any]:
        """
        Runs the document text through the cleaning, parsing, and chunking pipeline.
        Saves chunks persisted in SQLite and returns execution statistics and debug payloads.
        """
        start_time = time.perf_counter()
        logs = [f"Pipeline: Starting process trigger for document '{doc_id}'"]

        # 1. Fetch document from repository
        logs.append("Repo: Loading raw document text...")
        doc_result = await self.doc_repo.get_by_id(doc_id)
        if not doc_result:
            raise DocumentNotFoundError(f"Document with ID '{doc_id}' not found.")
        
        doc, raw_text = doc_result
        logs.append(f"Repo: Loaded raw text of length {len(raw_text)}")

        # 2. Clean Text
        logs.append("Service: Starting cleaning filter pass...")
        cleaned_text = self._clean_text(raw_text)
        logs.append(f"Service: Cleaning completed. Size reduced from {len(raw_text)} to {len(cleaned_text)} chars.")

        # 3. Split into Paragraphs (for stat calculations and visualizer debug)
        paragraphs = [p.strip() for p in cleaned_text.split("\n\n") if p.strip()]
        paragraph_count = len(paragraphs)
        logs.append(f"Service: Identified {paragraph_count} paragraph blocks.")

        # 4. Generate Chunks
        logs.append(f"Service: Splitting text recursively (size={chunk_size}, overlap={chunk_overlap})...")
        splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        chunk_contents = splitter.split_text(cleaned_text)
        chunk_count = len(chunk_contents)
        logs.append(f"Service: Created {chunk_count} text chunks.")

        # 5. Persist Chunks in SQLite
        chunks: List[ChunkResponse] = []
        chunk_stats = []
        
        total_chars = 0
        total_words = 0
        sizes = []

        for idx, content in enumerate(chunk_contents):
            chunk_id = str(uuid.uuid4())
            char_cnt = len(content)
            word_cnt = len(content.split())
            
            total_chars += char_cnt
            total_words += word_cnt
            sizes.append(char_cnt)

            chunk_obj = ChunkResponse(
                chunk_id=chunk_id,
                document_id=doc_id,
                chunk_index=idx,
                page_number=self._detect_page_number(content, idx),
                content=content,
                character_count=char_cnt,
                word_count=word_cnt,
                created_at=datetime.now(timezone.utc)
            )
            chunks.append(chunk_obj)
            
            chunk_stats.append({
                "chunk_index": idx,
                "character_count": char_cnt,
                "word_count": word_cnt,
                "page_number": chunk_obj.page_number
            })

        logs.append("Repo: Deleting previous chunks and inserting new batch...")
        await self.chunk_repo.save_chunks(chunks)
        logs.append("Repo: New chunks database transaction committed.")

        # Update Document status to processed/completed
        doc.status = "completed"
        # We save the updated document status
        await self.doc_repo.save(doc, raw_text)

        # 6. Calculate statistics
        avg_chunk_size = sum(sizes) / chunk_count if chunk_count > 0 else 0
        largest_chunk = max(sizes) if chunk_count > 0 else 0
        smallest_chunk = min(sizes) if chunk_count > 0 else 0

        stats = {
            "document_size_bytes": doc.size,
            "total_raw_characters": len(raw_text),
            "total_cleaned_characters": total_chars,
            "total_words": total_words,
            "paragraph_count": paragraph_count,
            "chunk_count": chunk_count,
            "average_chunk_size": round(avg_chunk_size, 1),
            "largest_chunk": largest_chunk,
            "smallest_chunk": smallest_chunk
        }

        # 7. Generate Chunk Boundary Visualizer Output
        chunk_boundaries = self._generate_boundary_visualizer(chunk_contents)

        processing_time_ms = (time.perf_counter() - start_time) * 1000.0
        logs.append(f"Pipeline: Document processed successfully in {processing_time_ms:.2f}ms")

        return {
            "document": doc,
            "processing_time_ms": processing_time_ms,
            "stats": stats,
            "chunks": chunk_stats,
            "debug": {
                "execution_time_ms": processing_time_ms,
                "logs": logs,
                "errors": [],
                "original_text": raw_text,
                "cleaned_text": cleaned_text,
                "paragraphs": paragraphs,
                "chunk_boundaries": chunk_boundaries,
                "chunks": [c.model_dump() for c in chunks]
            }
        }

    def _clean_text(self, text: str) -> str:
        """
        Filters junk characters, hidden control sequences, extra spaces,
        and standardizes newlines while preserving paragraphs and headings.
        """
        if not text:
            return ""

        # Remove zero-width spaces/joiners and BOM markers
        for char in ["\u200b", "\u200c", "\u200d", "\ufeff"]:
            text = text.replace(char, "")

        # Remove control characters except newlines/tabs
        text = re.sub(r"[^\x20-\x7E\n\t\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]", "", text)

        # Standardize line breaks
        text = text.replace("\r\n", "\n").replace("\r", "\n")

        # Strip whitespace from every line
        lines = [line.strip() for line in text.split("\n")]

        # Collapse duplicate blank lines (3+ consecutive newlines) into a single paragraph split (2 newlines)
        cleaned_lines = []
        blank_run = 0
        for line in lines:
            if line == "":
                blank_run += 1
                if blank_run > 1:
                    continue
            else:
                blank_run = 0
            cleaned_lines.append(line)

        cleaned = "\n".join(cleaned_lines).strip()

        # Collapse runs of tabs/spaces into a single space, but keep newlines intact
        cleaned = re.sub(r"[ \t]+", " ", cleaned)

        return cleaned

    def _detect_page_number(self, text: str, index: int) -> Optional[int]:
        """
        Heuristic to find page numbers in parsed text chunks.
        """
        # Look for page markers: e.g. "Page 3", "Page: 3", or Form Feed character '\x0c' splits
        match = re.search(r"(?:page|pg\.?)\s*(\d+)", text, re.IGNORECASE)
        if match:
            return int(match.group(1))
        # Fallback to an incremental index proxy if no text indicators are present
        return None

    def _generate_boundary_visualizer(self, chunks: List[str]) -> str:
        """
        Renders a pretty text visual representation showing where chunks split.
        """
        boundary_lines = []
        for i, chunk in enumerate(chunks):
            boundary_lines.append(f"Chunk {i + 1}")
            boundary_lines.append("====================")
            boundary_lines.append(chunk)
            boundary_lines.append("--------------------")
            boundary_lines.append("")
        return "\n".join(boundary_lines).strip()
