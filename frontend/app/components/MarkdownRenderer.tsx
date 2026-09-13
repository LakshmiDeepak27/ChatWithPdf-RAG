"use client";

import React from "react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Parses inline formatting like **bold**, *italic*, and `code`
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Regex to split on bold (**...**), inline code (`...`), or italic (*...*)
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);

  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 mx-0.5 text-xs bg-gray-800 text-indigo-300 rounded font-mono border border-gray-700"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      return (
        <em key={index} className="italic text-gray-200">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  });
}

/**
 * Robust, lightweight Markdown renderer for AI assistant responses.
 * Renders bold, bullets, headers, numbered lists, and paragraphs cleanly.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Normalize inline bullet patterns (e.g. "Text: * Item 1 * Item 2" -> separated lines)
  const normalized = content.replace(/([^\n])\s*\*\s+/g, "$1\n* ");

  // Split into lines
  const lines = normalized.split("\n");

  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 space-y-1.5 list-none pl-1">
          {currentList}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    // Bullet item (* or -)
    if (/^[\*\-]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[\*\-]\s+/, "");
      currentList.push(
        <li key={`li-${lineIdx}`} className="flex items-start gap-2 text-sm text-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
          <span className="flex-1 leading-relaxed">{renderInlineFormatting(itemText)}</span>
        </li>
      );
      return;
    }

    // Numbered item (1. 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (match) {
        flushList();
        elements.push(
          <div key={`num-${lineIdx}`} className="flex items-start gap-2 my-1.5 text-sm text-gray-200">
            <span className="font-semibold text-indigo-400 text-xs mt-0.5 shrink-0 min-w-[1.2rem]">
              {match[1]}.
            </span>
            <span className="flex-1 leading-relaxed">{renderInlineFormatting(match[2])}</span>
          </div>
        );
        return;
      }
    }

    // Header (### or ## or #)
    if (/^#{1,3}\s+/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^#+/)?.[0].length || 3;
      const headerText = trimmed.replace(/^#+\s+/, "");
      elements.push(
        <h4
          key={`h-${lineIdx}`}
          className={`font-bold text-white mt-3 mb-1.5 ${
            level === 1 ? "text-base" : level === 2 ? "text-sm" : "text-sm"
          }`}
        >
          {renderInlineFormatting(headerText)}
        </h4>
      );
      return;
    }

    // Normal paragraph line
    flushList();
    elements.push(
      <p key={`p-${lineIdx}`} className="my-1 text-sm leading-relaxed text-gray-200">
        {renderInlineFormatting(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-1">{elements}</div>;
}
