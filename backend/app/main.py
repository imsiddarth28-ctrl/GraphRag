import os
import time
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings
from app.core.logging import get_configured_logger
from app.graph.neo4j_manager import Neo4jManager
from app.retrieval.qdrant_manager import QdrantManager
from app.core.dependencies import get_document_service
from app.services.document_service import DocumentService, UnsupportedFileTypeError

# Configure root logger
logger = get_configured_logger(name=settings.APP_NAME, log_level=settings.LOG_LEVEL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles startup database connections and shutdown cleanups.
    """
    neo4j_manager = Neo4jManager(
        uri=settings.NEO4J_URI,
        username=settings.NEO4J_USERNAME,
        password=settings.NEO4J_PASSWORD,
        logger=logger
    )
    qdrant_manager = QdrantManager(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY,
        logger=logger
    )

    logger.info("Initializing database connection managers...")
    try:
        await neo4j_manager.connect()
    except Exception as e:
        logger.error(f"Startup Neo4j connection failure: {e}")

    try:
        await qdrant_manager.connect()
    except Exception as e:
        logger.error(f"Startup Qdrant connection failure: {e}")

    app.state.neo4j_manager = neo4j_manager
    app.state.qdrant_manager = qdrant_manager

    yield

    logger.info("Closing database connection managers...")
    await neo4j_manager.close()
    await qdrant_manager.close()
    logger.info("Database managers shut down cleanly.")

# Initialize FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="GraphRAG Studio Backend",
    version=settings.VERSION,
    lifespan=lifespan
)

# Enable CORS for Next.js frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register chunk processing router
from app.api.chunk_routes import router as chunk_router
app.include_router(chunk_router)

@app.get("/")
async def get_root():
    """
    Endpoint returning service running status.
    """
    return {
        "status": "running",
        "service": "GraphRAG Backend"
    }

@app.get("/health")
async def get_health():
    """
    Endpoint returning api instance health.
    """
    return {
        "status": "healthy"
    }

@app.get("/version")
async def get_version():
    """
    Endpoint returning application configuration version.
    """
    return {
        "version": settings.VERSION
    }

# --- Document Endpoints (Phase 1) ---

@app.post("/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    doc_service: DocumentService = Depends(get_document_service)
):
    """
    Uploads a document, extracts text content, and persists metadata.
    """
    start_time = time.perf_counter()
    logs = [f"API: Received upload request for '{file.filename}'"]
    
    try:
        content = await file.read()
        size = len(content)
        logs.append(f"API: File size is {size} bytes")
        
        logs.append("Service: Dispatching file to parsing engine...")
        doc, text, processing_time_ms = await doc_service.upload_document(
            filename=file.filename,
            content=content,
            size=size
        )
        logs.append(f"Service: Parsing completed in {processing_time_ms:.2f}ms")
        logs.append(f"Repo: Metadata saved under UUID '{doc.id}'")
        
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "document": doc,
            "extracted_text": text,
            "processing_time_ms": processing_time_ms,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except UnsupportedFileTypeError as e:
        error_msg = str(e)
        logger.warning(error_msg)
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": execution_time_ms,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
    except Exception as e:
        error_msg = f"Unexpected upload failure: {str(e)}"
        logger.error(error_msg, exc_info=True)
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": execution_time_ms,
                    "logs": logs + [f"Fatal Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )

@app.get("/documents")
async def get_documents(doc_service: DocumentService = Depends(get_document_service)):
    """
    Lists all documents.
    """
    start_time = time.perf_counter()
    logs = ["Repo: Querying all document metadata..."]
    try:
        docs = await doc_service.repository.get_all()
        logs.append(f"Repo: Found {len(docs)} documents.")
        
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "documents": docs,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except Exception as e:
        error_msg = str(e)
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": execution_time_ms,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )

@app.get("/documents/{doc_id}")
async def get_document(
    doc_id: str,
    doc_service: DocumentService = Depends(get_document_service)
):
    """
    Retrieves metadata and raw extracted text for a specific document.
    """
    start_time = time.perf_counter()
    logs = [f"Repo: Fetching document '{doc_id}'..."]
    try:
        result = await doc_service.repository.get_by_id(doc_id)
        if not result:
            error_msg = f"Document with ID '{doc_id}' not found."
            execution_time_ms = (time.perf_counter() - start_time) * 1000.0
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": error_msg,
                    "debug": {
                        "execution_time_ms": execution_time_ms,
                        "logs": logs + [f"Warning: {error_msg}"],
                        "errors": [error_msg]
                    }
                }
            )
        
        doc, text = result
        logs.append(f"Repo: Retrieved document '{doc.filename}' successfully.")
        
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "document": doc,
            "extracted_text": text,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": execution_time_ms,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )

@app.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    doc_service: DocumentService = Depends(get_document_service)
):
    """
    Deletes a document from the system (database record and upload file).
    """
    start_time = time.perf_counter()
    logs = [f"Repo: Attempting to delete document '{doc_id}'"]
    try:
        # Get extension to remove local file
        result = await doc_service.repository.get_by_id(doc_id)
        if not result:
            error_msg = f"Document with ID '{doc_id}' not found."
            execution_time_ms = (time.perf_counter() - start_time) * 1000.0
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": error_msg,
                    "debug": {
                        "execution_time_ms": execution_time_ms,
                        "logs": logs + [f"Warning: {error_msg}"],
                        "errors": [error_msg]
                    }
                }
            )
        
        doc, _ = result
        ext = f".{doc.type}"
        file_path = os.path.join(doc_service.upload_dir, f"{doc_id}{ext}")
        
        # Delete file from disk
        if os.path.exists(file_path):
            os.remove(file_path)
            logs.append(f"Service: Deleted local file '{file_path}'")
        else:
            logs.append(f"Service: Local file not found on disk, continuing delete...")

        # Delete database entry
        deleted = await doc_service.repository.delete(doc_id)
        if deleted:
            logs.append("Repo: Database record deleted.")
            
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "status": "deleted",
            "id": doc_id,
            "debug": {
                "execution_time_ms": execution_time_ms,
                "logs": logs,
                "errors": []
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        execution_time_ms = (time.perf_counter() - start_time) * 1000.0
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": error_msg,
                "debug": {
                    "execution_time_ms": execution_time_ms,
                    "logs": logs + [f"Error: {error_msg}"],
                    "errors": [error_msg]
                }
            }
        )
