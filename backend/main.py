"""
DocQA FastAPI Application
=========================
Routes:
  POST /upload              — accept PDF, ingest (parse → embed → store)
  POST /query               — retrieve + generate grounded answer
  GET  /document/{doc_id}  — serve the raw PDF file for the frontend viewer
  GET  /health              — liveness check
"""

import logging
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import settings
from ingestion.embedder import embed_and_store
from ingestion.parser import parse_pdf
from query.generator import generate
from query.retriever import retrieve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="DocQA", version="0.1.0")

# Allow the frontend to call the API
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure storage directories exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# In-memory document registry (single-doc phase — no DB needed)
# ---------------------------------------------------------------------------
# { doc_id: { "filename": str, "path": str, "page_count": int, "chunk_count": int } }
_doc_registry: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    page_count: int
    chunk_count: int


class QueryRequest(BaseModel):
    question: str
    doc_id: str


class ChunkInfo(BaseModel):
    text: str
    page_number: int
    section_heading: str
    score: float


class QueryResponse(BaseModel):
    answer: str
    cited_pages: list[int]
    chunks: list[ChunkInfo]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Accept a PDF upload, parse, embed, and store in Chroma.
    Returns doc metadata including page_count and chunk_count.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Save file to disk
    doc_id = str(uuid.uuid4())
    upload_path = Path(settings.upload_dir) / f"{doc_id}.pdf"
    content = await file.read()
    upload_path.write_bytes(content)
    logger.info("Saved uploaded PDF → %s (%d bytes)", upload_path, len(content))

    # Parse & chunk
    try:
        chunks = parse_pdf(upload_path)
    except Exception as exc:
        upload_path.unlink(missing_ok=True)
        logger.exception("PDF parsing failed")
        raise HTTPException(status_code=422, detail=f"PDF parsing failed: {exc}") from exc

    if not chunks:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="No text could be extracted from this PDF.")

    # Determine page count from parser output
    page_count = max(c.page_number for c in chunks)

    # Embed & store
    try:
        stored = embed_and_store(chunks, doc_id=doc_id, source_file=file.filename)
    except Exception as exc:
        upload_path.unlink(missing_ok=True)
        logger.exception("Embedding/storage failed")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}") from exc

    # Register document
    _doc_registry[doc_id] = {
        "filename": file.filename,
        "path": str(upload_path),
        "page_count": page_count,
        "chunk_count": stored,
    }

    logger.info(
        "Ingestion complete: doc_id=%s  pages=%d  chunks=%d",
        doc_id, page_count, stored,
    )
    return UploadResponse(
        doc_id=doc_id,
        filename=file.filename,
        page_count=page_count,
        chunk_count=stored,
    )


@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """
    Retrieve relevant chunks and generate a grounded answer with citations.
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    if req.doc_id not in _doc_registry:
        raise HTTPException(
            status_code=404,
            detail="Document not found. Please upload a PDF first.",
        )

    # Retrieve
    try:
        chunks = retrieve(req.question)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {exc}") from exc

    # Generate
    try:
        result = generate(req.question, chunks)
    except Exception as exc:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

    return QueryResponse(
        answer=result.answer,
        cited_pages=result.cited_pages,
        chunks=[
            ChunkInfo(
                text=c.text,
                page_number=c.page_number,
                section_heading=c.section_heading,
                score=c.score,
            )
            for c in result.chunks_used
        ],
    )


@app.get("/document/{doc_id}")
async def serve_document(doc_id: str):
    """
    Serve the raw PDF file so the frontend pdf.js viewer can load it.
    """
    entry = _doc_registry.get(doc_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Document not found.")
    pdf_path = Path(entry["path"])
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file missing from disk.")
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=entry["filename"],
    )
