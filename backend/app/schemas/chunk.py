from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class ChunkResponse(BaseModel):
    """
    Schema representing a text chunk extracted from a document.
    """
    chunk_id: str = Field(..., description="Unique UUID identifier for this chunk")
    document_id: str = Field(..., description="The parent document UUID")
    chunk_index: int = Field(..., description="The sequence index of the chunk in the document")
    page_number: Optional[int] = Field(None, description="The document page number if available")
    content: str = Field(..., description="The text content of the chunk")
    character_count: int = Field(..., description="Total characters in this chunk")
    word_count: int = Field(..., description="Total words in this chunk")
    created_at: datetime = Field(..., description="Timestamp when the chunk was processed")
