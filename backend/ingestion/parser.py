"""
PDF Parser & Chunker
====================
Extracts text from a PDF using PyMuPDF (fitz) and splits it into
semantically meaningful chunks based on structural boundaries
(numbered headings, clauses, section markers) rather than fixed windows.

Every chunk includes metadata:
  - source_file:     original filename
  - page_number:     1-indexed page where the chunk starts
  - section_heading: nearest detected heading (if any)
  - chunk_index:     sequential index across the document
  - text:            chunk text content
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pymupdf as fitz  # PyMuPDF (modern import)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class Chunk:
    text: str
    source_file: str
    page_number: int
    section_heading: Optional[str]
    chunk_index: int


# ---------------------------------------------------------------------------
# Heading / boundary detection
# ---------------------------------------------------------------------------

# Patterns that signal the start of a new structural section
_HEADING_PATTERNS = [
    # Numbered clauses: "1.", "1.1", "1.1.1", "Article 1", "Section 1"
    re.compile(r"^\s*(?:Article|Section|Clause|Part|Chapter)\s+\d+[\.\s]", re.IGNORECASE),
    re.compile(r"^\s*\d+(\.\d+)*\.?\s+[A-Z]"),
    # Roman numeral sections: "I.", "II.", "III."
    re.compile(r"^\s*[IVXLCDM]+\.\s+[A-Z]"),
    # ALL-CAPS short lines (≤ 80 chars) that look like headings
    re.compile(r"^\s*[A-Z][A-Z\s\-:]{4,79}\s*$"),
    # Numbered list items that are likely headings: "(1)", "(a)"
    re.compile(r"^\s*\([a-zA-Z0-9]+\)\s+[A-Z]"),
]

_MIN_CHUNK_CHARS = 150   # Merge chunks shorter than this into the previous
_MAX_CHUNK_CHARS = 3000  # Hard-split chunks longer than this


def _is_heading(line: str) -> bool:
    """Return True if *line* looks like a structural heading."""
    stripped = line.strip()
    if not stripped or len(stripped) < 3:
        return False
    return any(p.match(stripped) for p in _HEADING_PATTERNS)


def _clean(text: str) -> str:
    """Normalise whitespace without destroying paragraph structure."""
    # Collapse runs of spaces/tabs but keep newlines
    text = re.sub(r"[ \t]+", " ", text)
    # Collapse 3+ blank lines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Core parsing logic
# ---------------------------------------------------------------------------

def parse_pdf(pdf_path: str | Path) -> list[Chunk]:
    """
    Parse *pdf_path* and return a list of :class:`Chunk` objects.

    Strategy
    --------
    1. Extract text block-by-block from each page, keeping page numbers.
    2. Walk through lines; whenever we hit a detected heading boundary,
       close the current chunk and start a new one.
    3. Post-process: merge tiny orphan chunks into the preceding chunk,
       and hard-split oversized chunks.
    """
    pdf_path = Path(pdf_path)
    source_file = pdf_path.name

    doc = fitz.open(str(pdf_path))

    # Stage 1: collect (page_number, line_text) pairs
    lines: list[tuple[int, str]] = []
    for page_index, page in enumerate(doc, start=1):
        page_text = page.get_text("text")  # plain text, preserves layout
        for line in page_text.splitlines():
            lines.append((page_index, line))

    doc.close()

    # Stage 2: split into raw chunks on structural boundaries
    raw_chunks: list[dict] = []
    current_lines: list[str] = []
    current_page: int = lines[0][0] if lines else 1
    current_heading: Optional[str] = None

    def _flush():
        nonlocal current_lines, current_page, current_heading
        text = _clean("\n".join(current_lines))
        if text:
            raw_chunks.append(
                {
                    "text": text,
                    "page_number": current_page,
                    "section_heading": current_heading,
                }
            )
        current_lines = []

    for page_num, line in lines:
        if _is_heading(line):
            _flush()
            current_page = page_num
            current_heading = line.strip()
            current_lines = [line]
        else:
            current_lines.append(line)
            # Track the page of the first non-empty line in this chunk
            if not any(l.strip() for l in current_lines[:-1]):
                current_page = page_num

    _flush()  # flush last chunk

    # Stage 3: merge tiny chunks into previous; hard-split oversized chunks
    merged: list[dict] = []
    for chunk in raw_chunks:
        if merged and len(chunk["text"]) < _MIN_CHUNK_CHARS:
            merged[-1]["text"] += "\n\n" + chunk["text"]
        else:
            merged.append(chunk)

    final_chunks: list[dict] = []
    for chunk in merged:
        text = chunk["text"]
        if len(text) <= _MAX_CHUNK_CHARS:
            final_chunks.append(chunk)
        else:
            # Split on paragraph boundaries first, then hard-split
            paragraphs = re.split(r"\n{2,}", text)
            sub = ""
            for para in paragraphs:
                if len(sub) + len(para) + 2 > _MAX_CHUNK_CHARS and sub:
                    final_chunks.append(
                        {
                            "text": sub.strip(),
                            "page_number": chunk["page_number"],
                            "section_heading": chunk["section_heading"],
                        }
                    )
                    sub = para
                else:
                    sub = (sub + "\n\n" + para) if sub else para
            if sub.strip():
                final_chunks.append(
                    {
                        "text": sub.strip(),
                        "page_number": chunk["page_number"],
                        "section_heading": chunk["section_heading"],
                    }
                )

    # Stage 3.5: Add overlap between adjacent chunks to improve retrieval context
    _OVERLAP_CHARS = 200
    for i in range(1, len(final_chunks)):
        prev_text = final_chunks[i-1]["text"]
        if len(prev_text) > _OVERLAP_CHARS:
            overlap = prev_text[-_OVERLAP_CHARS:]
            # Try to start after a period for a clean sentence boundary
            last_period = overlap.find(". ")
            if last_period != -1 and last_period < len(overlap) - 2:
                overlap = overlap[last_period + 2:]
            else:
                # Fallback to just the first space to avoid cutting words
                overlap = overlap.split(" ", 1)[-1]
        else:
            overlap = prev_text
        
        if overlap.strip():
            final_chunks[i]["text"] = f"...{overlap.strip()}\n\n{final_chunks[i]['text']}"

    # Stage 4: assign sequential chunk_index and build Chunk objects
    return [
        Chunk(
            text=c["text"],
            source_file=source_file,
            page_number=c["page_number"],
            section_heading=c["section_heading"],
            chunk_index=i,
        )
        for i, c in enumerate(final_chunks)
    ]
