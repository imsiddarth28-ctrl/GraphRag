import logging
from fastapi import Request
from app.config.settings import Settings, settings
from app.core.logging import get_configured_logger
from app.graph.neo4j_manager import Neo4jManager
from app.retrieval.qdrant_manager import QdrantManager

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
    Retrieves the manager stored in FastAPI app state.
    """
    return request.app.state.neo4j_manager

def get_qdrant(request: Request) -> QdrantManager:
    """
    Dependency provider to retrieve the application-wide Qdrant connection manager.
    Retrieves the manager stored in FastAPI app state.
    """
    return request.app.state.qdrant_manager
