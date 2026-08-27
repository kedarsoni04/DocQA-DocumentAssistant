"""
Voyage AI Embedding Client
==========================
Wraps the official ``voyageai`` Python SDK.

Asymmetric usage (required by Voyage):
  - Ingestion (PDF chunks)  → input_type="document"
  - Query time              → input_type="query"

Voyage-4 model family shares one vector space across lite/standard/large
variants, so switching tiers later requires no Chroma rebuild.

Error handling:
  - 429 → exponential backoff (up to 5 retries)
  - 402 / "quota" → clear "free-tier exhausted" message, no retry
  - Other errors → raise immediately after logging
"""

import logging
import time

import voyageai

from config import settings

logger = logging.getLogger(__name__)

# Module-level client (lazy singleton — avoids re-auth on every call)
_client: voyageai.Client | None = None


def _get_client() -> voyageai.Client:
    global _client
    if _client is None:
        if not settings.voyage_api_key:
            raise ValueError(
                "VOYAGE_API_KEY is not set. Please add it to your .env file."
            )
        _client = voyageai.Client(api_key=settings.voyage_api_key)
    return _client


def get_voyage_embeddings(
    texts: list[str],
    input_type: str,  # "document" for ingestion, "query" for retrieval
) -> list[list[float]]:
    """
    Embed *texts* via Voyage AI and return a list of float vectors.

    Parameters
    ----------
    texts : list[str]
        Non-empty list of non-empty strings.
    input_type : str
        ``"document"`` when embedding PDF chunks; ``"query"`` when embedding
        a user's question.  Voyage uses these to apply asymmetric
        transformations that improve retrieval quality.

    Returns
    -------
    list[list[float]]
        One embedding vector per input text, in the same order.
    """
    if not texts:
        raise ValueError("texts list must not be empty")

    client = _get_client()
    max_retries = 5
    base_wait = 2  # seconds

    for attempt in range(max_retries):
        try:
            result = client.embed(
                texts,
                model=settings.embedding_model,
                input_type=input_type,
            )
            return result.embeddings  # list[list[float]]

        except voyageai.error.RateLimitError:
            wait_time = base_wait * (2 ** attempt)
            logger.warning(
                "Voyage AI rate limit hit (attempt %d/%d). Retrying in %ss…",
                attempt + 1,
                max_retries,
                wait_time,
            )
            time.sleep(wait_time)
            continue

        except voyageai.error.InvalidRequestError as exc:
            # Voyage raises InvalidRequestError for quota exhaustion (402-like)
            msg = str(exc).lower()
            if "quota" in msg or "limit exceeded" in msg or "out of" in msg or "402" in msg:
                logger.error(
                    "Voyage AI free-tier token allowance exhausted. "
                    "You need to add a payment method or use a new key. "
                    "Original error: %s",
                    exc,
                )
                raise RuntimeError(
                    "Voyage AI free-tier token quota has been exhausted. "
                    "Please check your Voyage AI account at https://dash.voyageai.com."
                ) from exc
            logger.error("Voyage AI invalid request: %s", exc)
            raise

        except voyageai.error.AuthenticationError as exc:
            logger.error(
                "Voyage AI authentication failed — check VOYAGE_API_KEY in .env: %s", exc
            )
            raise

        except Exception as exc:
            if attempt == max_retries - 1:
                logger.error(
                    "Voyage AI embedding failed after %d attempts: %s",
                    max_retries,
                    exc,
                )
                raise
            wait_time = base_wait * (2 ** attempt)
            logger.warning(
                "Unexpected error from Voyage AI (attempt %d/%d): %s. Retrying in %ss…",
                attempt + 1,
                max_retries,
                exc,
                wait_time,
            )
            time.sleep(wait_time)

    raise RuntimeError(
        f"Failed to get embeddings from Voyage AI after {max_retries} attempts"
    )
