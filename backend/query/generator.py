"""
Generator
=========
Takes retrieved chunks and a user question, constructs a strict
grounding prompt, and calls Groq's chat completions API to
produce a cited answer.

Every factual sentence in the answer must include an inline citation
in the form [p.<page_number>]. If the answer is not in the context,
the model is instructed to say so explicitly rather than hallucinate.

Return shape is identical to the previous implementations — nothing
in main.py or the frontend needs to change.
"""

import logging
import re
from dataclasses import dataclass

from groq import Groq

from config import settings
from query.retriever import RetrievedChunk

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Strict grounding system prompt — identical intent to the previous version
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """You are a precise, careful document assistant specializing in legal and medical documents.

STRICT RULES — follow them exactly:
1. Answer ONLY using information from the provided context chunks below.
2. If the answer to the question is NOT present in the provided context, respond with exactly:
   "This information is not found in the document."
   Do not apologize, elaborate, or guess.
3. Every factual sentence in your answer MUST end with an inline citation tag in the format [p.<page_number>], where <page_number> is the page number shown for that chunk.
4. You may cite multiple pages in one sentence if the fact spans multiple chunks: e.g., [p.3][p.7].
5. Do NOT use any external knowledge. Do NOT speculate or infer beyond what the chunks explicitly state.
6. Write in clear, professional prose. Use bullet points only if the source material is a list.
7. Be concise — do not pad answers with filler phrases.

EXAMPLE OF CORRECTLY CITED OUTPUT:
The recommended dosage for adults is 500mg twice daily [p.4]. If symptoms persist for more than 10 days, alternative therapies should be considered [p.5]."""


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    """Format retrieved chunks as a numbered context block for the prompt."""
    lines = ["## Retrieved Context\n"]
    for i, chunk in enumerate(chunks, start=1):
        heading = f" — {chunk.section_heading}" if chunk.section_heading else ""
        lines.append(
            f"### Chunk {i} [Page {chunk.page_number}{heading}]\n{chunk.text}\n"
        )
    return "\n".join(lines)


def _extract_cited_pages(answer: str) -> list[int]:
    """Parse all [p.N] citation tags from the answer text."""
    return sorted(set(int(m) for m in re.findall(r"\[p\.(\d+)\]", answer)))


@dataclass
class GeneratedAnswer:
    answer: str
    cited_pages: list[int]
    chunks_used: list[RetrievedChunk]


def generate(
    question: str,
    chunks: list[RetrievedChunk],
) -> GeneratedAnswer:
    """
    Generate a grounded answer to *question* using the provided *chunks*.

    Parameters
    ----------
    question : str
        The user's question.
    chunks : list[RetrievedChunk]
        Top-k retrieved chunks from the retriever.

    Returns
    -------
    GeneratedAnswer
        Contains the answer text, extracted page citations, and the chunks used.
        Shape is identical to the previous implementations.
    """
    if not chunks:
        return GeneratedAnswer(
            answer="This information is not found in the document.",
            cited_pages=[],
            chunks_used=[],
        )

    context_block = _build_context_block(chunks)

    user_message = f"""{context_block}

## Question
{question}

## Instructions
Answer the question using ONLY the context above. Remember: every factual sentence must end with [p.<page_number>]."""

    client = Groq(api_key=settings.groq_api_key)

    logger.info(
        "Calling Groq model '%s' for question: %.80s",
        settings.generation_model,
        question,
    )

    chat_completion = client.chat.completions.create(
        model=settings.generation_model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=settings.generation_temperature,
        max_tokens=1024,
    )

    answer = chat_completion.choices[0].message.content.strip()
    cited_pages = _extract_cited_pages(answer)

    if not cited_pages and answer != "This information is not found in the document.":
        logger.warning("No citations found in answer. Retrying generation with a strict reminder.")
        retry_message = user_message + "\n\nCRITICAL REMINDER: You MUST include inline citations like [p.N] at the end of every sentence."
        chat_completion = client.chat.completions.create(
            model=settings.generation_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": retry_message},
            ],
            temperature=settings.generation_temperature,
            max_tokens=1024,
        )
        answer = chat_completion.choices[0].message.content.strip()
        cited_pages = _extract_cited_pages(answer)
        if not cited_pages and answer != "This information is not found in the document.":
            answer += "\n\n*(Unverified: citations missing)*"

    logger.info(
        "Generated answer (%d chars), cited pages: %s",
        len(answer),
        cited_pages,
    )

    return GeneratedAnswer(
        answer=answer,
        cited_pages=cited_pages,
        chunks_used=chunks,
    )
