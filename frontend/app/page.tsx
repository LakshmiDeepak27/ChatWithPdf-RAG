"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  FileText,
  AlertTriangle,
  Plus,
  PanelLeft,
  Sparkles,
  Search,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";

import FileUpload from "./components/FileUpload";
import ChatMessage from "./components/ChatMessage";
import Sidebar from "./components/Sidebar";
import LucidLogo from "./components/LucidLogo";
import { ChatSession, SerializedMessage } from "./components/HistoryList";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

const DEFAULT_WELCOME_MESSAGE = {
  id: "1",
  sender: "bot" as const,
  text: "Welcome to LucidChat! Sign in and upload your PDF to analyze, summarize, and chat with your document using AI.",
  timestamp: new Date(),
};

export default function Home() {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<
    { id: string; sender: "user" | "bot"; text: string; timestamp: Date }[]
  >([DEFAULT_WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentStatus, setDocumentStatus] = useState<
    "idle" | "uploading" | "processing" | "ready" | "failed"
  >("idle");
  const [isTyping, setIsTyping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeDocIdRef = useRef<string | null>(null);
  activeDocIdRef.current = documentId;

  const storageKey = `lucidchat_sessions_${user?.id || "guest"}`;

  // Load saved sessions from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        setSessions(parsed);

        // Auto-restore the most recently updated session if no document active
        if (parsed.length > 0 && !activeDocIdRef.current) {
          const latest = parsed[0];
          setDocumentId(latest.documentId);
          setPdfFile({ name: latest.filename, size: latest.fileSize || 0 } as File);
          setDocumentStatus("ready");
          if (latest.messages && latest.messages.length > 0) {
            setMessages(
              latest.messages.map((m) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              }))
            );
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load sessions from localStorage:", err);
    }
  }, [storageKey]);

  // Helper to persist sessions state to localStorage
  const saveSessions = useCallback(
    (newSessions: ChatSession[]) => {
      setSessions(newSessions);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(storageKey, JSON.stringify(newSessions));
        } catch (err) {
          console.warn("Failed to persist sessions to localStorage:", err);
        }
      }
    },
    [storageKey]
  );

  // Keyboard shortcut: Ctrl+K or Cmd+K to start New Chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleDocumentReady = (newDocId: string, file: File) => {
    setDocumentId(newDocId);
    setPdfFile(file);
    setDocumentStatus("ready");

    const readyMsg = {
      id: Date.now().toString(),
      sender: "bot" as const,
      text: `"${file.name}" has been processed and indexed. You can now ask questions about its content.`,
      timestamp: new Date(),
    };

    const newMessages = [...messages, readyMsg];
    setMessages(newMessages);

    // Save newly indexed session to History
    const serializedMsgs: SerializedMessage[] = newMessages.map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp.toISOString(),
    }));

    const existingIdx = sessions.findIndex((s) => s.documentId === newDocId);
    let updatedSessions: ChatSession[];

    if (existingIdx >= 0) {
      updatedSessions = [...sessions];
      updatedSessions[existingIdx] = {
        ...updatedSessions[existingIdx],
        filename: file.name,
        fileSize: file.size,
        updatedAt: new Date().toISOString(),
        messages: serializedMsgs,
      };
    } else {
      const newSession: ChatSession = {
        documentId: newDocId,
        filename: file.name,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: serializedMsgs,
      };
      updatedSessions = [newSession, ...sessions];
    }

    saveSessions(updatedSessions);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    if (!isSignedIn) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "bot",
          text: "Authentication required: Please sign in above to chat with documents.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (!documentId || documentStatus !== "ready") {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "bot",
          text: "Please upload a PDF document first before asking questions.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    const currentQuestion = input.trim();
    const userMessage = {
      id: Date.now().toString(),
      sender: "user" as const,
      text: currentQuestion,
      timestamp: new Date(),
    };

    const updatedWithUser = [...messages, userMessage];
    setMessages(updatedWithUser);
    setInput("");
    setIsTyping(true);

    try {
      const token = await getToken();

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: currentQuestion,
          documentId: documentId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server responded with status ${response.status}`);
      }

      const botResponse = {
        id: (Date.now() + 1).toString(),
        sender: "bot" as const,
        text: data.answer || "No response received from the RAG assistant.",
        timestamp: new Date(),
      };

      const finalMessages = [...updatedWithUser, botResponse];
      setMessages(finalMessages);

      // Persist updated conversation to History session
      const serializedMsgs: SerializedMessage[] = finalMessages.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp.toISOString(),
      }));

      const sessionIdx = sessions.findIndex((s) => s.documentId === documentId);
      if (sessionIdx >= 0) {
        const nextSessions = [...sessions];
        nextSessions[sessionIdx] = {
          ...nextSessions[sessionIdx],
          updatedAt: new Date().toISOString(),
          messages: serializedMsgs,
        };
        saveSessions(nextSessions);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Failed to communicate with the LucidChat backend.";
      const errorResponse = {
        id: (Date.now() + 1).toString(),
        sender: "bot" as const,
        text: errorMsg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  // Switch to a previous document chat session from Sidebar
  const handleSelectSession = (session: ChatSession) => {
    setDocumentId(session.documentId);
    setPdfFile({ name: session.filename, size: session.fileSize || 0 } as File);
    setDocumentStatus("ready");

    if (session.messages && session.messages.length > 0) {
      setMessages(
        session.messages.map((m) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }))
      );
    } else {
      setMessages([DEFAULT_WELCOME_MESSAGE]);
    }
  };

  // Delete a single session from History
  const handleDeleteSession = (targetDocId: string) => {
    const nextSessions = sessions.filter((s) => s.documentId !== targetDocId);
    saveSessions(nextSessions);

    if (documentId === targetDocId) {
      handleNewChat();
    }
  };

  // Start fresh "+ New Chat" upload flow
  const handleNewChat = () => {
    setDocumentId(null);
    setPdfFile(null);
    setDocumentStatus("idle");
    setMessages([DEFAULT_WELCOME_MESSAGE]);
  };

  const isNewChatCanvas = !documentId && documentStatus === "idle";

  return (
    <div className="h-screen w-screen flex font-sans bg-bg-primary text-text-primary overflow-hidden transition-colors duration-200">
      {/* 1. ChatGPT-Style Persistent Sidebar */}
      <Sidebar
        sessions={sessions}
        activeDocumentId={documentId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* 2. Main Workspace Canvas */}
      <main className="flex-1 flex flex-col h-screen bg-bg-primary overflow-hidden relative">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-border-theme/60 px-6 flex items-center justify-between bg-bg-secondary/60 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* Show expand icon if sidebar is collapsed */}
            {isSidebarCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition cursor-pointer"
                title="Open sidebar"
              >
                <PanelLeft className="w-4 h-4 text-accent-primary" />
              </button>
            )}

            {/* Active Document Indicator or Breadcrumb */}
            {pdfFile ? (
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-surface border border-border-theme text-accent-primary">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-xs text-text-primary max-w-[240px] truncate">
                  {pdfFile.name}
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#79C98A]/15 text-[#79C98A] border border-[#79C98A]/30">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Indexed
                </span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-text-muted">
                New Document Chat
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Quick "+ New Chat" CTA in top bar if in an active conversation */}
            {pdfFile && (
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-elevated border border-border-theme hover:border-accent-primary/40 text-xs font-semibold text-text-primary transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-accent-primary" />
                New Chat
              </button>
            )}

            {/* Authentication Buttons */}
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-xs font-semibold text-text-secondary hover:text-text-primary px-2 py-1 cursor-pointer">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="bg-accent-primary text-black hover:opacity-90 font-bold text-xs h-7.5 px-3 rounded-lg transition cursor-pointer shadow-xs">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </header>

        {/* Dynamic Center Canvas */}
        {isNewChatCanvas ? (
          /* Case A: Invitating Centered Upload Canvas for New Chats */
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <div className="max-w-xl w-full flex flex-col items-center">
              {/* Brand Logo & Tagline */}
              <LucidLogo size="lg" showSubtitle={true} className="mb-8" />

              {/* Upload Dropzone */}
              <div className="w-full">
                <FileUpload
                  onFileSelect={setPdfFile}
                  onDocumentReady={handleDocumentReady}
                  onStatusChange={(status) => setDocumentStatus(status)}
                />
              </div>

              {/* Feature Suggestion Chips */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-left">
                <div className="p-3.5 rounded-xl bg-surface/50 border border-border-theme/70 hover:border-accent-primary/40 transition">
                  <div className="p-1.5 w-fit rounded-lg bg-bg-primary text-accent-primary mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-xs font-semibold text-text-primary">Executive Summary</p>
                  <p className="text-[11px] text-text-muted mt-1 leading-snug">
                    Extract core takeaways and bullet summaries in seconds.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/50 border border-border-theme/70 hover:border-accent-primary/40 transition">
                  <div className="p-1.5 w-fit rounded-lg bg-bg-primary text-accent-primary mb-2">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-xs font-semibold text-text-primary">Complex Q&A</p>
                  <p className="text-[11px] text-text-muted mt-1 leading-snug">
                    Query nuanced details, admission scores, and regulations.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/50 border border-border-theme/70 hover:border-accent-primary/40 transition">
                  <div className="p-1.5 w-fit rounded-lg bg-bg-primary text-accent-primary mb-2">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-xs font-semibold text-text-primary">Semantic Search</p>
                  <p className="text-[11px] text-text-muted mt-1 leading-snug">
                    Qdrant vector engine pinpoints exact excerpts effortlessly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Case B: Clean, Distraction-Free Conversation Workspace */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Scrollable Reading Canvas */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    sender={msg.sender}
                    text={msg.text}
                    timestamp={msg.timestamp}
                  />
                ))}

                {isTyping && (
                  <div className="flex gap-3 items-center my-3">
                    <div className="px-4 py-2.5 rounded-2xl bg-surface border border-border-theme text-text-muted shadow-xs">
                      <div className="flex gap-1.5 items-center">
                        <span className="text-xs text-text-muted mr-1">Consulting document</span>
                        <span className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce"></span>
                        <span
                          className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></span>
                        <span
                          className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Unauthenticated Notification Banner */}
            {!isSignedIn && (
              <div className="max-w-3xl mx-auto w-full px-4 mb-2">
                <div className="p-2.5 bg-surface border border-border-theme rounded-xl flex items-center gap-2 text-xs text-text-secondary">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#E5B95C]" />
                  <span>Please sign in using the top-right button to query your documents.</span>
                </div>
              </div>
            )}

            {/* Docked Minimalist Input Bar */}
            <div className="p-4 bg-bg-primary/95 backdrop-blur shrink-0 border-t border-border-theme/40">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-2 bg-surface border border-border-theme focus-within:border-accent-primary/80 focus-within:ring-1 focus-within:ring-accent-primary/60 rounded-2xl px-4 py-2 transition shadow-xs">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={
                      !isSignedIn
                        ? "Sign in to query this document..."
                        : documentStatus !== "ready"
                        ? "Indexing document..."
                        : `Ask anything about ${pdfFile?.name || "your document"}...`
                    }
                    disabled={!isSignedIn || documentStatus !== "ready" || isTyping}
                    className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || !isSignedIn || documentStatus !== "ready" || isTyping}
                    className="p-2 rounded-xl bg-accent-primary text-black hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed transition font-bold cursor-pointer shrink-0"
                    aria-label="Send query"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-text-muted text-center mt-2 font-mono">
                  LucidChat is powered by Gemini RAG & Qdrant vector retrieval.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
