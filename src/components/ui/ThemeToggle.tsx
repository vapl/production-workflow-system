"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "pws-theme";

function resolveSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (window.localStorage.getItem(STORAGE_KEY) as Theme | null)
        : null;
    const resolved = stored === "dark" || stored === "light"
      ? stored
      : resolveSystemTheme();

    setTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  function handleToggle() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    }
  }

  if (!mounted) {
    return (
      <button
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--tabs-border)] bg-[var(--tabs-bg)] px-3 text-sm font-medium text-[var(--tabs-text)] opacity-70 shadow-sm"
        type="button"
        aria-label="Toggle theme"
        disabled
      >
        <MoonIcon className="h-4 w-4" />
        Theme
      </button>
    );
  }

  return (
    <button
      className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--tabs-border)] bg-[var(--tabs-bg)] px-3 text-sm font-medium text-[var(--tabs-text)] shadow-sm transition hover:text-[var(--tabs-hover-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tabs-ring)]"
      type="button"
      onClick={handleToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <>
          <SunIcon className="h-4 w-4" />
          Light
        </>
      ) : (
        <>
          <MoonIcon className="h-4 w-4" />
          Dark
        </>
      )}
    </button>
  );
}
