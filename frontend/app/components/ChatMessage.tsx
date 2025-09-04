import React from "react";

interface ChatMessageProps {
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function ChatMessage({ sender, text, timestamp }: ChatMessageProps) {
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
        {timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
