# backend/app/api/chat.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging

from app.db.pinecone_chat import store_message_in_pinecone, retrieve_context
from app.ai.embedding import get_embedding
from app.ai.model import generate_response

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    user_id: str
    message: str
    top_k_context: Optional[int] = 5


class ChatResponse(BaseModel):
    reply: str
    context: List[dict]


@router.post("/chat/", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        user_id = request.user_id
        message_text = request.message
        top_k = request.top_k_context or 5

        embedding = get_embedding(message_text)
        context = retrieve_context(user_id, embedding, top_k=top_k)

        llm_input = ""
        for msg in context:
            llm_input += f"{msg['text']}\n"
        llm_input += f"User: {message_text}\n"

        reply = generate_response(llm_input)

        store_message_in_pinecone(user_id, message_text, embedding)

        return ChatResponse(reply=reply, context=context)

    except Exception as e:
        logger.error("Chat endpoint error: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")
