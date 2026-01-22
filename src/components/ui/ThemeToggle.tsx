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
        className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-3 py-1.5 text-sm text-foreground/70"
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
      className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1.5 text-sm text-foreground shadow-sm transition hover:bg-foreground/10"
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
