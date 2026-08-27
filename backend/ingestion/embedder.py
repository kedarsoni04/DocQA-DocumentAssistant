"""
Embedder
========
Takes parsed chunks, embeds them via Voyage AI
(voyage-4-lite by default), and stores them in a local Chroma
collection with full metadata.

Embedding dimensionality: 1024 (voyage-4 family default).
Chroma config must match this dimensionality — collection is recreated
on each upload to ensure a clean slate (single-document scope).

Asymmetric embedding:
  - input_type="document" is used here at ingestion time.
  - input_type="query"    is used at retrieval time (see retriever.py).

Voyage API batch limit: 128 texts per request (128 is the documented max
for voyage-4 models). _EMBED_BATCH is set conservatively to 80 to stay
well under any token-count per-request limits too.

Idempotent: deletes and recreates the Chroma collection on each call so
that a new upload always starts fresh.
"""

import logging

import chromadb

from config import settings
from ingestion.parser import Chunk
from voyage_api import get_voyage_embeddings

logger = logging.getLogger(__name__)

_EMBED_BATCH = 80  # Conservative batch size for Voyage API


def _get_chroma_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=settings.chroma_persist_dir)


def embed_and_store(
    chunks: list[Chunk],
    doc_id: str,
    source_file: str,
) -> int:
    """
    Embed *chunks* with Voyage AI (input_type="document") and store them
    in Chroma under *doc_id*.

    Returns the number of chunks stored.
    """
    if not chunks:
        logger.warning("embed_and_store called with empty chunk list")
        return 0

    chroma_client = _get_chroma_client()

    # Wipe existing collection and recreate — single-doc phase
    try:
        chroma_client.delete_collection(settings.chroma_collection)
        logger.info("Deleted existing Chroma collection '%s'", settings.chroma_collection)
    except Exception:
        pass  # Collection didn't exist yet

    collection = chroma_client.create_collection(
        name=settings.chroma_collection,
        metadata={"hnsw:space": "cosine"},
    )

    texts = [c.text for c in chunks]

    # Guard: Voyage API rejects batches containing empty/whitespace-only strings
    invalid = [i for i, t in enumerate(texts) if not t or not t.strip()]
    if invalid:
        logger.warning(
            "Skipping %d chunk(s) with empty text at indices: %s",
            len(invalid),
            invalid,
        )
        chunks = [c for c in chunks if c.text and c.text.strip()]
        texts = [c.text for c in chunks]

    if not texts:
        logger.warning("No non-empty chunks to embed after filtering")
        return 0

    # Embed in batches using input_type="document" (asymmetric ingestion)
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), _EMBED_BATCH):
        batch = texts[i : i + _EMBED_BATCH]
        batch_end = min(i + _EMBED_BATCH, len(texts))
        logger.info(
            "Embedding batch %d–%d of %d chunks via Voyage AI (document)",
            i + 1,
            batch_end,
            len(texts),
        )
        embeddings = get_voyage_embeddings(batch, input_type="document")
        all_embeddings.extend(embeddings)

    # Build Chroma-compatible payload
    ids = [f"{doc_id}::{c.chunk_index}" for c in chunks]
    metadatas = [
        {
            "doc_id": doc_id,
            "source_file": source_file,
            "page_number": c.page_number,
            "section_heading": c.section_heading or "",
            "chunk_index": c.chunk_index,
        }
        for c in chunks
    ]

    collection.add(
        ids=ids,
        embeddings=all_embeddings,
        documents=texts,
        metadatas=metadatas,
    )

    logger.info(
        "Stored %d chunks in Chroma collection '%s'",
        len(chunks),
        settings.chroma_collection,
    )
    return len(chunks)
