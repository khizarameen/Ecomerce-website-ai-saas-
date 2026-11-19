"""
ChromaDB Vector Store
"""

import os
import logging
from typing import List, Dict, Optional, Any

try:
    import chromadb
    from chromadb.config import Settings
except ImportError:
    chromadb = None
    Settings = None

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    """
    Wrapper for ChromaDB vector database with graceful fallback when
    chromadb is omitted or running on a read-only serverless filesystem.
    """

    def __init__(
        self,
        collection_name: str = "product_embeddings",
        persist_directory: str = "./chroma_db"
    ):
        """
        Initialize ChromaDB client and collection
        """
        self.collection_name = collection_name
        if os.getenv("VERCEL") and persist_directory == "./chroma_db":
            persist_directory = "/tmp/chroma_db"
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None

        if chromadb is None or Settings is None:
            logger.warning("chromadb is not installed; vector search running in no-op fallback mode.")
            return

        try:
            self.client = chromadb.PersistentClient(
                path=persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
            self.collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"ChromaDB initialized: {collection_name}")
        except Exception as e:
            logger.warning(f"ChromaDB unavailable ({e}); continuing without persistent vector store.")
            self.client = None
            self.collection = None

    def add(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        metadatas: Optional[List[Dict]] = None,
        documents: Optional[List[str]] = None
    ) -> bool:
        """
        Add items to collection
        """
        if self.collection is None:
            return False
        try:
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=documents
            )
            logger.info(f"Added {len(ids)} items to collection")
            return True
        except Exception as e:
            logger.error(f"Add to collection error: {e}")
            return False

    def query(
        self,
        query_embeddings: List[List[float]],
        n_results: int = 10,
        where: Optional[Dict] = None,
        include: Optional[List[str]] = None
    ) -> Dict:
        """
        Query the collection
        """
        if self.collection is None:
            return {"ids": [], "distances": [], "metadatas": [], "documents": []}
        try:
            results = self.collection.query(
                query_embeddings=query_embeddings,
                n_results=n_results,
                where=where,
                include=include or ["metadatas", "documents", "distances"]
            )
            return results
        except Exception as e:
            logger.error(f"Query error: {e}")
            return {"ids": [], "distances": [], "metadatas": [], "documents": []}

    def delete(self, ids: List[str]) -> bool:
        """
        Delete items by ID
        """
        if self.collection is None:
            return False
        try:
            self.collection.delete(ids=ids)
            logger.info(f"Deleted {len(ids)} items from collection")
            return True
        except Exception as e:
            logger.error(f"Delete error: {e}")
            return False

    def get_count(self) -> int:
        """
        Get total items count
        """
        if self.collection is None:
            return 0
        try:
            return self.collection.count()
        except Exception as e:
            logger.error(f"Count error: {e}")
            return 0

    def reset(self) -> bool:
        """
        Reset collection
        """
        if self.client is None:
            return False
        try:
            self.client.delete_collection(self.collection_name)
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"Collection {self.collection_name} reset")
            return True
        except Exception as e:
            logger.error(f"Reset error: {e}")
            return False