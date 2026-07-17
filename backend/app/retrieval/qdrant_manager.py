import logging
from typing import Optional
from qdrant_client import AsyncQdrantClient

class QdrantManager:
    """
    Manages the lifecycle and health of the Qdrant vector database connection.
    Utilizes Qdrant's official asynchronous client.
    """
    def __init__(self, url: str, api_key: Optional[str], logger: logging.Logger):
        self.url = url
        self.api_key = api_key
        self.logger = logger
        self.client: Optional[AsyncQdrantClient] = None

    async def connect(self) -> None:
        """
        Initializes the async Qdrant client.
        """
        if not self.client:
            self.logger.info("Initializing Qdrant async client connectivity...")
            try:
                self.client = AsyncQdrantClient(
                    url=self.url,
                    api_key=self.api_key
                )
                self.logger.info("Qdrant client initialized successfully.")
            except Exception as e:
                self.logger.error(f"Failed to initialize Qdrant client: {e}", exc_info=True)
                raise e

    async def close(self) -> None:
        """
        Closes the Qdrant connection.
        """
        if self.client:
            self.logger.info("Closing Qdrant async client connection...")
            # AsyncQdrantClient has an async close() method to free resources
            await self.client.close()
            self.client = None
            self.logger.info("Qdrant client connection closed.")

    async def health_check(self) -> bool:
        """
        Verifies active connectivity to the Qdrant cluster by checking its collections or status.
        Returns True if healthy, False otherwise.
        """
        if not self.client:
            self.logger.warning("Qdrant health check failed: Client not connected.")
            return False
        try:
            # Querying the collections is a standard way to verify round-trip connectivity.
            # It throws an exception if the cluster is unreachable or misconfigured.
            await self.client.get_collections()
            return True
        except Exception as e:
            self.logger.error(f"Qdrant health check failed: {e}")
            return False
