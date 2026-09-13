"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Plus,
  MessageSquare,
  FileText,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  ShieldCheck,
  Loader2,
  Upload,
} from "lucide-react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import LucidLogo from "./LucidLogo";
import ThemeToggle from "./ThemeToggle";
import { ChatSession } from "./HistoryList";

export interface UploadingDocInfo {
  filename: string;
  status: "uploading" | "processing";
  statusMessage?: string;
  progress?: number;
}

interface SidebarProps {
  sessions: ChatSession[];
  activeDocumentId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (documentId: string) => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  uploadingDoc?: UploadingDocInfo | null;
  onFileDrop?: (file: File) => void;
}

interface GroupedSessions {
  today: ChatSession[];
  yesterday: ChatSession[];
  older: ChatSession[];
}

export default function Sidebar({
  sessions,
  activeDocumentId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  uploadingDoc,
  onFileDrop,
}: SidebarProps) {
  // 1. Draggable Resizable Sidebar Width with Pointer Capture
  const [sidebarWidth, setSidebarWidth] = useState<number>(280);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState<boolean>(false);
  const widthRef = useRef<number>(280);
  widthRef.current = sidebarWidth;

  // Load saved sidebar width
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("lucidchat_sidebar_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 220 && parsed <= 520) {
          setSidebarWidth(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Pointer capture ensures the drag NEVER drops even on fast cursor movement
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing) return;
    const clamped = Math.min(Math.max(e.clientX, 220), 520);
    widthRef.current = clamped;
    setSidebarWidth(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isResizing) {
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      try {
        localStorage.setItem("lucidchat_sidebar_width", widthRef.current.toString());
      } catch {}
    }
  };

  // 2. Drag-and-Drop PDF directly on the Sidebar
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFileOver) setIsDraggingFileOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only unset if leaving the sidebar container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingFileOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFileOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileDrop?.(file);
    }
  };

  // 3. Chronological Grouping
  const grouped = useMemo(() => {
    const result: GroupedSessions = {
      today: [],
      yesterday: [],
      older: [],
    };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    sessions.forEach((session) => {
      const sessionTime = new Date(session.updatedAt || session.createdAt).getTime();

      if (sessionTime >= startOfToday) {
        result.today.push(session);
      } else if (sessionTime >= startOfYesterday) {
        result.yesterday.push(session);
      } else {
        result.older.push(session);
      }
    });

    return result;
  }, [sessions]);

  // ----------------------------------------------------
  // Collapsed Sidebar Mini-Rail
  // ----------------------------------------------------
  if (isCollapsed) {
    return (
      <aside
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="w-[64px] h-screen bg-bg-secondary border-r border-border-theme flex flex-col items-center py-4 px-2 select-none shrink-0 transition-all duration-300 z-30 relative"
      >
        {/* Expand Button */}
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface transition cursor-pointer mb-4"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="w-5 h-5 text-accent-primary" />
        </button>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="w-10 h-10 rounded-xl bg-surface border border-border-theme hover:border-accent-primary text-text-primary hover:text-accent-primary flex items-center justify-center transition cursor-pointer shadow-xs mb-3"
          title="New Document Chat (Ctrl+K)"
          aria-label="New Document Chat"
        >
          <Plus className="w-5 h-5 text-accent-primary" />
        </button>

        {/* Loading Indicator in Collapsed Rail */}
        {uploadingDoc && (
          <div
            className="w-10 h-10 rounded-xl bg-surface border-2 border-accent-primary/80 text-accent-primary flex items-center justify-center relative mb-3 shadow-xs animate-pulse"
            title={`${uploadingDoc.filename}: ${uploadingDoc.statusMessage || "Indexing..."}`}
          >
            <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
            <span className="w-2.5 h-2.5 rounded-full bg-accent-primary absolute -top-1 -right-1 ring-2 ring-bg-secondary animate-ping" />
          </div>
        )}

        {/* Vertical Separator */}
        <div className="w-6 h-[1px] bg-border-theme my-2" />

        {/* Mini Sessions Indicator */}
        <div className="flex-1 w-full overflow-y-auto space-y-2 py-2 flex flex-col items-center">
          {sessions.slice(0, 8).map((session) => {
            const isActive = session.documentId === activeDocumentId;
            return (
              <button
                key={session.documentId}
                onClick={() => onSelectSession(session)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer relative ${
                  isActive
                    ? "bg-surface text-accent-primary border border-accent-primary/60"
                    : "text-text-muted hover:text-text-primary hover:bg-surface"
                }`}
                title={session.filename}
              >
                <FileText className="w-4 h-4" />
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary absolute top-1 right-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="space-y-3 pt-2 flex flex-col items-center">
          <ThemeToggle />
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </aside>
    );
  }

  // ----------------------------------------------------
  // Expanded ChatGPT-style Sidebar with Draggable Resize & Dropzone
  // ----------------------------------------------------
  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${sidebarWidth}px`,
        maxWidth: `${sidebarWidth}px`,
      }}
      className={`h-screen bg-bg-secondary border-r border-border-theme flex flex-col select-none shrink-0 relative z-30 ${
        isResizing ? "" : "transition-[width] duration-150"
      }`}
    >
      {/* File Drop Overlay on the Sidebar */}
      {isDraggingFileOver && (
        <div className="absolute inset-0 bg-accent-soft/20 dark:bg-accent-soft/10 border-2 border-dashed border-accent-primary rounded-r-2xl z-50 flex flex-col items-center justify-center p-4 backdrop-blur-xs transition-all pointer-events-none">
          <div className="p-3 rounded-2xl bg-surface border border-accent-primary text-accent-primary mb-2 animate-bounce">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-text-primary">Drop PDF Here</p>
          <p className="text-[11px] text-text-muted mt-0.5">Release to start instant analysis</p>
        </div>
      )}

      {/* Top Header: Logo + Collapse Button */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-border-theme/60">
        <LucidLogo size="sm" showSubtitle={false} />
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition cursor-pointer"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Primary "+ New Chat" CTA Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface border border-border-theme hover:border-accent-primary/50 text-text-primary text-xs font-semibold hover:bg-elevated transition shadow-xs cursor-pointer group"
        >
          <div className="p-1 rounded-md bg-bg-primary text-accent-primary border border-border-theme group-hover:scale-105 transition-transform">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span className="flex-1 text-left">New Document Chat</span>
          <span className="text-[10px] text-text-muted font-mono bg-bg-primary px-1.5 py-0.5 rounded border border-border-theme">
            Ctrl+K
          </span>
        </button>
      </div>

      {/* Conversation Sessions List & Active Loading State */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
        {/* ACTIVE LOADING CARD: When a document is uploading/processing */}
        {uploadingDoc && (
          <div className="p-3 rounded-xl bg-surface border-2 border-accent-primary/50 shadow-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Loader2 className="w-3.5 h-3.5 text-accent-primary animate-spin shrink-0" />
                <span className="text-xs font-bold text-text-primary truncate">
                  {uploadingDoc.filename}
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-primary text-black shrink-0 tracking-wide uppercase">
                {uploadingDoc.status === "uploading" ? "Uploading" : "Indexing"}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-300 rounded-full"
                style={{
                  width: `${uploadingDoc.progress || 35}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-text-muted font-medium">
              <span className="truncate mr-2">
                {uploadingDoc.statusMessage || "Analyzing & vectorizing document..."}
              </span>
              {uploadingDoc.progress !== undefined && (
                <span className="shrink-0 text-accent-primary font-mono font-bold">
                  {uploadingDoc.progress}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Grouped History List */}
        {[
          { label: "Today", items: grouped.today },
          { label: "Yesterday", items: grouped.yesterday },
          { label: "Older", items: grouped.older },
        ].map((group) => {
          if (group.items.length === 0) return null;

          return (
            <div key={group.label} className="space-y-0.5">
              <div className="px-3 py-1 text-[10px] font-bold text-text-muted tracking-wider uppercase">
                {group.label}
              </div>

              {group.items.map((session) => {
                const isActive = session.documentId === activeDocumentId;

                return (
                  <div
                    key={session.documentId}
                    onClick={() => onSelectSession(session)}
                    className={`group relative flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                      isActive
                        ? "bg-surface text-text-primary font-medium border-l-2 border-accent-primary shadow-xs pl-2.5"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface/70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FileText
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? "text-accent-primary" : "text-text-muted group-hover:text-text-secondary"
                        }`}
                      />
                      <span className="truncate flex-1 text-[13px]">{session.filename}</span>
                    </div>

                    {/* Delete Session Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.documentId);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-text-muted hover:text-[#E47777] hover:bg-[#E47777]/10 transition shrink-0"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Empty State (only when not uploading and sessions empty) */}
        {!uploadingDoc && sessions.length === 0 && (
          <div className="p-6 text-center text-text-muted space-y-2 mt-4">
            <MessageSquare className="w-6 h-6 mx-auto text-text-muted/60" />
            <p className="text-xs">No previous chats yet.</p>
            <p className="text-[11px] text-text-muted/80">
              Drag & drop or upload a PDF to start.
            </p>
          </div>
        )}
      </div>

      {/* Footer Area: Security Pill + Controls + Account */}
      <div className="p-3 border-t border-border-theme/60 space-y-2 bg-bg-secondary">
        {/* Multi-tenant Isolation Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface/60 border border-border-theme text-[11px] text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-[#79C98A] shrink-0" />
          <span className="truncate">Isolated Vector Vault</span>
        </div>

        {/* Account & Theme Row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer px-1 py-0.5">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* Draggable Resizable Right Edge Handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`absolute top-0 -right-2 w-4 h-full cursor-col-resize hover:bg-accent-primary/20 transition-colors z-50 group flex items-center justify-center touch-none select-none ${
          isResizing ? "bg-accent-primary/40" : "bg-transparent"
        }`}
        title="Drag horizontally to resize sidebar"
      >
        <div
          className={`w-1 h-12 rounded-full transition-colors ${
            isResizing ? "bg-accent-primary" : "bg-border-theme group-hover:bg-accent-primary"
          }`}
        />
      </div>
    </aside>
  );
}
