"use client";

import React from "react";
import CitationBadge from "./CitationBadge";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  onCitationClick: (page: number) => void;
}

/**
 * Renders a chat message bubble.
 *
 * For assistant messages, parses [p.N] tags in the text and replaces them
 * with clickable <CitationBadge> components inline.
 *
 * Handles multiple citations on one sentence, e.g. [p.3][p.7].
 */
export default function MessageBubble({
  role,
  content,
  onCitationClick,
}: MessageBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div
          className="message-user px-4 py-3 max-w-[85%] text-sm leading-relaxed"
          role="article"
          aria-label="Your message"
        >
          {content}
        </div>
      </div>
    );
  }

  // Parse assistant message — split on [p.N] citation tags
  const renderWithCitations = (text: string) => {
    const parts = text.split(/(\[p\.\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[p\.(\d+)\]$/);
      if (match) {
        return (
          <CitationBadge
            key={`${i}-p${match[1]}`}
            pageNumber={parseInt(match[1], 10)}
            onCitationClick={onCitationClick}
          />
        );
      }
      // Render plain text, preserving line breaks
      return part.split("\n").map((line, j) => (
        <React.Fragment key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </React.Fragment>
      ));
    });
  };

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="flex gap-3 max-w-[92%]">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <div
          className="message-assistant px-4 py-3 text-sm leading-relaxed"
          role="article"
          aria-label="AI answer"
        >
          {renderWithCitations(content)}
        </div>
      </div>
    </div>
  );
}
