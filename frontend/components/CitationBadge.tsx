"use client";

import React from "react";

interface CitationBadgeProps {
  pageNumber: number;
  onCitationClick: (page: number) => void;
}

/**
 * Inline clickable citation badge rendered as [p.N].
 * Clicking triggers the PDF viewer to scroll to that page.
 */
export default function CitationBadge({
  pageNumber,
  onCitationClick,
}: CitationBadgeProps) {
  return (
    <button
      className="citation-badge"
      onClick={() => onCitationClick(pageNumber)}
      title={`Jump to page ${pageNumber}`}
      aria-label={`Citation: page ${pageNumber}`}
      id={`citation-p${pageNumber}`}
    >
      p.{pageNumber}
    </button>
  );
}
