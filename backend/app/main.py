from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config.settings import settings
from app.core.logging import get_configured_logger
from app.graph.neo4j_manager import Neo4jManager
from app.retrieval.qdrant_manager import QdrantManager

# Configure root logger
logger = get_configured_logger(name=settings.APP_NAME, log_level=settings.LOG_LEVEL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager to handle application startup and shutdown events,
    managing lifecycle for database connection pools.
    """
    # Instantiate database managers
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
    
    # Connect database drivers. 
    # In Phase 0, we attempt to connect, but log errors gracefully if services are offline.
    try:
        await neo4j_manager.connect()
    except Exception as e:
        logger.error(f"Startup Neo4j connection failure: {e}")

    try:
        await qdrant_manager.connect()
    except Exception as e:
        logger.error(f"Startup Qdrant connection failure: {e}")

    # Store connections in app state for dependency injection
    app.state.neo4j_manager = neo4j_manager
    app.state.qdrant_manager = qdrant_manager

    yield  # Application processes requests

    # Cleanup connections on shutdown
    logger.info("Closing database connection managers...")
    await neo4j_manager.close()
    await qdrant_manager.close()
    logger.info("Database managers shut down cleanly.")

# Initialize FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="GraphRAG Project Foundation API Backend",
    version=settings.VERSION,
    lifespan=lifespan
)

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
