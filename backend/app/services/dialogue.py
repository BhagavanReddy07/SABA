# backend/app/services/dialogue.py
"""
Enhanced dialogue management:
- queries Pinecone semantic memory for prior similar messages
- constructs a short pinecone_context string (top matches)
- calls ai_services.get_response with pinecone_context and existing history
"""

from typing import List, Optional
import logging

from app.services import ai_services
from app.services.semantic_memory import query_semantic_memory, store_semantic_memory

logger = logging.getLogger(__name__)

def build_context_from_matches(matches: List[dict], max_chars: int = 800) -> str:
    """
    Builds a concise text summary from pinecone matches to feed into the LLM prompt.
    """
    pieces = []
    for m in matches:
        md = m.get("metadata", {})
        txt = md.get("text", "")
        score = m.get("score", None)
        pieces.append(f"- ({score:.3f}) {txt}" if score is not None else f"- {txt}")
    joined = "\n".join(pieces)
    if len(joined) > max_chars:
        joined = joined[:max_chars].rsplit("\n", 1)[0] + "\n[truncated]"
    return joined or "No similar conversations found."

def manage_dialogue(user_message: str, history: Optional[List[dict]] = None, user_id: Optional[str] = "anonymous") -> str:
    """
    Primary entrypoint for the conversation flow.
    - user_message: the raw user text
    - history: list of {"sender": "...", "text": "..."} or string (keeps compatibility)
    - user_id: id string for user-specific memory (default: "anonymous")
    """
    try:
        # 1) Query semantic memory for similar entries
        matches = query_semantic_memory(user_id=user_id, query=user_message, top_k=5)
        pinecone_context = build_context_from_matches(matches)

        # 2) Optionally store the new message into semantic memory (you can change policy)
        # We store only short messages (avoid storing huge transcripts). Change as needed.
        try:
            if isinstance(user_message, str) and len(user_message) < 2000:
                store_semantic_memory(user_id=user_id, text=user_message, metadata={"source": "user_message"})
        except Exception:
            logger.exception("Failed to store semantic memory for message; continuing.")

        # 3) Call existing ai_services.get_response and pass pinecone_context
        # ai_services.get_response expects prompt as dict {"sender":..., "text":...}
        prompt = {"sender": "user", "text": user_message}
        # preserve existing API: history may be string or list
        reply = ai_services.get_response(prompt, history=history, pinecone_context=pinecone_context)
        return reply
    except Exception as e:
        logger.exception("Dialogue management failed: %s", e)
        # fallback to simpler path
        prompt = {"sender": "user", "text": user_message}
        return ai_services.get_response(prompt, history=history)
