"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, FileText, Bot, ShieldCheck, AlertTriangle, Clock, PlusCircle } from "lucide-react";
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
import HistoryList, { ChatSession, SerializedMessage } from "./components/HistoryList";
import LucidLogo from "./components/LucidLogo";
import ThemeToggle from "./components/ThemeToggle";

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

  const [activeTab, setActiveTab] = useState<"document" | "history">("document");
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
  const activeDocIdRef = useRef<string | null>(null);
  activeDocIdRef.current = documentId;

  const storageKey = `lucidchat_sessions_${user?.id || "guest"}`;

  // Load saved sessions from localStorage on mount and when user auth changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        setSessions(parsed);

        // Auto-restore the most recently updated session if no document is currently active
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
      text: `"${file.name}" has been processed and indexed! You can now ask any question about its content.`,
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
          text: "Please upload a PDF document and wait for processing to finish before asking questions.",
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

    setActiveTab("document");
  };

  const handleDeleteSession = (targetDocId: string) => {
    const nextSessions = sessions.filter((s) => s.documentId !== targetDocId);
    saveSessions(nextSessions);

    if (documentId === targetDocId) {
      handleNewUpload();
    }
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear all saved document chat history?")) {
      saveSessions([]);
      handleNewUpload();
    }
  };

  const handleNewUpload = () => {
    setDocumentId(null);
    setPdfFile(null);
    setDocumentStatus("idle");
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setActiveTab("document");
  };

  return (
    <div className="h-screen w-screen flex font-sans bg-bg-primary text-text-primary overflow-hidden transition-colors duration-200">
      {/* Left Sidebar: Logo, Navigation & Document Controls */}
      <div className="w-[38%] min-w-[340px] max-w-[460px] flex flex-col p-6 border-r border-border-theme bg-bg-secondary overflow-y-auto">
        {/* Brand Header */}
        <div className="mb-6">
          <LucidLogo size="md" showSubtitle={true} />
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-surface p-1 rounded-xl mb-6 border border-border-theme shrink-0">
          <button
            onClick={() => setActiveTab("document")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "document"
                ? "bg-accent-primary text-black shadow-xs"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Upload & Doc
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "history"
                ? "bg-accent-primary text-black shadow-xs"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            History {sessions.length > 0 && `(${sessions.length})`}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "document" ? (
          <div>
            <FileUpload
              onFileSelect={setPdfFile}
              onDocumentReady={handleDocumentReady}
              onStatusChange={(status) => setDocumentStatus(status)}
            />

            {/* Quick Metrics */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="p-3.5 border border-border-theme rounded-2xl bg-surface shadow-xs">
                <p className="text-2xl font-bold text-accent-primary">
                  {messages.filter((m) => m.sender === "user").length}
                </p>
                <p className="text-xs text-text-muted mt-0.5 font-medium">Questions Asked</p>
              </div>
              <div className="p-3.5 border border-border-theme rounded-2xl bg-surface shadow-xs">
                <p className="text-2xl font-bold text-[#79C98A]">
                  {documentStatus === "ready" ? "1" : "0"}
                </p>
                <p className="text-xs text-text-muted mt-0.5 font-medium">Indexed Document</p>
              </div>
            </div>
          </div>
        ) : (
          <HistoryList
            sessions={sessions}
            activeDocumentId={documentId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onClearHistory={handleClearHistory}
            onNewUpload={handleNewUpload}
          />
        )}

        {/* Security & Multi-Tenant Isolation Badge */}
        <div className="mt-auto pt-6">
          <div className="p-3 rounded-xl bg-surface border border-border-theme flex items-center gap-2.5 text-xs text-text-muted shadow-xs">
            <ShieldCheck className="w-4 h-4 text-[#79C98A] shrink-0" />
            <span className="leading-snug">Isolated workspace. Your document vectors are strictly tied to your account.</span>
          </div>
        </div>
      </div>

      {/* Right Area: Conversational Assistant Interface */}
      <div className="flex-1 flex flex-col bg-bg-primary">
        {/* Navigation & Chat Top Bar */}
        <div className="flex items-center justify-between border-b border-border-theme px-6 py-3.5 bg-bg-secondary/90 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface border border-border-theme rounded-xl text-accent-primary shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-xs text-text-primary">LucidChat Assistant</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    documentStatus === "ready"
                      ? "bg-[#79C98A]"
                      : documentStatus === "processing"
                      ? "bg-[#E5B95C] animate-pulse"
                      : "bg-text-muted"
                  }`}
                />
                <span className="text-[11px] text-text-muted">
                  {documentStatus === "ready"
                    ? "Document indexed and ready"
                    : documentStatus === "processing"
                    ? "Processing document..."
                    : "Awaiting document upload"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pdfFile && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-primary max-w-[190px] truncate bg-surface px-2.5 py-1 rounded-lg border border-border-theme font-medium shadow-xs">
                  {pdfFile.name}
                </span>
                <button
                  onClick={handleNewUpload}
                  className="flex items-center gap-1 text-xs text-text-primary hover:text-accent-primary bg-surface hover:bg-elevated border border-border-theme px-2.5 py-1 rounded-lg transition cursor-pointer"
                  title="Upload a new document"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-accent-primary" />
                  New PDF
                </button>
              </div>
            )}

            {/* Dark/Light Mode Switcher */}
            <ThemeToggle />

            {/* Authentication Buttons */}
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-xs font-semibold text-text-secondary hover:text-text-primary px-3 py-1.5 cursor-pointer">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="bg-accent-primary text-black hover:opacity-90 font-bold text-xs h-8 px-3.5 rounded-xl transition cursor-pointer shadow-xs">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              sender={msg.sender}
              text={msg.text}
              timestamp={msg.timestamp}
            />
          ))}

          {isTyping && (
            <div className="flex gap-3 items-center my-2">
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

        {/* Unauthenticated Notification Banner */}
        {!isSignedIn && (
          <div className="mx-6 mb-2 p-2.5 bg-surface border border-border-theme rounded-xl flex items-center gap-2 text-xs text-text-secondary">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#E5B95C]" />
            <span>Please sign in using the top-right button to query your documents.</span>
          </div>
        )}

        {/* Query Input Bar */}
        <div className="border-t border-border-theme px-6 py-4 bg-bg-secondary shrink-0">
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={
                !isSignedIn
                  ? "Sign in to start querying..."
                  : documentStatus !== "ready"
                  ? "Upload and index a PDF first..."
                  : "Ask anything about your document..."
              }
              disabled={!isSignedIn || documentStatus !== "ready" || isTyping}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-surface text-text-primary border border-border-theme focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-text-muted transition"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || !isSignedIn || documentStatus !== "ready" || isTyping}
              className="px-4 py-2.5 rounded-xl bg-accent-primary text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition font-bold flex items-center justify-center shadow-xs cursor-pointer"
              aria-label="Send query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
