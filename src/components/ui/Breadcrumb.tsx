"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/components/ui/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  inline?: boolean;
}

export function Breadcrumb({ items, className, inline = false }: BreadcrumbProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-1 text-xs text-muted-foreground",
        inline && "text-inherit",
        className,
      )}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className={cn(
                  "truncate transition hover:text-foreground",
                  inline && "hover:text-inherit",
                )}
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "truncate",
                  isLast
                    ? inline
                      ? "font-semibold text-inherit"
                      : "font-medium text-foreground"
                    : undefined,
                )}
              >
                {item.label}
              </span>
            )}
            {!isLast ? (
              <ChevronRightIcon
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground/70",
                  inline && "text-muted-foreground",
                )}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
