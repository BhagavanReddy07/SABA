import time
import logging
import json
from typing import List, Optional
from datetime import datetime

import google.generativeai as genai
import cohere
from app.config import settings
from app.prompt_templates import MAIN_SYSTEM_PROMPT

# Import semantic memory for personalization
from app.services.semantic_memory import query_semantic_memory, store_semantic_memory

logger = logging.getLogger(__name__)

# =====================================================
# 🔹 Initialize AI Clients
# =====================================================
gemini_keys = [key.strip() for key in settings.GEMINI_API_KEYS.split(",") if key.strip()]
current_gemini_key_index = 0
cohere_client = cohere.Client(settings.COHERE_API_KEY) if settings.COHERE_API_KEY else None

FAILED_PROVIDERS: dict[str, float] = {}
AI_PROVIDERS = ["gemini", "cohere"]

# =====================================================
# 🔹 Provider Availability
# =====================================================
def _is_provider_available(name: str) -> bool:
    failure_time = FAILED_PROVIDERS.get(name)
    if failure_time and (time.time() - failure_time) < settings.AI_PROVIDER_FAILURE_TIMEOUT:
        logger.warning(f"[AI] Provider '{name}' in cooldown. Skipping.")
        return False
    return True

# =====================================================
# 🔹 Gemini Helper
# =====================================================
def _try_gemini(prompt: str) -> str:
    global current_gemini_key_index
    if not gemini_keys:
        raise RuntimeError("No Gemini API keys configured.")

    start_index = current_gemini_key_index
    while True:
        try:
            key = gemini_keys[current_gemini_key_index]
            genai.configure(api_key=key)

            available_models = [m.name for m in genai.list_models()]
            preferred_models = ["gemini-2.5-flash", "gemini-2.5", "gemini-1.5-flash"]
            selected_model = next((m for m in preferred_models if m in available_models), None)

            if not selected_model:
                raise RuntimeError(f"No supported Gemini models available for key {current_gemini_key_index}.")

            logger.info(f"[Gemini] Using model: {selected_model}")
            model = genai.GenerativeModel(selected_model)
            response = model.generate_content(prompt)
            return response.text

        except Exception as e:
            logger.error(f"[Gemini] Key {current_gemini_key_index} failed: {e}")
            current_gemini_key_index = (current_gemini_key_index + 1) % len(gemini_keys)
            if current_gemini_key_index == start_index:
                raise RuntimeError("All Gemini API keys failed.")

# =====================================================
# 🔹 Cohere Helper
# =====================================================
def _try_cohere(prompt: str) -> str:
    if not cohere_client:
        raise RuntimeError("Cohere API client not configured.")
    try:
        response = cohere_client.chat(message=prompt, model="command-r-08-2024")
        return response.text
    except Exception as e:
        raise RuntimeError(f"Cohere API error: {e}")

# =====================================================
# 🔹 Main AI Response Generator (Personalized)
# =====================================================
def get_response(
    prompt: dict,  # expects {"sender": "user_id", "text": "message"}
    history: Optional[List[dict] | str] = None,
    pinecone_context: Optional[str] = None,
    neo4j_facts: Optional[str] = None,
    state: str = "general_conversation"
) -> str:
    """
    Generate a personalized AI response using conversation history and memory context.
    """

    user_id = prompt.get("sender") or "anonymous_user"
    user_text = prompt.get("text") if isinstance(prompt, dict) else str(prompt)

    # 🧠 Retrieve prior semantic context for personalization
    if pinecone_context is None:
        try:
            matches = query_semantic_memory(user_id, user_text, top_k=5)
            if matches:
                pinecone_context = "\n".join(
                    f"• {m['metadata'].get('text', '')}" for m in matches if m.get("metadata")
                )
            else:
                pinecone_context = "No relevant past context found."
        except Exception as e:
            logger.error(f"[AI] Pinecone context retrieval failed: {e}")
            pinecone_context = "Error retrieving past context."

    # 💾 Store current message in Pinecone for future recall
    try:
        store_semantic_memory(user_id, user_text)
    except Exception as e:
        logger.error(f"[AI] Failed to store message in Pinecone: {e}")

    # 🧩 Prepare chat history text
    if isinstance(history, str):
        history_str = history
    else:
        history_str = ""
        if history:
            for msg in history:
                speaker = "Human" if msg.get("sender") == "user" else "Assistant"
                history_str += f"{speaker}: {msg.get('text')}\n"

    # 🧠 Build the final system prompt
    full_prompt = MAIN_SYSTEM_PROMPT.format(
        neo4j_facts=neo4j_facts or "No facts available.",
        pinecone_context=pinecone_context or "No similar conversations found.",
        state=state,
        history=history_str or "This is the first message in the conversation.",
        prompt=user_text
    )

    logger.debug("----- Full AI Prompt -----\n%s\n--------------------------", full_prompt)

    # 🔄 Try providers in order
    for provider in AI_PROVIDERS:
        if not _is_provider_available(provider):
            continue
        try:
            if provider == "gemini":
                result = _try_gemini(full_prompt)
            elif provider == "cohere":
                result = _try_cohere(full_prompt)
            FAILED_PROVIDERS.pop(provider, None)
            return result
        except Exception as e:
            logger.error(f"[AI] Provider '{provider}' failed: {e}")
            FAILED_PROVIDERS[provider] = time.time()

    return "❌ All AI services are currently unavailable. Please try again later."

# =====================================================
# 🔹 Summarization Utility
# =====================================================
def summarize_text(text: str) -> str:
    summary_prompt = (
        "You are an expert at summarizing conversations. "
        "Provide a concise, third-person summary of the following transcript:\n\n"
        f"---\n{text}\n---\n\nSUMMARY:"
    )
    for provider in AI_PROVIDERS:
        if not _is_provider_available(provider):
            continue
        try:
            if provider == "gemini":
                return _try_gemini(summary_prompt)
            elif provider == "cohere":
                return _try_cohere(summary_prompt)
        except Exception as e:
            logger.error(f"[AI] Summarization failed with '{provider}': {e}")
            FAILED_PROVIDERS[provider] = time.time()
    return "❌ Failed to generate summary. All AI services unavailable."

# =====================================================
# 🔹 Fact Extraction
# =====================================================
def extract_facts_from_text(text: str) -> dict:
    extraction_prompt = f"""
    Analyze the following transcript. Extract entities and relationships.
    Respond ONLY with a valid JSON object. If none, return {{"entities": [], "relationships": []}}.

    Transcript:
    ---{text}---
    """
    try:
        raw_response = _try_gemini(extraction_prompt)
        start = raw_response.find("{")
        end = raw_response.rfind("}")
        if start != -1 and end != -1:
            return json.loads(raw_response[start:end + 1])
        return {"entities": [], "relationships": []}
    except Exception as e:
        logger.error(f"[AI] Fact extraction failed: {e}")
        return {"entities": [], "relationships": []}

# =====================================================
# 🔹 Intent Classification
# =====================================================
def get_structured_intent(user_message: str) -> dict:
    """
    Analyze a user's message and return a structured intent in JSON.
    """
    from app.services import ai_services  # avoid circular import
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    prompt = f"""
You are an advanced NLU engine. Analyze the user's message and respond ONLY with JSON.

Current Time: {current_time}

Message: "{user_message}"

Actions:
1. create_task → JSON with title, datetime, priority, category, notes
2. fetch_tasks → JSON with action: fetch_tasks
3. save_fact → JSON with key/value
4. general_chat → JSON with action: general_chat

JSON Response:
"""
    try:
        response_text = ai_services.get_response({"sender": "user", "text": prompt}, state="nlu_parsing")
        cleaned = response_text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except Exception as e:
        logger.error(f"NLU parsing failed: {e}")
        return {"action": "general_chat"}
