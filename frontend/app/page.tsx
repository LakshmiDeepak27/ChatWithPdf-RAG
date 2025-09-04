// pages.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, FileText, Bot } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

import FileUpload from "./components/FileUpload";
import ChatMessage from "./components/ChatMessage";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "Welcome! Upload your PDF to start chatting.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: "I've analyzed your message. Based on the PDF content, here's what I found relevant to your query.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="h-screen w-screen flex font-sans bg-gray-900 text-gray-100">
      {/* Left Panel */}
      <div className="w-[40%] relative flex flex-col p-10 border-r border-gray-700 bg-gray-800">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-6 h-6 text-indigo-400" />
            <h1 className="text-2xl font-bold text-indigo-300">PDF Assistant</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Upload your document and unlock AI-powered insights instantly
          </p>
        </div>

        {/* Upload */}
        <FileUpload onFileSelect={setPdfFile} />

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="p-4 border rounded-xl bg-gray-700 shadow-sm">
            <p className="text-xl font-bold text-indigo-400">
              {messages.filter((m) => m.sender === "user").length}
            </p>
            <p className="text-xs text-gray-400">Questions Asked</p>
          </div>
          <div className="p-4 border rounded-xl bg-gray-700 shadow-sm">
            <p className="text-xl font-bold text-green-400">
              {pdfFile ? "1" : "0"}
            </p>
            <p className="text-xs text-gray-400">PDFs Loaded</p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-[60%] flex flex-col bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <span className="font-medium">AI Assistant</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:inline">
              {pdfFile ? pdfFile.name : "No PDF uploaded"}
            </span>
            <SignedOut>
              <SignInButton />
              <SignUpButton>
                <button className="bg-indigo-600 text-white rounded-full font-medium text-sm h-9 px-4 hover:bg-indigo-700">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </div>

        {/* Chat */}
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
            <div className="flex gap-3">
              <div className="px-4 py-2 rounded-2xl bg-gray-700 text-gray-400">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></span>
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef}></div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-700 px-6 py-4 flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask something about your PDF..."
            className="flex-1 px-4 py-2 rounded-full text-sm bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
