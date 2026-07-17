import logging
from fastapi import Request, Depends
from app.config.settings import Settings, settings
from app.core.logging import get_configured_logger
from app.graph.neo4j_manager import Neo4jManager
from app.retrieval.qdrant_manager import QdrantManager
from app.repositories.document_repository import DocumentRepository
from app.repositories.chunk_repository import ChunkRepository
from app.services.document_service import DocumentService
from app.services.document_processing_service import DocumentProcessingService

# Cache repository singletons for local SQLite access
_document_repo = None
_chunk_repo = None

def get_settings() -> Settings:
    """
    Returns the loaded global Pydantic Settings instance.
    """
    return settings

def get_logger() -> logging.Logger:
    """
    Returns a configured structured JSON logger instance.
    """
    return get_configured_logger(
        name=settings.APP_NAME,
        log_level=settings.LOG_LEVEL
    )

def get_neo4j(request: Request) -> Neo4jManager:
    """
    Dependency provider to retrieve the application-wide Neo4j connection manager.
    """
    return request.app.state.neo4j_manager

def get_qdrant(request: Request) -> QdrantManager:
    """
    Dependency provider to retrieve the application-wide Qdrant connection manager.
    """
    return request.app.state.qdrant_manager

def get_document_repository() -> DocumentRepository:
    """
    Dependency provider returning the SQLite DocumentRepository instance.
    """
    global _document_repo
    if _document_repo is None:
        _document_repo = DocumentRepository(db_path=settings.SQLITE_DB_PATH)
    return _document_repo

def get_chunk_repository() -> ChunkRepository:
    """
    Dependency provider returning the SQLite ChunkRepository instance.
    """
    global _chunk_repo
    if _chunk_repo is None:
        _chunk_repo = ChunkRepository(db_path=settings.SQLITE_DB_PATH)
    return _chunk_repo

def get_document_service(
    repo: DocumentRepository = Depends(get_document_repository)
) -> DocumentService:
    """
    Dependency provider returning the DocumentService instance.
    """
    return DocumentService(repository=repo)

def get_document_processing_service(
    doc_repo: DocumentRepository = Depends(get_document_repository),
    chunk_repo: ChunkRepository = Depends(get_chunk_repository)
) -> DocumentProcessingService:
    """
    Dependency provider returning the DocumentProcessingService instance.
    """
    return DocumentProcessingService(doc_repo=doc_repo, chunk_repo=chunk_repo)
