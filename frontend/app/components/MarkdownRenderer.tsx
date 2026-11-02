"use client";

import React from "react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Parses inline formatting like `code`, ***bold italic***, **bold**, and *italic*
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match: inline code, bold-italic, bold, single-star italic, and underscore italic
  const regex =
    /(`[^`\n]+`|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|(?<!\*)\*(?!\*)[^*\n]+(?<!\*)\*|(?<!_)_[^_\n]+(?<!_)_)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <React.Fragment key={`txt-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </React.Fragment>
      );
    }

    const token = match[0];
    const key = `inline-${match.index}`;

    if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      nodes.push(
        <code
          key={key}
          className="px-1.5 py-0.5 mx-0.5 text-xs bg-surface text-accent-primary rounded-md font-mono border border-border-theme"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("***") && token.endsWith("***") && token.length >= 6) {
      nodes.push(
        <strong key={key} className="font-bold text-text-primary italic">
          {token.slice(3, -3)}
        </strong>
      );
    } else if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      nodes.push(
        <strong key={key} className="font-semibold text-text-primary">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      nodes.push(
        <em key={key} className="italic text-text-secondary">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("_") && token.endsWith("_") && token.length >= 2) {
      nodes.push(
        <em key={key} className="italic text-text-secondary">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      nodes.push(<React.Fragment key={key}>{token}</React.Fragment>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <React.Fragment key={`txt-${lastIndex}`}>
        {text.slice(lastIndex)}
      </React.Fragment>
    );
  }

  return nodes;
}

/**
 * Pre-processes lines to heal malformed LLM outputs:
 * 1. Merges orphaned numbers ("1." on one line, title on next).
 * 2. Normalizes lines starting with "*Title" without spaces to bold titles.
 */
function healLines(rawContent: string): string[] {
  const rawLines = rawContent.split("\n");
  const result: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // Check if line is just an orphaned number: "1." or "2)"
    const numMatch = trimmed.match(/^(\d+[\.\)])\s*$/);
    if (numMatch && i + 1 < rawLines.length) {
      let nextLine = rawLines[i + 1].trim();
      if (nextLine) {
        // If next line starts with single asterisk attached to word like "*MiniShell"
        if (/^\*[A-Za-z0-9]/.test(nextLine)) {
          nextLine = nextLine.replace(/^\*([^*\n]+?)\*?$/, "**$1**");
        } else if (/^[\*\-]\s+/.test(nextLine)) {
          nextLine = nextLine.replace(/^[\*\-]\s+/, "");
        }
        result.push(`${numMatch[1]} ${nextLine}`);
        i++; // skip next line because it was merged
        continue;
      }
    }

    // Check if line starts with single asterisk attached to a title like "*Key Details:"
    if (/^\*[A-Za-z0-9]/.test(trimmed)) {
      result.push(trimmed.replace(/^\*([^*\n]+?)\*?$/, "**$1**"));
      continue;
    }

    result.push(rawLine);
  }

  return result;
}

/**
 * Robust, lightweight Markdown renderer for LucidChat AI responses.
 * Renders bold, italics, bullets, headers, numbered lists, tables, code blocks, blockquotes, and paragraphs cleanly.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  const lines = healLines(content);

  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 space-y-1.5 list-none pl-0.5">
          {currentList}
        </ul>
      );
      currentList = [];
    }
  };

  const flushTable = () => {
    if (inTable && (tableHeader.length > 0 || tableRows.length > 0)) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto rounded-xl border border-border-theme">
          <table className="w-full text-left text-xs border-collapse">
            {tableHeader.length > 0 && (
              <thead className="bg-surface font-semibold text-text-primary border-b border-border-theme">
                <tr>
                  {tableHeader.map((th, thIdx) => (
                    <th key={`th-${thIdx}`} className="px-3.5 py-2.5 font-bold text-accent-primary">
                      {renderInlineFormatting(th)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-border-theme/60 bg-surface/40">
              {tableRows.map((row, rIdx) => (
                <tr key={`tr-${rIdx}`} className="hover:bg-surface/80 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={`td-${cIdx}`} className="px-3.5 py-2 text-text-secondary">
                      {renderInlineFormatting(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      inTable = false;
      tableHeader = [];
      tableRows = [];
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      elements.push(
        <div
          key={`codeblock-${elements.length}`}
          className="my-2.5 rounded-xl border border-border-theme overflow-hidden bg-surface"
        >
          {codeBlockLang && (
            <div className="px-3 py-1 text-[11px] font-mono text-text-muted bg-surface/80 border-b border-border-theme">
              {codeBlockLang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed text-text-primary">
            <code>{codeBlockLines.join("\n")}</code>
          </pre>
        </div>
      );
      inCodeBlock = false;
      codeBlockLines = [];
      codeBlockLang = "";
    }
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();

    // Code block toggle (```)
    if (trimmed.startsWith("```")) {
      flushList();
      flushTable();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushList();
      flushTable();
      continue;
    }

    // Horizontal Rule (--- or *** or ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      flushTable();
      elements.push(
        <hr key={`hr-${lineIdx}`} className="my-3 border-t border-border-theme" />
      );
      continue;
    }

    // Table rows (| col 1 | col 2 |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));

      if (isSeparator) {
        inTable = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Bullet item (* or -)
    if (/^[\*\-]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[\*\-]\s+/, "");
      const isNested = /^\s{2,}/.test(rawLine);

      currentList.push(
        <li
          key={`li-${lineIdx}`}
          className={`flex items-start gap-2.5 text-sm text-text-secondary ${
            isNested ? "ml-5 pl-2 my-1" : "my-1.5"
          }`}
        >
          <span
            className={`rounded-full shrink-0 shadow-xs ${
              isNested
                ? "w-1 h-1 bg-text-muted mt-2.5"
                : "w-1.5 h-1.5 bg-accent-primary mt-2"
            }`}
          />
          <span className="flex-1 leading-relaxed">{renderInlineFormatting(itemText)}</span>
        </li>
      );
      continue;
    }

    // Numbered item (1. or 2.)
    if (/^\d+[\.\)]\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
      if (match) {
        flushList();
        elements.push(
          <div
            key={`num-${lineIdx}`}
            className="flex items-start gap-2.5 my-2 text-sm text-text-secondary"
          >
            <span className="font-bold text-accent-primary text-xs mt-0.5 shrink-0 min-w-[1.4rem]">
              {match[1]}.
            </span>
            <div className="flex-1 leading-relaxed">
              {renderInlineFormatting(match[2])}
            </div>
          </div>
        );
        continue;
      }
    }

    // Blockquote (> text)
    if (trimmed.startsWith(">")) {
      flushList();
      const quoteText = trimmed.replace(/^>\s*/, "");
      elements.push(
        <blockquote
          key={`quote-${lineIdx}`}
          className="border-l-2 border-accent-primary pl-3 my-2 text-sm italic text-text-muted"
        >
          {renderInlineFormatting(quoteText)}
        </blockquote>
      );
      continue;
    }

    // Header (### or ## or #)
    if (/^#{1,3}\s+/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^#+/)?.[0].length || 3;
      const headerText = trimmed.replace(/^#+\s+/, "");
      elements.push(
        <h4
          key={`h-${lineIdx}`}
          className={`font-bold text-text-primary mt-4 mb-2 tracking-tight ${
            level === 1
              ? "text-base font-extrabold text-accent-primary"
              : level === 2
              ? "text-sm font-bold text-accent-primary"
              : "text-sm font-semibold"
          }`}
        >
          {renderInlineFormatting(headerText)}
        </h4>
      );
      continue;
    }

    // Normal paragraph line
    flushList();
    elements.push(
      <p key={`p-${lineIdx}`} className="my-1.5 text-sm leading-relaxed text-text-secondary">
        {renderInlineFormatting(trimmed)}
      </p>
    );
  }

  flushList();
  flushTable();
  flushCodeBlock();

  return <div className="space-y-1">{elements}</div>;
}
