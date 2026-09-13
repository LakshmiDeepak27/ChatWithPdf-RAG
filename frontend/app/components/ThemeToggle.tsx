"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("lucidchat_theme") as "dark" | "light" | null;
    const initialTheme = saved || "dark";
    setTheme(initialTheme);
    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("lucidchat_theme", nextTheme);

    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  if (!mounted) {
    return <div className="w-8 h-8 rounded-lg" />;
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark or light theme"
      title={theme === "dark" ? "Switch to Light mode" : "Switch to Dark mode"}
      className="p-2 rounded-xl bg-surface border border-border-theme hover:border-accent-primary/50 text-text-secondary hover:text-text-primary transition flex items-center justify-center shadow-xs cursor-pointer"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-accent-primary animate-in fade-in duration-200" />
      ) : (
        <Moon className="w-4 h-4 text-accent-primary animate-in fade-in duration-200" />
      )}
    </button>
  );
}
