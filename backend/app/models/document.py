from datetime import datetime, timezone
from pydantic import BaseModel, Field

class Document(BaseModel):
    """
    Domain model representing an uploaded document.
    """
    id: str = Field(..., description="Unique UUID identifier for the document")
    filename: str = Field(..., description="Original name of the uploaded file")
    type: str = Field(..., description="MIME type or file extension (pdf, txt, md, docx)")
    size: int = Field(..., description="Size of the file in bytes")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Timestamp when the file was processed")
    status: str = Field("pending", description="Processing status of the document (pending, completed, failed)")
