import sqlite3
from datetime import datetime
from typing import List, Optional, Tuple
from app.models.document import Document

class DocumentRepository:
    """
    Handles SQLite database persistence for document metadata and extracted text.
    """
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._initialize_table()

    def _initialize_table(self):
        """
        Creates the database tables for documents if they do not exist.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    type TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    extracted_text TEXT
                )
            """)
            conn.commit()

    async def save(self, doc: Document, extracted_text: str) -> None:
        """
        Persists a document's metadata and its extracted text.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO documents (id, filename, type, size, created_at, status, extracted_text)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc.id,
                    doc.filename,
                    doc.type,
                    doc.size,
                    doc.created_at.isoformat(),
                    doc.status,
                    extracted_text
                )
            )
            conn.commit()

    async def get_all(self) -> List[Document]:
        """
        Retrieves metadata for all uploaded documents.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT id, filename, type, size, created_at, status FROM documents ORDER BY created_at DESC"
            )
            rows = cursor.fetchall()
            return [
                Document(
                    id=row["id"],
                    filename=row["filename"],
                    type=row["type"],
                    size=row["size"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    status=row["status"]
                )
                for row in rows
            ]

    async def get_by_id(self, doc_id: str) -> Optional[Tuple[Document, str]]:
        """
        Retrieves a document's metadata and its full extracted text.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT id, filename, type, size, created_at, status, extracted_text FROM documents WHERE id = ?",
                (doc_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            
            doc = Document(
                id=row["id"],
                filename=row["filename"],
                type=row["type"],
                size=row["size"],
                created_at=datetime.fromisoformat(row["created_at"]),
                status=row["status"]
            )
            return doc, row["extracted_text"]

    async def delete(self, doc_id: str) -> bool:
        """
        Deletes a document from persistence. Returns True if found and deleted, False otherwise.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            conn.commit()
            return cursor.rowcount > 0
