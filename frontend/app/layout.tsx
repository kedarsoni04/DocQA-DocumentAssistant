import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocQA — AI Document Q&A",
  description:
    "Upload a legal or medical PDF and ask questions. Every answer is grounded in cited source text — no hallucinated claims.",
  keywords: ["RAG", "document QA", "legal AI", "medical AI", "PDF Q&A"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
