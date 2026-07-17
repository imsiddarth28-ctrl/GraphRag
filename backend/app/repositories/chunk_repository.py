import sqlite3
from datetime import datetime
from typing import List, Optional
from app.schemas.chunk import ChunkResponse

class ChunkRepository:
    """
    Handles SQLite database operations for persisted document chunks.
    """
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._initialize_table()

    def _initialize_table(self):
        """
        Creates the chunks database table if it does not exist, setting up a cascading foreign key.
        """
        with sqlite3.connect(self.db_path) as conn:
            # Enable foreign keys support
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    page_number INTEGER,
                    content TEXT NOT NULL,
                    character_count INTEGER NOT NULL,
                    word_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
                )
            """)
            conn.commit()

    async def save_chunks(self, chunks: List[ChunkResponse]) -> None:
        """
        Saves a list of document chunks to the database in a transaction.
        """
        if not chunks:
            return

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            # Clear any pre-existing chunks for this document (re-process safety)
            doc_id = chunks[0].document_id
            conn.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
            
            # Batch insert new chunks
            conn.executemany(
                """
                INSERT INTO chunks (id, document_id, chunk_index, page_number, content, character_count, word_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        c.chunk_id,
                        c.document_id,
                        c.chunk_index,
                        c.page_number,
                        c.content,
                        c.character_count,
                        c.word_count,
                        c.created_at.isoformat()
                    )
                    for c in chunks
                ]
            )
            conn.commit()

    async def get_chunks_by_document(self, doc_id: str) -> List[ChunkResponse]:
        """
        Retrieves all chunks associated with a document, sorted by sequence index.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT id, document_id, chunk_index, page_number, content, character_count, word_count, created_at FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC",
                (doc_id,)
            )
            rows = cursor.fetchall()
            return [
                ChunkResponse(
                    chunk_id=row["id"],
                    document_id=row["document_id"],
                    chunk_index=row["chunk_index"],
                    page_number=row["page_number"],
                    content=row["content"],
                    character_count=row["character_count"],
                    word_count=row["word_count"],
                    created_at=datetime.fromisoformat(row["created_at"])
                )
                for row in rows
            ]

    async def get_chunk(self, doc_id: str, chunk_id: str) -> Optional[ChunkResponse]:
        """
        Retrieves a single chunk by its ID and document ID.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT id, document_id, chunk_index, page_number, content, character_count, word_count, created_at FROM chunks WHERE document_id = ? AND id = ?",
                (doc_id, chunk_id)
            )
            row = cursor.fetchone()
            if not row:
                return None
            
            return ChunkResponse(
                chunk_id=row["id"],
                document_id=row["document_id"],
                chunk_index=row["chunk_index"],
                page_number=row["page_number"],
                content=row["content"],
                character_count=row["character_count"],
                word_count=row["word_count"],
                created_at=datetime.fromisoformat(row["created_at"])
            )

    async def delete_chunks(self, doc_id: str) -> int:
        """
        Deletes all chunks associated with a document. Returns count of deleted chunks.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
            conn.commit()
            return cursor.rowcount
