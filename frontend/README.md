# DocQA — AI Document Q&A

A Retrieval-Augmented Generation (RAG) system for querying legal and medical PDFs safely — every answer is grounded in cited source text, with clickable citations that jump straight to the page they came from. Built to avoid hallucination, not just reduce it: if the answer isn't in the document, the system says so instead of guessing.

## 📸 Preview

![DocQA Interface](../assets/screenshot.png)

## 🔗 Quick Links

- **Live Frontend App**: [https://doc-qa-document-assistant.vercel.app/](https://doc-qa-document-assistant.vercel.app/)
- **Live Backend API**: [https://docqa-documentassistant.onrender.com](https://docqa-documentassistant.onrender.com)
- **Interactive API Docs (Swagger UI)**: [https://docqa-documentassistant.onrender.com/docs](https://docqa-documentassistant.onrender.com/docs)
- **GitHub Repository**: [kedarsoni04/DocQA-DocumentAssistant](https://github.com/kedarsoni04/DocQA-DocumentAssistant)

## Why this exists

Legal and medical documents are exactly where a confidently wrong AI answer does real damage. DocQA is built around one rule: **no claim without a citation, and no citation without a matching chunk of real source text.**

## Features

- 📄 Upload a PDF, ask questions in plain language
- 🔗 Every factual sentence carries an inline `[p.N]` citation
- 🖱️ Click a citation → PDF viewer jumps to that exact page
- 🚫 Explicit "not found in document" response instead of a fabricated answer
- ✅ Citation-compliance check with automatic retry if a response comes back uncited

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI |
| Frontend | Next.js 16 + React 19 + Tailwind v4 |
| PDF parsing | PyMuPDF, structural chunking with sentence-boundary-aware overlap |
| Vector store | Chroma |
| Embeddings | Voyage AI (`voyage-4-lite`, asymmetric document/query) |
| Generation | Groq (`llama-3.3-70b-versatile`) |
| PDF viewer | pdf.js |

## Repository Layout

```
rag-document-qasystem/
├── backend/
│   ├── .env.example               ← copy to .env, fill in API keys
│   ├── config.py                  ← pydantic-settings, retrieval k=7
│   ├── main.py                    ← FastAPI: /upload /query /document /health
│   ├── ingestion/
│   │   ├── parser.py              ← PyMuPDF structural chunker + overlap window
│   │   └── embedder.py            ← Voyage AI embedding + Chroma store
│   ├── query/
│   │   ├── retriever.py           ← dense k=7 retrieval
│   │   └── generator.py           ← Groq strict grounding prompt + citation retry
│   └── requirements.txt
└── frontend/
    ├── .env.local.example         ← copy to .env.local
    ├── app/
    │   ├── globals.css            ← Modern SaaS indigo design system
    │   ├── layout.tsx             ← Inter font, SEO metadata
    │   └── page.tsx               ← 3-panel layout (Upload | Chat | PDF)
    └── components/
        ├── UploadPanel.tsx        ← drag-and-drop, progress bar
        ├── ChatPanel.tsx          ← message thread, input, quick-start prompts
        ├── MessageBubble.tsx      ← parses [p.N] → CitationBadge inline
        ├── CitationBadge.tsx      ← clickable indigo pill → scrolls PDF
        └── PDFViewer.tsx          ← pdf.js, scrollToPage(), zoom, nav
```

## Setup

### 1. Get your API keys (both free)

- **Groq** — [console.groq.com](https://console.groq.com), no card required
- **Voyage AI** — [voyageai.com](https://voyageai.com) (sign-up runs through MongoDB Atlas), 200M free tokens per key

### 2. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env → GROQ_API_KEY and VOYAGE_API_KEY
uvicorn main:app --reload --port 8000
```

API docs (Swagger UI): http://localhost:8000/docs

### 3. Frontend

```powershell
cd frontend
copy .env.local.example .env.local
npm run dev
```

Open: http://localhost:3000

## How It Works

**1. Upload** → `POST /upload`
- PyMuPDF extracts text block-by-block, page numbers preserved
- Structural chunking on numbered clauses, headings, roman numerals, ALL-CAPS
- 200-character sentence-boundary-aware overlap between adjacent chunks, so closely-related content (e.g. a drug recommendation and its dosage in the next section) doesn't get separated across retrieval
- Metadata per chunk: `source_file`, `page_number`, `section_heading`, `chunk_index`
- Embedded via Voyage AI (`input_type=document`), stored in Chroma

**2. Ask a question** → `POST /query`
- Question embedded via Voyage AI (`input_type=query`)
- Chroma cosine similarity search → top 7 chunks
- Groq answers strictly from retrieved context, with:
  - "Not found in document" if the answer genuinely isn't there
  - Mandatory `[p.N]` citation on every factual sentence
  - A one-time automatic retry if the first response comes back missing citations; falls back to `(Unverified: citations missing)` if the retry also fails
- Returns `{answer, cited_pages, chunks}`

**3. Frontend renders**
- `[p.N]` tags parsed via regex → `CitationBadge` components inline
- Click badge → `PDFViewer.scrollToPage(N)` via React ref
- pdf.js renders the page with a brief indigo outline flash

## Testing

A synthetic 3-page test PDF (clinical guideline on acute bacterial sinusitis, with numbered sections and a pediatric dosing table) is available for fast iteration before testing against larger real-world documents like the WHO Guidelines for the Treatment of Malaria.

Suggested test queries:
- **In-doc factual** — should return a fully cited answer
- **Table-based** — checks whether structured data parses and retrieves correctly
- **Adjacent/cross-chunk** — checks whether the overlap window keeps related content together
- **Out-of-scope but plausible-sounding** — checks the model stays grounded rather than pattern-matching from general knowledge
- **Completely unrelated** — should trigger "not found in document"

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Structural chunking + overlap | Legal/medical docs have meaningful section boundaries, but closely related content can still span chunks — overlap keeps that context connected |
| Citation enforcement + retry | More reliable than trusting the first pass or post-processing after the fact |
| Voyage AI over local/other hosted embeddings | Predictable one-time free token allowance vs. rate-limited live balances (see provider history below) |
| Chroma wiped on each upload | Single-document scope for this phase — no multi-doc support yet |
| `temperature=0.1` | Minimizes variance in factual extraction; not zero, to avoid degenerate repetition |
| pdf.js via CDN | Avoids a heavy webpack dependency |

### Provider history

The embedding/generation providers changed a few times during development:
`OpenAI + Anthropic` → `Gemini` (blocked by a persistent 403 project-access error) → `Groq + local sentence-transformers` (too slow on CPU) → `Groq + Jina` (blocked by a 0-token balance issue) → **`Groq + Voyage AI`** (current).

## Roadmap

- [ ] Hybrid search (BM25 + dense retrieval)
- [ ] NLI-based verification pass to catch any remaining uncited/unsupported sentences
- [ ] Multi-document support
- [ ] Jurisdiction/version tagging for legal documents