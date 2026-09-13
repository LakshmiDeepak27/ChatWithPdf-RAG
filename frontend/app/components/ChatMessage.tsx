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
      className={`flex gap-3 my-3 items-start transition-all ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-surface border border-border-theme flex items-center justify-center text-accent-primary shrink-0 mt-0.5 shadow-xs">
          <Bot className="w-4 h-4" />
        </div>
      )}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[85%] md:max-w-[78%]`}>
        <div
          className={`px-4 py-3 rounded-2xl transition-all shadow-xs ${
            isUser
              ? "bg-accent-primary text-black font-medium rounded-tr-xs"
              : "bg-surface text-text-primary border border-border-theme rounded-tl-xs"
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap selection:bg-black selection:text-white">
              {text}
            </p>
          ) : (
            <MarkdownRenderer content={text} />
          )}
        </div>

        <span className="text-[10px] text-text-muted mt-1 px-1">
          {mounted ? timeLabel : ""}
        </span>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-accent-primary flex items-center justify-center text-black shrink-0 mt-0.5 shadow-xs font-bold">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
