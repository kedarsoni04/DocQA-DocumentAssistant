"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface PDFViewerProps {
  docId: string | null;
}

export interface PDFViewerHandle {
  scrollToPage: (page: number) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PDFJS_VERSION = "3.11.174";

/**
 * PDF viewer powered by pdf.js loaded from CDN.
 *
 * Exposes scrollToPage(n) via imperative handle so the parent can
 * navigate to a cited page when the user clicks a citation badge.
 */
const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(
  ({ docId }, ref) => {
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const pdfDocRef = useRef<unknown>(null);
    const renderingRef = useRef(false);
    const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load pdf.js from CDN if not already loaded
    const loadPdfJs = (): Promise<typeof window.pdfjsLib> => {
      return new Promise((resolve, reject) => {
        if (window.pdfjsLib) {
          resolve(window.pdfjsLib);
          return;
        }
        const script = document.createElement("script");
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
        script.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
          resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error("Failed to load pdf.js"));
        document.head.appendChild(script);
      });
    };

    const renderPage = async (pageNum: number, pdfDoc?: unknown) => {
      const doc = (pdfDoc ?? pdfDocRef.current) as {
        getPage: (n: number) => Promise<{
          getViewport: (opts: { scale: number }) => { width: number; height: number };
          render: (ctx: unknown) => { promise: Promise<void> };
        }>;
      } | null;

      if (!doc || renderingRef.current) return;
      if (!canvasContainerRef.current) return;

      renderingRef.current = true;

      try {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const container = canvasContainerRef.current;

        // Remove old canvases
        container.innerHTML = "";

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "rounded-lg shadow-md mx-auto block";
        canvas.setAttribute("aria-label", `Page ${pageNum}`);
        container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        setCurrentPage(pageNum);
      } finally {
        renderingRef.current = false;
      }
    };

    // Load PDF when docId changes
    useEffect(() => {
      if (!docId) {
        pdfDocRef.current = null;
        setTotalPages(0);
        setCurrentPage(1);
        if (canvasContainerRef.current) canvasContainerRef.current.innerHTML = "";
        return;
      }

      let cancelled = false;

      const load = async () => {
        setLoading(true);
        setError("");

        try {
          const pdfjsLib = await loadPdfJs();
          const url = `${API_BASE}/document/${docId}`;
          const loadingTask = pdfjsLib.getDocument(url);
          const pdf = await loadingTask.promise;

          if (cancelled) return;

          pdfDocRef.current = pdf;
          setTotalPages(pdf.numPages);
          await renderPage(1, pdf);
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load PDF.");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      load();
      return () => {
        cancelled = true;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docId]);

    // Re-render on scale change
    useEffect(() => {
      if (pdfDocRef.current) renderPage(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scale]);

    // Expose scrollToPage via ref
    useImperativeHandle(ref, () => ({
      scrollToPage: async (page: number) => {
        if (!pdfDocRef.current) return;
        const clamped = Math.max(1, Math.min(page, totalPages));
        await renderPage(clamped);

        // Brief highlight flash on the canvas
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        const canvas = canvasContainerRef.current?.querySelector("canvas");
        if (canvas) {
          canvas.style.outline = "3px solid #4f46e5";
          canvas.style.outlineOffset = "2px";
          highlightTimeoutRef.current = setTimeout(() => {
            if (canvas) canvas.style.outline = "none";
          }, 1500);
        }

        canvasContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }));

    const goToPage = (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      renderPage(clamped);
    };

    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-brand flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-slate-600">PDF Viewer</span>
          </div>

          {totalPages > 0 && (
            <div className="flex items-center gap-2">
              {/* Scale controls */}
              <button
                onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
                className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-500"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <span className="text-xs text-slate-400 w-10 text-center">{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale((s) => Math.min(3, s + 0.2))}
                className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-500"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4" id="pdf-canvas-container">
          {!docId && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-16 h-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="text-sm text-slate-400 font-medium">Document preview</p>
              <p className="text-xs text-slate-300">
                Upload a PDF to see it here.
                <br />
                Citations will auto-scroll to the right page.
              </p>
            </div>
          )}

          {loading && (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-sm text-slate-400">Loading PDF…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              {error}
            </div>
          )}

          <div ref={canvasContainerRef} className="min-h-full" />
        </div>

        {/* Page navigation */}
        {totalPages > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
            <button
              id="pdf-prev-page"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Prev
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Page</span>
              <input
                id="pdf-page-input"
                type="number"
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
                min={1}
                max={totalPages}
                className="w-12 text-center text-xs border border-slate-200 rounded-lg py-1 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                aria-label="Current page number"
              />
              <span className="text-xs text-slate-400">of {totalPages}</span>
            </div>

            <button
              id="pdf-next-page"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              Next
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}
      </div>
    );
  }
);

PDFViewer.displayName = "PDFViewer";
export default PDFViewer;

// Extend Window for pdf.js types
declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (url: string) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
      GlobalWorkerOptions: { workerSrc: string };
    };
  }
}
