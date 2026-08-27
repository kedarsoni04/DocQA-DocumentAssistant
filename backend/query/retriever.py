"""
Retriever
=========
Embeds a user query with the Voyage AI embedding API
(input_type="query") and performs dense nearest-neighbour retrieval
against the Chroma collection, returning the top-k chunks with metadata.

Must use the same embedding model and dimensionality as the ingestion step.
The asymmetric input_type="query" is intentional — Voyage optimises the
query vector differently from document vectors to improve retrieval quality.
"""

import logging
from dataclasses import dataclass
from typing import Optional

import chromadb

from config import settings
from voyage_api import get_voyage_embeddings

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    text: str
    page_number: int
    section_heading: str
    chunk_index: int
    score: float  # cosine similarity (0–1, higher = more similar)


def retrieve(query: str, k: Optional[int] = None) -> list[RetrievedChunk]:
    """
    Embed *query* (input_type="query") and return the top-*k* most relevant
    chunks from Chroma.

    Parameters
    ----------
    query : str
        The user's natural-language question.
    k : int, optional
        Number of chunks to retrieve. Defaults to ``settings.retrieval_k``.

    Returns
    -------
    list[RetrievedChunk]
        Ranked list of chunks (most relevant first).
    """
    k = k or settings.retrieval_k

    chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)

    # Embed the query via Voyage AI — input_type="query" for asymmetric retrieval
    query_embedding = get_voyage_embeddings([query], input_type="query")[0]

    # Query Chroma
    try:
        collection = chroma_client.get_collection(settings.chroma_collection)
    except Exception as exc:
        logger.error("Chroma collection '%s' not found: %s", settings.chroma_collection, exc)
        raise RuntimeError(
            "No document has been ingested yet. Please upload a PDF first."
        ) from exc

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    chunks: list[RetrievedChunk] = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        # Chroma cosine distance → similarity: similarity = 1 - distance
        chunks.append(
            RetrievedChunk(
                text=doc,
                page_number=int(meta.get("page_number", 0)),
                section_heading=meta.get("section_heading", ""),
                chunk_index=int(meta.get("chunk_index", 0)),
                score=round(1.0 - float(dist), 4),
            )
        )

    logger.info("Retrieved %d chunks for query: %.80s", len(chunks), query)
    return chunks
