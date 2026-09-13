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

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

const DEFAULT_WELCOME_MESSAGE = {
  id: "1",
  sender: "bot" as const,
  text: "Welcome to TalkToPDF! Sign in and upload your PDF to start chatting with your document using AI.",
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

  const storageKey = `talktopdf_sessions_${user?.id || "guest"}`;

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
      text: `"${file.name}" has been processed and indexed! You can now ask questions about its content.`,
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
          : "Failed to communicate with the TalkToPdf backend.";
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

  // Switch to a previous document chat session from History
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

  // Delete a single session from History
  const handleDeleteSession = (targetDocId: string) => {
    const nextSessions = sessions.filter((s) => s.documentId !== targetDocId);
    saveSessions(nextSessions);

    if (documentId === targetDocId) {
      handleNewUpload();
    }
  };

  // Clear all history
  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear all saved document chat history?")) {
      saveSessions([]);
      handleNewUpload();
    }
  };

  // Start fresh upload session
  const handleNewUpload = () => {
    setDocumentId(null);
    setPdfFile(null);
    setDocumentStatus("idle");
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setActiveTab("document");
  };

  return (
    <div className="h-screen w-screen flex font-sans bg-gray-900 text-gray-100 overflow-hidden">
      {/* Left Panel: Upload, Doc Info & History */}
      <div className="w-[40%] flex flex-col p-8 border-r border-gray-800 bg-gray-850 overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600/20 rounded-lg text-indigo-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">TalkToPDF</h1>
              <p className="text-xs text-indigo-400 font-medium">Production RAG Assistant</p>
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Secure multi-tenant document analysis with Gemini & Qdrant vector retrieval.
          </p>
        </div>

        {/* Tab Switcher: Upload & Doc vs History */}
        <div className="flex bg-gray-800/80 p-1 rounded-xl mb-6 border border-gray-700/60 shrink-0">
          <button
            onClick={() => setActiveTab("document")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition ${
              activeTab === "document"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Upload & Doc
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition ${
              activeTab === "history"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            History {sessions.length > 0 && `(${sessions.length})`}
          </button>
        </div>

        {/* Tab 1: Upload & Document Information */}
        {activeTab === "document" ? (
          <div>
            <FileUpload
              onFileSelect={setPdfFile}
              onDocumentReady={handleDocumentReady}
              onStatusChange={(status) => setDocumentStatus(status)}
            />

            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="p-3.5 border border-gray-800 rounded-xl bg-gray-800/80">
                <p className="text-2xl font-bold text-indigo-400">
                  {messages.filter((m) => m.sender === "user").length}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Questions Asked</p>
              </div>
              <div className="p-3.5 border border-gray-800 rounded-xl bg-gray-800/80">
                <p className="text-2xl font-bold text-emerald-400">
                  {documentStatus === "ready" ? "1" : "0"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Indexed Document</p>
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Saved History List */
          <HistoryList
            sessions={sessions}
            activeDocumentId={documentId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onClearHistory={handleClearHistory}
            onNewUpload={handleNewUpload}
          />
        )}

        {/* Security & Isolation Badge */}
        <div className="mt-auto pt-6">
          <div className="p-3 rounded-xl bg-gray-800/40 border border-gray-800 flex items-center gap-2.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Multi-tenant data isolation enabled. Embeddings are strictly bound to your account.</span>
          </div>
        </div>
      </div>

      {/* Right Panel: Chat Interface */}
      <div className="w-[60%] flex flex-col bg-gray-900">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4 bg-gray-900/90 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600/20 rounded-md text-indigo-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-sm text-gray-200">AI Assistant</span>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    documentStatus === "ready"
                      ? "bg-emerald-500"
                      : documentStatus === "processing"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-gray-500"
                  }`}
                />
                <span className="text-xs text-gray-400">
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
                <span className="text-xs text-gray-300 max-w-[180px] truncate bg-gray-800 px-2.5 py-1 rounded-md border border-gray-700">
                  {pdfFile.name}
                </span>
                <button
                  onClick={handleNewUpload}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 px-2 py-1 rounded-md transition"
                  title="Upload a new document"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  New PDF
                </button>
              </div>
            )}

            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-xs font-medium text-gray-300 hover:text-white px-3 py-1.5">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-xs h-8 px-3.5 transition">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              sender={msg.sender}
              text={msg.text}
              timestamp={msg.timestamp}
            />
          ))}

          {isTyping && (
            <div className="flex gap-3 items-center">
              <div className="px-4 py-2.5 rounded-2xl bg-gray-800 border border-gray-700 text-gray-400">
                <div className="flex gap-1.5 items-center">
                  <span className="text-xs text-gray-400 mr-1">Consulting document</span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span
                    className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></span>
                  <span
                    className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Warning if not signed in or no doc */}
        {!isSignedIn && (
          <div className="mx-6 mb-2 p-2.5 bg-indigo-950/40 border border-indigo-800/40 rounded-lg flex items-center gap-2 text-xs text-indigo-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-indigo-400" />
            <span>Please sign in using the top-right button to ask questions about your documents.</span>
          </div>
        )}

        {/* Chat Input Bar */}
        <div className="border-t border-gray-800 px-6 py-4 bg-gray-900">
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={
                !isSignedIn
                  ? "Sign in to chat..."
                  : documentStatus !== "ready"
                  ? "Upload and index a PDF first..."
                  : "Ask anything about your document..."
              }
              disabled={!isSignedIn || documentStatus !== "ready" || isTyping}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-gray-800/80 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed placeholder-gray-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || !isSignedIn || documentStatus !== "ready" || isTyping}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed transition flex items-center justify-center shadow-sm"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
