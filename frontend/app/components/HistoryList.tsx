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
      <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-800/40 border border-gray-800 rounded-2xl">
        <div className="p-3 bg-indigo-600/10 rounded-xl text-indigo-400 mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-gray-200">No Chat History Yet</h4>
        <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
          Uploaded PDFs and conversations are automatically saved to your account here.
        </p>
        <button
          onClick={onNewUpload}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-sm"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Upload Document
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Saved Sessions ({sessions.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewUpload}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition"
          >
            <PlusCircle className="w-3 h-3" />
            New Upload
          </button>
          <button
            onClick={onClearHistory}
            className="text-xs text-gray-500 hover:text-red-400 transition px-1 py-0.5"
            title="Clear all saved history"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Session Cards List */}
      <div className="space-y-2.5 overflow-y-auto max-h-[480px] pr-1">
        {sessions.map((session) => {
          const isActive = session.documentId === activeDocumentId;
          const questionCount = session.messages.filter((m) => m.sender === "user").length;

          return (
            <div
              key={session.documentId}
              onClick={() => onSelectSession(session)}
              className={`group p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                isActive
                  ? "bg-indigo-950/40 border-indigo-500/60 shadow-sm"
                  : "bg-gray-800/70 hover:bg-gray-800 border-gray-700/60 hover:border-gray-600"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-750 text-indigo-400 group-hover:bg-gray-700"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-xs text-white truncate max-w-[190px]">
                      {session.filename}
                    </p>
                    {isActive && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60 rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      {formatDate(session.updatedAt || session.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-gray-500" />
                      {questionCount} {questionCount === 1 ? "query" : "queries"}
                    </span>
                    {session.fileSize && (
                      <span className="text-gray-500">{formatSize(session.fileSize)}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.documentId);
                  }}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition"
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
