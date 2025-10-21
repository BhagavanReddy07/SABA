# backend/app/services/semantic_memory.py
import uuid
import time
import logging
from typing import List, Dict, Any, Optional


from app.db.pinecone_utils import upsert_vectors, query_vectors
from app.services.embeddings import get_embedding, get_batch_embeddings
from app.config_pinecone import pinecone_settings

logger = logging.getLogger(__name__)

def store_semantic_memory(user_id: str, text: str, namespace: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> Dict:
    """
    Stores a single text snippet for user in Pinecone.
    - user_id: id of the user (also stored in metadata)
    - text: raw text to store
    - namespace: optional (not used by current code; kept for future)
    - metadata: dict of extra metadata
    """
    vec = get_embedding(text)
    item_id = str(uuid.uuid4())
    meta = metadata.copy() if metadata else {}
    meta.update({"user_id": user_id, "text": text, "stored_at": int(time.time())})
    ok = upsert_vectors([{"id": item_id, "values": vec, "metadata": meta}])
    return {"ok": ok, "id": item_id}

def store_many(user_id: str, texts: List[str], metadatas: Optional[List[Dict[str, Any]]] = None) -> Dict:
    """
    Batch store many text snippets.
    """
    if metadatas is None:
        metadatas = [{}] * len(texts)
    embeddings = get_batch_embeddings(texts)
    items = []
    for i, emb in enumerate(embeddings):
        meta = metadatas[i] if i < len(metadatas) else {}
        meta.update({"user_id": user_id, "text": texts[i], "stored_at": int(time.time())})
        items.append({"id": str(uuid.uuid4()), "values": emb, "metadata": meta})
    ok = upsert_vectors(items)
    return {"ok": ok, "stored": len(items)}

def query_semantic_memory(user_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Returns a list of matches: [{"id":..., "score":..., "metadata": {...}}]
    """
    vec = get_embedding(query)
    # build filter for user_id. Use eq filter for Pinecone
    filter_obj = {"user_id": {"$eq": user_id}}
    res = query_vectors(vector=vec, top_k=top_k, filter=filter_obj, include_metadata=True)
    if res is None:
        return []

    # different pinecone versions may return differently shaped responses
    matches = []
    # attempt to read standard shape
    try:
        raw_matches = res.get("matches") if isinstance(res, dict) else getattr(res, "matches", None)
        if raw_matches is None:
            # some clients return top-level 'results' with 'matches'
            results = res.get("results") if isinstance(res, dict) else getattr(res, "results", None)
            if results and isinstance(results, list):
                raw_matches = results[0].get("matches", [])
    except Exception:
        raw_matches = None

    if not raw_matches:
        # try older style: res['matches'] or res.matches
        try:
            raw_matches = res['matches']
        except Exception:
            try:
                raw_matches = res.matches
            except Exception:
                raw_matches = []

    for m in raw_matches:
        # support both dict and object forms
        try:
            mid = m.get("id", None) if isinstance(m, dict) else getattr(m, "id", None)
            score = m.get("score", None) if isinstance(m, dict) else getattr(m, "score", None)
            metadata = m.get("metadata", {}) if isinstance(m, dict) else getattr(m, "metadata", {})
            matches.append({"id": mid, "score": score, "metadata": metadata})
        except Exception:
            logger.exception("Failed parsing match: %s", m)
    return matches
