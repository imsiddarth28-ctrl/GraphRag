import re
from typing import List

class RecursiveCharacterTextSplitter:
    """
    Recursively splits text into chunks of specified size and overlap, 
    respecting boundaries in hierarchical order (paragraphs, lines, words, chars).
    """
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200, separators: List[str] = None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        # Standard separators from largest (paragraphs) to smallest (characters)
        self.separators = separators or ["\n\n", "\n", " ", ""]

        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("Chunk overlap must be smaller than chunk size.")

    def split_text(self, text: str) -> List[str]:
        """
        Splits text into chunks, preserving word and sentence structures where possible.
        """
        if not text:
            return []

        final_chunks = []
        # 1. Break text recursively down to items smaller than chunk_size
        splits = self._split(text, self.separators)

        # 2. Merge split components back together to fit chunk_size and overlap
        current_chunk_parts = []
        current_len = 0

        for split in splits:
            split_len = len(split)
            
            # If adding this split exceeds chunk_size, output current chunk first
            if current_len + split_len > self.chunk_size:
                if current_chunk_parts:
                    final_chunks.append("".join(current_chunk_parts))
                    
                    # Create overlap base for the next chunk
                    overlap_parts = []
                    overlap_len = 0
                    for item in reversed(current_chunk_parts):
                        if overlap_len + len(item) > self.chunk_overlap:
                            break
                        overlap_parts.insert(0, item)
                        overlap_len += len(item)
                    
                    current_chunk_parts = overlap_parts
                    current_len = overlap_len
            
            current_chunk_parts.append(split)
            current_len += split_len

        # Append last remaining block
        if current_chunk_parts:
            final_chunks.append("".join(current_chunk_parts))

        return final_chunks

    def _split(self, text: str, separators: List[str]) -> List[str]:
        """
        Recursively splits a text block using separators list.
        """
        if not separators:
            return [text]

        separator = separators[0]
        next_separators = separators[1:]

        if separator == "":
            return list(text)

        # Split text while keeping the separators for boundary context
        parts = re.split(f"({re.escape(separator)})", text)
        parts = [p for p in parts if p != ""]

        splits = []
        for part in parts:
            if len(part) <= self.chunk_size:
                splits.append(part)
            else:
                # Recursively parse using finer separators
                splits.extend(self._split(part, next_separators))

        return splits
