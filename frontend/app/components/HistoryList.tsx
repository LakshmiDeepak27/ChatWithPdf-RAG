"use client";

import React from "react";
import { FileText, MessageSquare, Trash2, Clock, CheckCircle2, PlusCircle } from "lucide-react";

export interface SerializedMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}

export interface ChatSession {
  documentId: string;
  filename: string;
  fileSize?: number;
  totalChunks?: number;
  createdAt: string;
  updatedAt: string;
  messages: SerializedMessage[];
}

interface HistoryListProps {
  sessions: ChatSession[];
  activeDocumentId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (documentId: string) => void;
  onClearHistory: () => void;
  onNewUpload: () => void;
}

export default function HistoryList({
  sessions,
  activeDocumentId,
  onSelectSession,
  onDeleteSession,
  onClearHistory,
  onNewUpload,
}: HistoryListProps) {
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Recently";
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-border-theme rounded-2xl shadow-xs">
        <div className="p-3 bg-bg-primary rounded-xl text-accent-primary mb-3 border border-border-theme">
          <Clock className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-text-primary">No Chat History Yet</h4>
        <p className="text-xs text-text-muted mt-1 max-w-[220px] leading-relaxed">
          Uploaded documents and Q&A conversations are automatically saved here.
        </p>
        <button
          onClick={onNewUpload}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary text-black rounded-lg text-xs font-semibold hover:opacity-90 transition cursor-pointer shadow-xs"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Upload Document
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between pb-1">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
          Saved Sessions ({sessions.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewUpload}
            className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-elevated text-text-primary border border-border-theme hover:border-accent-primary/50 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <PlusCircle className="w-3 h-3 text-accent-primary" />
            New
          </button>
          <button
            onClick={onClearHistory}
            className="text-xs text-text-muted hover:text-[#E47777] transition px-1 py-0.5 cursor-pointer"
            title="Clear all saved history"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Session Cards List */}
      <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
        {sessions.map((session) => {
          const isActive = session.documentId === activeDocumentId;
          const questionCount = session.messages.filter((m) => m.sender === "user").length;

          return (
            <div
              key={session.documentId}
              onClick={() => onSelectSession(session)}
              className={`group p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                isActive
                  ? "bg-surface border-accent-primary shadow-xs ring-1 ring-accent-primary/30"
                  : "bg-surface/60 hover:bg-surface border-border-theme hover:border-border-theme"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div
                  className={`p-2 rounded-lg shrink-0 mt-0.5 transition-colors ${
                    isActive
                      ? "bg-accent-primary text-black"
                      : "bg-bg-primary text-accent-primary border border-border-theme group-hover:border-accent-primary/40"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-xs text-text-primary truncate max-w-[190px]">
                      {session.filename}
                    </p>
                    {isActive && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-bold bg-accent-primary text-black rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 mt-1 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(session.updatedAt || session.createdAt)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {questionCount}
                    </span>
                    {session.fileSize && (
                      <>
                        <span>•</span>
                        <span>{formatSize(session.fileSize)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.documentId);
                  }}
                  className="p-1.5 text-text-muted hover:text-[#E47777] hover:bg-[#E47777]/10 rounded-lg transition cursor-pointer"
                  title="Delete from history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
