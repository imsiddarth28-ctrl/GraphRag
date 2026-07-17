import time
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.core.dependencies import get_document_service, get_document_repository
from app.schemas.chunk import ChunkResponse
from app.services.document_processing_service import DocumentProcessingService, DocumentNotFoundError
from app.core.dependencies import get_settings

router = APIRouter(prefix="/documents", tags=["chunks"])

# Local helper to instantiate the service manually or via DI
# In dependencies.py we will configure get_document_processing_service
from app.core.dependencies import get_document_processing_service

@router.post("/{document_id}/process", status_code=status.HTTP_200_OK)
async def process_document(
    document_id: str,
    chunk_size: int = Query(1000, description="Max characters in a chunk", ge=100, le=5000),
    chunk_overlap: int = Query(200, description="Overlapping characters between adjacent chunks", ge=0, le=2000),
    processing_service: DocumentProcessingService = Depends(get_document_processing_service)
):
    """
    Triggers the text cleaning and recursive chunking pipeline for an uploaded document.
    """
    start_time = time.perf_counter()
    logs = [f"API: Triggered processing for doc '{document_id}' with size={chunk_size}, overlap={chunk_overlap}"]
    
    if chunk_overlap >= chunk_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Chunk overlap must be less than chunk size.",
                "debug": {
                    "execution_time_ms": 0,
                    "logs": logs + ["Error: Overlap exceeds size limit"],
                    "errors": ["Chunk overlap must be less than chunk size."]
                }
            }
        )

    try:
        result = await processing_service.process_document(
            doc_id=document_id,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        return result
    except DocumentNotFoundError as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
    except Exception as e:
        error_msg = f"Processing failed: {str(e)}"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Fatal: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )

@router.get("/{document_id}/chunks", response_model=None)
async def get_document_chunks(
    document_id: str,
    processing_service: DocumentProcessingService = Depends(get_document_processing_service)
):
    """
    Retrieves all text chunks generated for a specific document.
    """
    start_time = time.perf_counter()
    logs = [f"API: Querying chunks for document '{document_id}'"]
    try:
        # Check if doc exists
        doc_result = await processing_service.doc_repo.get_by_id(document_id)
        if not doc_result:
            raise DocumentNotFoundError(f"Document '{document_id}' not found.")
            
        chunks = await processing_service.chunk_repo.get_chunks_by_document(document_id)
        logs.append(f"Repo: Found {len(chunks)} chunks.")
        
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "chunks": chunks,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except DocumentNotFoundError as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
    except Exception as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Fatal: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )

@router.get("/{document_id}/chunks/{chunk_id}", response_model=None)
async def get_document_chunk(
    document_id: str,
    chunk_id: str,
    processing_service: DocumentProcessingService = Depends(get_document_processing_service)
):
    """
    Retrieves a single chunk by ID.
    """
    start_time = time.perf_counter()
    logs = [f"API: Fetching chunk '{chunk_id}' for document '{document_id}'"]
    try:
        # Check if doc exists
        doc_result = await processing_service.doc_repo.get_by_id(document_id)
        if not doc_result:
            raise DocumentNotFoundError(f"Document '{document_id}' not found.")

        chunk = await processing_service.chunk_repo.get_chunk(document_id, chunk_id)
        if not chunk:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Chunk '{chunk_id}' not found for document '{document_id}'"
            )
            
        logs.append("Repo: Chunk retrieved successfully.")
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "chunk": chunk,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except DocumentNotFoundError as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Fatal: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )

@router.delete("/{document_id}/chunks", response_model=None)
async def delete_document_chunks(
    document_id: str,
    processing_service: DocumentProcessingService = Depends(get_document_processing_service)
):
    """
    Deletes all chunks generated for a specific document.
    """
    start_time = time.perf_counter()
    logs = [f"API: Deleting all chunks for document '{document_id}'"]
    try:
        # Check if doc exists
        doc_result = await processing_service.doc_repo.get_by_id(document_id)
        if not doc_result:
            raise DocumentNotFoundError(f"Document '{document_id}' not found.")

        deleted_count = await processing_service.chunk_repo.delete_chunks(document_id)
        logs.append(f"Repo: Deleted {deleted_count} chunks.")
        
        # Reset document status back to completed (from processed chunks deleted)
        doc, raw_text = doc_result
        doc.status = "completed"  # reset back to upload completed status but unchunked
        await processing_service.doc_repo.save(doc, raw_text)
        
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "status": "deleted",
            "deleted_count": deleted_count,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except DocumentNotFoundError as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
    except Exception as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": (time.perf_counter() - start_time) * 1000.0,
                    "logs": logs + [f"Fatal: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
