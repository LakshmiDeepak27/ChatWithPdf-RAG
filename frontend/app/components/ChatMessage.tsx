"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bot, User } from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";

interface ChatMessageProps {
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function ChatMessage({ sender, text, timestamp }: ChatMessageProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const timeLabel = useMemo(() => {
    const hours24 = timestamp.getHours();
    const hours12 = ((hours24 + 11) % 12) + 1;
    const minutes = timestamp.getMinutes();
    const ampm = hours24 >= 12 ? "PM" : "AM";
    return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )} ${ampm}`;
  }, [timestamp]);

  const isUser = sender === "user";

  return (
    <div
      className={`flex gap-3 my-2 items-start ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-1">
          <Bot className="w-4 h-4" />
        </div>
      )}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[85%] md:max-w-[78%]`}>
        <div
          className={`px-4 py-3 rounded-2xl shadow-sm ${
            isUser
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-gray-800 text-gray-100 border border-gray-700/80 rounded-tl-sm"
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
          ) : (
            <MarkdownRenderer content={text} />
          )}
        </div>

        <span className="text-[10px] text-gray-500 mt-1 px-1">
          {mounted ? timeLabel : ""}
        </span>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
