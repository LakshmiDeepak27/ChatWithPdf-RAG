"use client";

import React, { useEffect, useMemo, useState } from "react";

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
    // Avoid locale-dependent formatting differences between server and client.
    const hours24 = timestamp.getHours();
    const hours12 = ((hours24 + 11) % 12) + 1;
    const minutes = timestamp.getMinutes();
    const ampm = hours24 >= 12 ? "PM" : "AM";
    return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )} ${ampm}`;
  }, [timestamp]);

  return (
    <div
      className={`flex gap-3 ${
        sender === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`px-4 py-2 rounded-2xl max-w-xs shadow-sm ${
          sender === "user"
            ? "bg-indigo-600 text-white"
            : "bg-gray-700 text-gray-100"
        }`}
      >
        <p className="text-sm">{text}</p>
      </div>
      <span className="text-xs text-gray-500 self-end">
        {mounted ? timeLabel : ""}
      </span>
    </div>
  );
}
