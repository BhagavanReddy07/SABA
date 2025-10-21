# backend/app/db/pinecone_utils.py
import logging
import traceback
from typing import Optional, List, Dict, Any
from pinecone import Pinecone, ServerlessSpec
from app.config_pinecone import pinecone_settings

logger = logging.getLogger(__name__)

_initialized = False
_pc: Optional[Pinecone] = None
_index_name: str = pinecone_settings.PINECONE_INDEX_NAME
_region = "us-east-1"  # Free-plan compatible region


def init_pinecone() -> Pinecone:
    """
    Initializes Pinecone client and ensures the index exists.
    Returns the Pinecone client instance.
    """
    global _initialized, _pc
    if _initialized and _pc:
        return _pc

    try:
        # Create Pinecone client instance
        _pc = Pinecone(api_key=pinecone_settings.PINECONE_API_KEY)

        # Check if the index exists
        existing_indexes = _pc.list_indexes().names()
        if _index_name not in existing_indexes:
            logger.info(
                "Creating Pinecone index '%s' dim=%s in region '%s'",
                _index_name,
                pinecone_settings.EMBEDDING_DIM,
                _region,
            )
            _pc.create_index(
                name=_index_name,
                dimension=pinecone_settings.EMBEDDING_DIM,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region=_region),
            )

        _initialized = True
        logger.info("Pinecone initialized successfully. Index '%s' is ready.", _index_name)
        return _pc

    except Exception as e:
        logger.error("Failed to initialize Pinecone: %s\n%s", e, traceback.format_exc())
        raise


def get_index():
    """
    Returns a handle to the Pinecone index.
    """
    global _pc
    if _pc is None:
        init_pinecone()

    # ✅ lowercase 'i' for the new SDK
    return _pc.index(_index_name)


def upsert_vectors(items: List[Dict[str, Any]]):
    """
    Upserts a list of vectors to Pinecone.
    Each item: {"id": str, "values": [float...], "metadata": {...}}
    """
    idx = get_index()
    try:
        to_upsert = [(it["id"], it["values"], it.get("metadata", {})) for it in items]
        idx.upsert(vectors=to_upsert)
        return True
    except Exception as e:
        logger.error("Pinecone upsert failed: %s\n%s", e, traceback.format_exc())
        return False


def query_vectors(vector: List[float], top_k: int = 5, filter: Optional[Dict] = None, include_metadata: bool = True):
    """
    Queries Pinecone index.
    """
    idx = get_index()
    try:
        if filter:
            res = idx.query(vector=vector, top_k=top_k, filter=filter, include_metadata=include_metadata)
        else:
            res = idx.query(vector=vector, top_k=top_k, include_metadata=include_metadata)
        return res
    except Exception as e:
        logger.error("Pinecone query failed: %s\n%s", e, traceback.format_exc())
        return None
