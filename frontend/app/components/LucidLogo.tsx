"use client";

import React from "react";

interface LucidLogoProps {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
}

export default function LucidLogo({
  size = "md",
  showSubtitle = true,
  className = "",
}: LucidLogoProps) {
  const iconSizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-12 h-12",
  };

  const titleSizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
  };

  const subtitleSizes = {
    sm: "text-[9px] tracking-widest",
    md: "text-[10px] tracking-[0.2em]",
    lg: "text-xs tracking-[0.25em]",
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Icon */}
      <div className={`relative ${iconSizes[size]} shrink-0 flex items-center justify-center`}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm"
        >
          {/* Document Base */}
          <rect
            x="14"
            y="12"
            width="56"
            height="72"
            rx="10"
            className="fill-surface stroke-border-theme"
            strokeWidth="3.5"
          />
          {/* Document Folded Corner */}
          <path
            d="M50 12V24C50 27.5 52.5 30 56 30H70L50 12Z"
            className="fill-accent-primary"
          />
          {/* Document Text Lines */}
          <line
            x1="26"
            y1="38"
            x2="48"
            y2="38"
            className="stroke-muted"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line
            x1="26"
            y1="49"
            x2="44"
            y2="49"
            className="stroke-muted"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Foreground Chat Speech Bubble */}
          <g transform="translate(36, 38)">
            {/* Bubble body with tail */}
            <path
              d="M12 0C5.37258 0 0 5.37258 0 12C0 14.8872 1.01633 17.5367 2.71569 19.6151L0.854102 26.1422C0.60105 27.0279 1.43981 27.8209 2.31688 27.5342L9.27838 25.2647C10.1601 25.5684 11.0594 25.7273 12 25.7273C18.6274 25.7273 24 20.3547 24 13.7273C24 7.09987 18.6274 1.72729 12 1.72729Z"
              transform="scale(2)"
              className="fill-accent-primary"
            />
            {/* Three Dots (...) */}
            <circle cx="16" cy="27" r="2.8" className="fill-bg-primary" />
            <circle cx="24" cy="27" r="2.8" className="fill-bg-primary" />
            <circle cx="32" cy="27" r="2.8" className="fill-bg-primary" />
          </g>
        </svg>
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col">
        <div className={`font-extrabold ${titleSizes[size]} tracking-tight leading-none`}>
          <span className="text-text-primary">Lucid</span>
          <span className="text-accent-primary ml-0.5">Chat</span>
        </div>
        {showSubtitle && (
          <span className={`text-text-muted font-bold ${subtitleSizes[size]} uppercase mt-1 leading-none`}>
            UNDERSTAND WHAT YOU READ.
          </span>
        )}
      </div>
    </div>
  );
}
