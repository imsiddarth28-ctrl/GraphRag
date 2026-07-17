import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.chunking.recursive_chunker import RecursiveCharacterTextSplitter
from app.services.document_processing_service import DocumentProcessingService

client = TestClient(app)

def test_recursive_character_splitter_basic():
    """Verify recursive character text splitter splits, chunk sizes, and overlaps."""
    text = "Paragraph one is short.\n\nParagraph two has a lot of sentences. Sentence A. Sentence B. Sentence C. Sentence D.\n\nParagraph three."
    
    # Check max size constraint
    splitter = RecursiveCharacterTextSplitter(chunk_size=50, chunk_overlap=10)
    chunks = splitter.split_text(text)
    
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) <= 50
        
    # Check overlap presence: consecutive chunks should share some characters
    splitter = RecursiveCharacterTextSplitter(chunk_size=40, chunk_overlap=15)
    chunks = splitter.split_text(text)
    assert len(chunks) >= 2
    
    # Verify that overlap works (the end of chunk 0 should overlap with start of chunk 1)
    c0 = chunks[0]
    c1 = chunks[1]
    # Check if there is some common substring (best effort based on overlap size)
    overlap_found = False
    for i in range(5, 16):
        ending = c0[-i:]
        if ending in c1[:20]:
            overlap_found = True
            break
    assert overlap_found, f"Expected overlap between chunk 0 ('{c0}') and chunk 1 ('{c1}')"

def test_document_cleaning_logic():
    """Verify text cleaning filters duplicate newlines, whitespace, and hidden chars."""
    raw_text = "Hello \t world!   \n\n\nNew paragraph \u200b with hidden space.\n\nAnother line."
    
    # Instantiate service using dummy repositories to test the private _clean_text method
    service = DocumentProcessingService(doc_repo=None, chunk_repo=None)
    cleaned = service._clean_text(raw_text)
    
    # 1. Double spaces/tabs collapsed to a single space
    assert "Hello world!" in cleaned
    # 2. Hidden character \u200b removed
    assert "\u200b" not in cleaned
    # 3. Triple newlines collapsed to double newlines (\n\n)
    assert "\n\n\n" not in cleaned
    assert "New paragraph with hidden space.\n\nAnother line." in cleaned

def test_document_processing_api_flow():
    """Test the complete API lifecycle for document processing."""
    # 1. Upload a test document first
    upload_content = "This is paragraph one.\n\nThis is paragraph two, which is slightly longer. It has some data.\n\nThis is paragraph three."
    files = {"file": ("process_test.txt", upload_content.encode("utf-8"), "text/plain")}
    upload_resp = client.post("/documents/upload", files=files)
    assert upload_resp.status_code == 201
    doc_id = upload_resp.json()["document"]["id"]

    # 2. Process document (generate chunks)
    process_resp = client.post(f"/documents/{doc_id}/process?chunk_size=150&chunk_overlap=30")
    assert process_resp.status_code == 200
    proc_data = process_resp.json()
    
    assert "stats" in proc_data
    assert proc_data["stats"]["chunk_count"] > 0
    assert proc_data["stats"]["paragraph_count"] == 3
    assert len(proc_data["chunks"]) == proc_data["stats"]["chunk_count"]
    assert "debug" in proc_data
    assert "chunk_boundaries" in proc_data["debug"]

    # 3. Get Chunks List
    chunks_resp = client.get(f"/documents/{doc_id}/chunks")
    assert chunks_resp.status_code == 200
    chunks_data = chunks_resp.json()
    assert len(chunks_data["chunks"]) == proc_data["stats"]["chunk_count"]
    
    chunk_id = chunks_data["chunks"][0]["chunk_id"]

    # 4. Get Single Chunk
    single_chunk_resp = client.get(f"/documents/{doc_id}/chunks/{chunk_id}")
    assert single_chunk_resp.status_code == 200
    single_data = single_chunk_resp.json()
    assert single_data["chunk"]["chunk_id"] == chunk_id
    assert "content" in single_data["chunk"]

    # 5. Delete Chunks
    del_resp = client.delete(f"/documents/{doc_id}/chunks")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"
    assert del_resp.json()["deleted_count"] == len(chunks_data["chunks"])

    # 6. Verify chunks list is now empty
    chunks_empty_resp = client.get(f"/documents/{doc_id}/chunks")
    assert chunks_empty_resp.status_code == 200
    assert len(chunks_empty_resp.json()["chunks"]) == 0

    # Clean up uploaded file
    client.delete(f"/documents/{doc_id}")
