"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./utils";

type TooltipProps = {
  content: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
  interaction?: "hover" | "hover-click";
};

const sideClasses: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full mb-4 left-1/2",
  bottom: "top-full mt-4 left-1/2",
  left: "right-full mr-4 top-1/2",
  right: "left-full ml-4 top-1/2",
};

export function Tooltip({
  content,
  className,
  side = "top",
  children,
  interaction = "hover-click",
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [xOffset, setXOffset] = useState(0);
  const [yOffset, setYOffset] = useState(0);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const isHoverOnly = interaction === "hover";
  const isVisible = isOpen || isHovered || isFocused;

  useEffect(() => {
    if (isHoverOnly || !isOpen) {
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
  }, [isHoverOnly, isOpen]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const updatePosition = () => {
      if (!tooltipRef.current || !wrapperRef.current) {
        return;
      }
      const triggerRect = wrapperRef.current.getBoundingClientRect();
      const tipRect = tooltipRef.current.getBoundingClientRect();
      const padding = 16;

      let baseLeft = tipRect.left;
      let baseTop = tipRect.top;

      if (side === "top" || side === "bottom") {
        baseLeft = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2;
      } else if (side === "left") {
        baseLeft = triggerRect.left - tipRect.width - 16;
      } else {
        baseLeft = triggerRect.right + 16;
      }

      if (side === "left" || side === "right") {
        baseTop = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
      } else if (side === "top") {
        baseTop = triggerRect.top - tipRect.height - 16;
      } else {
        baseTop = triggerRect.bottom + 16;
      }

      const clampedLeft = Math.min(
        Math.max(baseLeft, padding),
        window.innerWidth - tipRect.width - padding,
      );
      const clampedTop = Math.min(
        Math.max(baseTop, padding),
        window.innerHeight - tipRect.height - padding,
      );

      const nextX = clampedLeft - baseLeft;
      const nextY = clampedTop - baseTop;
      setXOffset(nextX);
      setYOffset(nextY);
    };
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [content, isVisible, side]);

  const transformStyle =
    side === "top" || side === "bottom"
      ? `translate(calc(-50% + ${xOffset}px), ${yOffset}px)`
      : `translate(${xOffset}px, calc(-50% + ${yOffset}px))`;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex items-center"
      tabIndex={isHoverOnly ? undefined : 0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onClick={
        isHoverOnly
          ? undefined
          : () => {
              setIsOpen((prev) => !prev);
            }
      }
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        if (!isHoverOnly) {
          setIsOpen(false);
        }
      }}
      onKeyDown={
        isHoverOnly
          ? undefined
          : (event) => {
              if (event.key === "Escape") {
                setIsOpen(false);
              }
            }
      }
    >
      {children}
      <span
        ref={tooltipRef}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-72 break-words rounded-md border border-border bg-foreground px-2 py-1 text-[11px] text-background opacity-0 shadow-sm transition-opacity",
          isVisible ? "opacity-100" : "opacity-0",
          sideClasses[side],
          className,
        )}
        style={{ transform: transformStyle }}
      >
        {content}
      </span>
    </span>
  );
}
