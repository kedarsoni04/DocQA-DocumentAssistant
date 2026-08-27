"use client";

import React, { useCallback, useRef, useState } from "react";

interface DocumentInfo {
  doc_id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
}

interface UploadPanelProps {
  onDocumentReady: (info: DocumentInfo) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function UploadPanel({ onDocumentReady }: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setStatus("error");
        setErrorMsg("Only PDF files are supported.");
        return;
      }

      setStatus("uploading");
      setErrorMsg("");
      setProgress(10);

      // Animate progress while waiting
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 85));
      }, 400);

      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch(`${API_BASE}/upload`, {
          method: "POST",
          body: form,
        });

        clearInterval(progressInterval);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail ?? `Upload failed (${res.status})`);
        }

        const info: DocumentInfo = await res.json();
        setProgress(100);
        setDocInfo(info);
        setStatus("done");
        onDocumentReady(info);
      } catch (err: unknown) {
        clearInterval(progressInterval);
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Upload failed.");
        setProgress(0);
      }
    },
    [onDocumentReady]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so same file can be re-uploaded
    e.target.value = "";
  };

  return (
    <aside className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center"
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2 className="font-bold text-slate-800 text-sm tracking-tight">Document</h2>
        </div>
        <p className="text-xs text-slate-500">Upload a legal or medical PDF to get started.</p>
      </div>

      {/* Upload zone */}
      {status !== "done" && (
        <div
          id="upload-dropzone"
          className={`upload-zone flex flex-col items-center justify-center gap-3 p-6 text-center min-h-[180px] ${
            isDragging ? "drag-over" : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Upload PDF — drag and drop or click to browse"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            id="pdf-file-input"
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileChange}
            aria-label="PDF file input"
          />

          {status === "idle" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Drop your PDF here</p>
                <p className="text-xs text-slate-400 mt-0.5">or click to browse</p>
              </div>
            </>
          )}

          {status === "uploading" && (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="animate-pulse-ring w-10 h-10 rounded-full gradient-brand flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600">Processing…</p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full gradient-brand rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="text-xs text-slate-400">Parsing, chunking & embedding…</p>
            </div>
          )}

          {status === "error" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-red-600">Upload failed</p>
              <p className="text-xs text-red-400">{errorMsg}</p>
              <p className="text-xs text-slate-400">Click to try again</p>
            </>
          )}
        </div>
      )}

      {/* Document info card */}
      {status === "done" && docInfo && (
        <div className="animate-fade-in rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-indigo-900 truncate">{docInfo.filename}</p>
              <p className="text-xs text-indigo-600 mt-0.5">Ready for questions</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-indigo-600">{docInfo.page_count}</p>
              <p className="text-xs text-slate-500">Pages</p>
            </div>
            <div className="bg-white rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-indigo-600">{docInfo.chunk_count}</p>
              <p className="text-xs text-slate-500">Chunks</p>
            </div>
          </div>

          <button
            id="upload-new-btn"
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2 text-left transition-colors"
            onClick={() => {
              setStatus("idle");
              setDocInfo(null);
              setProgress(0);
            }}
          >
            Upload a different document
          </button>
        </div>
      )}

      {/* Tips */}
      <div className="mt-auto rounded-xl bg-slate-50 border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Tips</p>
        <ul className="space-y-1.5">
          {[
            "Ask specific questions about clauses or sections",
            "Click any citation badge to jump to that page",
            "Answers cite every fact — no guessing",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-xs text-slate-500">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0">›</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
