"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, FileText, Bot, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from "@clerk/nextjs";

import FileUpload from "./components/FileUpload";
import ChatMessage from "./components/ChatMessage";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function Home() {
  const { getToken, isSignedIn } = useAuth();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "Welcome to TalkToPDF! Sign in and upload your PDF to start chatting with your document using AI.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentStatus, setDocumentStatus] = useState<
    "idle" | "uploading" | "processing" | "ready" | "failed"
  >("idle");
  const [isTyping, setIsTyping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleDocumentReady = (newDocId: string, file: File) => {
    setDocumentId(newDocId);
    setPdfFile(file);
    setDocumentStatus("ready");

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        sender: "bot",
        text: `"${file.name}" has been processed and indexed! You can now ask questions about its content.`,
        timestamp: new Date(),
      },
    ]);
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
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: currentQuestion,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
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

      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: data.answer || "No response received from the RAG assistant.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botResponse]);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Failed to communicate with the TalkToPdf backend.";
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: errorMsg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-screen w-screen flex font-sans bg-gray-900 text-gray-100 overflow-hidden">
      {/* Left Panel: Upload & Document Information */}
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

        {/* Upload Component */}
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
            <p className="text-xs text-gray-400 mt-0.5">Indexed Documents</p>
          </div>
        </div>

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

          <div className="flex items-center gap-4">
            {pdfFile && (
              <span className="text-xs text-gray-400 max-w-[200px] truncate hidden md:inline bg-gray-800 px-2.5 py-1 rounded-md border border-gray-700">
                {pdfFile.name}
              </span>
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
