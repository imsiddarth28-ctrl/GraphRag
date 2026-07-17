import logging
from typing import Optional
from neo4j import AsyncGraphDatabase, AsyncDriver

class Neo4jManager:
    """
    Manages the lifecycle and health of the Neo4j database connection pool.
    Utilizes Neo4j's official asynchronous driver.
    """
    def __init__(self, uri: str, username: str, password: str, logger: logging.Logger):
        self.uri = uri
        self.username = username
        self.password = password
        self.logger = logger
        self.driver: Optional[AsyncDriver] = None

    async def connect(self) -> None:
        """
        Initializes the async Neo4j driver.
        """
        if not self.driver:
            self.logger.info("Initializing Neo4j async driver connectivity...")
            try:
                self.driver = AsyncGraphDatabase.driver(
                    self.uri,
                    auth=(self.username, self.password)
                )
                self.logger.info("Neo4j driver initialized successfully.")
            except Exception as e:
                self.logger.error(f"Failed to initialize Neo4j driver: {e}", exc_info=True)
                raise e

    async def close(self) -> None:
        """
        Closes the connection pool and cleans up driver resources.
        """
        if self.driver:
            self.logger.info("Closing Neo4j async driver connections...")
            await self.driver.close()
            self.driver = None
            self.logger.info("Neo4j driver connection closed.")

    async def health_check(self) -> bool:
        """
        Verifies active connectivity to the Neo4j cluster.
        Returns True if healthy, False otherwise.
        """
        if not self.driver:
            self.logger.warning("Neo4j health check failed: Driver not connected.")
            return False
        try:
            # Official method to verify connectivity asynchronously
            await self.driver.verify_connectivity()
            return True
        except Exception as e:
            self.logger.error(f"Neo4j health check failed: {e}")
            return False
