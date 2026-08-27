"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface ChatPanelProps {
  docId: string | null;
  onCitationClick: (page: number) => void;
}

export interface ChatPanelHandle {
  /** Programmatically submit a question */
  ask: (question: string) => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Lazy import to avoid SSR issues
const MessageBubbleLazy = React.lazy(() => import("./MessageBubble"));

/**
 * Full chat panel: scrollable message thread + input bar.
 * Disabled until a document is uploaded (docId != null).
 */
const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  ({ docId, onCitationClick }, ref) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
      scrollToBottom();
    }, [messages, loading, scrollToBottom]);

    const sendMessage = useCallback(
      async (question: string) => {
        if (!question.trim() || !docId || loading) return;

        const userMsg: Message = {
          id: `u-${Date.now()}`,
          role: "user",
          content: question.trim(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setError("");
        setLoading(true);

        try {
          const res = await fetch(`${API_BASE}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: question.trim(), doc_id: docId }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail ?? `Request failed (${res.status})`);
          }

          const data = await res.json();
          const assistantMsg: Message = {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: data.answer,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
          setLoading(false);
        }
      },
      [docId, loading]
    );

    // Expose ask() to parent for programmatic use
    useImperativeHandle(ref, () => ({ ask: sendMessage }), [sendMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    };

    const isDisabled = !docId || loading;

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-slate-800">
              <span className="text-gradient">DocQA</span> — Document Assistant
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Every answer is grounded in cited source text
            </p>
          </div>
          {docId && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ready
            </span>
          )}
        </div>

        {/* Message thread */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4"
          id="chat-thread"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.length === 0 && !docId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-16">
              <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center shadow-lg">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-700">No document loaded</p>
                <p className="text-sm text-slate-400 mt-1">
                  Upload a PDF on the left to start asking questions.
                </p>
              </div>
            </div>
          )}

          {messages.length === 0 && docId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Document ready!</p>
                <p className="text-sm text-slate-400 mt-1">
                  Ask anything about the document below.
                </p>
              </div>
              {/* Quick-start suggestions */}
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "What is the main purpose of this document?",
                  "Who are the parties involved?",
                  "What are the key terms and conditions?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <React.Suspense fallback={null}>
              {messages.map((msg) => (
                <MessageBubbleLazy
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  onCitationClick={onCitationClick}
                />
              ))}
            </React.Suspense>
          )}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div className="message-assistant px-4 py-3.5 flex items-center gap-1.5">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
              </div>
            </div>
          )}

          {/* Error toast */}
          {error && (
            <div className="animate-fade-in flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <div
            className={`flex items-end gap-2 rounded-2xl border transition-all ${
              isDisabled
                ? "border-slate-200 bg-slate-50"
                : "border-slate-300 bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgb(99_102_241_/_0.1)]"
            }`}
          >
            <textarea
              ref={inputRef}
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                docId
                  ? "Ask a question about the document… (Enter to send)"
                  : "Upload a PDF to start asking questions"
              }
              disabled={isDisabled}
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none disabled:cursor-not-allowed"
              style={{ maxHeight: "120px", overflowY: "auto" }}
              aria-label="Question input"
              aria-disabled={isDisabled}
            />
            <button
              id="send-btn"
              onClick={() => sendMessage(input)}
              disabled={isDisabled || !input.trim()}
              className="btn-primary mr-2 mb-2 px-4 py-2 text-xs"
              aria-label="Send question"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Shift+Enter for newline · citations link to document pages
          </p>
        </div>
      </div>
    );
  }
);

ChatPanel.displayName = "ChatPanel";
export default ChatPanel;
