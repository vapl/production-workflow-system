"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./utils";

type TooltipProps = {
  content: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
};

const sideClasses: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full mb-4 left-1/2 -translate-x-1/2",
  bottom: "top-full mt-4 left-1/2 -translate-x-1/2",
  left: "right-full mr-4 top-1/2 -translate-y-1/2",
  right: "left-full ml-4 top-1/2 -translate-y-1/2",
};

export function Tooltip({
  content,
  className,
  side = "top",
  children,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) {
        return;
      }
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex items-center group"
      tabIndex={0}
      onClick={() => setIsOpen((prev) => !prev)}
      onBlur={() => setIsOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      }}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 max-w-[220px] rounded-md border border-border bg-foreground px-2 py-1 text-[11px] text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          isOpen ? "opacity-100" : "opacity-0",
          sideClasses[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
