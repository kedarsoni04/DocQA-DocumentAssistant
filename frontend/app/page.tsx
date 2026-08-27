"use client";

import dynamic from "next/dynamic";
import React, { useCallback, useRef, useState } from "react";
import { PDFViewerHandle } from "@/components/PDFViewer";

// Dynamically import to avoid SSR issues with pdf.js
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  ),
});
const UploadPanel = dynamic(() => import("@/components/UploadPanel"), { ssr: false });
const ChatPanel = dynamic(() => import("@/components/ChatPanel"), { ssr: false });

interface DocumentInfo {
  doc_id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
}

export default function HomePage() {
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const pdfViewerRef = useRef<PDFViewerHandle>(null);

  const handleCitationClick = useCallback((page: number) => {
    pdfViewerRef.current?.scrollToPage(page);
  }, []);

  const handleDocumentReady = useCallback((info: DocumentInfo) => {
    setDocInfo(info);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      {/* Top nav bar */}
      <header className="h-12 flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50 flex items-center px-6 gap-3">
        <div className="w-6 h-6 rounded gradient-brand flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <span className="font-bold text-slate-800 text-sm">
          Doc<span className="text-gradient">QA</span>
        </span>
        <span className="text-slate-300 text-xs">·</span>
        <span className="text-xs text-slate-400">
          AI-grounded document Q&amp;A
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">Powered by</span>
          <span className="text-xs font-semibold text-slate-600">Groq</span>
          <span className="text-slate-300">+</span>
          <span className="text-xs font-semibold text-slate-600">Voyage AI Embeddings</span>
        </div>
      </header>

      {/* Three-column main layout */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left panel — Upload */}
        <aside
          className="w-72 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-5"
          id="upload-panel"
          aria-label="Document upload"
        >
          <UploadPanel onDocumentReady={handleDocumentReady} />
        </aside>

        {/* Center panel — Chat */}
        <section
          className="flex-1 flex flex-col bg-slate-50 min-w-0 border-r border-slate-200"
          id="chat-panel"
          aria-label="Chat interface"
        >
          <ChatPanel
            docId={docInfo?.doc_id ?? null}
            onCitationClick={handleCitationClick}
          />
        </section>

        {/* Right panel — PDF Viewer */}
        <aside
          className="w-[38%] flex-shrink-0 bg-white flex flex-col overflow-hidden"
          id="pdf-viewer-panel"
          aria-label="PDF viewer"
        >
          <PDFViewer
            ref={pdfViewerRef}
            docId={docInfo?.doc_id ?? null}
          />
        </aside>
      </main>
    </div>
  );
}
