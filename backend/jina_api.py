import logging
import time
import requests

from config import settings

logger = logging.getLogger(__name__)

def get_jina_embeddings(texts: list[str], task: str = "retrieval.passage") -> list[list[float]]:
    """
    Get embeddings from Jina API for a list of texts.
    Includes basic exponential backoff for 429 rate limits.
    """
    if not settings.jina_api_key:
        raise ValueError("JINA_API_KEY is not set. Please add it to your environment variables.")

    url = "https://api.jina.ai/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {settings.jina_api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": settings.embedding_model,
        "task": task,
        "input": texts,
        "truncate": True,  # Auto-truncate inputs exceeding the 8194-token limit
    }

    max_retries = 5
    base_wait = 2

    for attempt in range(max_retries):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                return [item["embedding"] for item in data["data"]]
            elif response.status_code == 429:
                wait_time = base_wait * (2 ** attempt)
                logger.warning("Rate limited by Jina API. Retrying in %ss...", wait_time)
                time.sleep(wait_time)
                continue
            else:
                try:
                    detail = response.json()
                except Exception:
                    detail = response.text
                logger.error(
                    "Jina API Error %s: %s\nRequest payload preview — model=%s, task=%s, num_texts=%d, first_text_len=%d",
                    response.status_code,
                    detail,
                    payload.get("model"),
                    payload.get("task"),
                    len(texts),
                    len(texts[0]) if texts else 0,
                )
                response.raise_for_status()
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                logger.error("Failed to get embeddings from Jina API after %s attempts: %s", max_retries, e)
                raise
            else:
                wait_time = base_wait * (2 ** attempt)
                logger.warning("Error calling Jina API: %s. Retrying in %ss...", e, wait_time)
                time.sleep(wait_time)
    
    raise RuntimeError("Failed to get embeddings from Jina API")
