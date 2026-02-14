"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui/utils";

type DesktopPageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  sticky?: boolean;
  fullBleed?: boolean;
};

export function DesktopPageHeader({
  title,
  subtitle,
  actions,
  className,
  sticky = false,
  fullBleed = true,
}: DesktopPageHeaderProps) {
  const [showStickyShadow, setShowStickyShadow] = useState(false);

  useEffect(() => {
    if (!sticky) {
      return;
    }
    const handleScroll = () => {
      if (window.innerWidth < 768) {
        setShowStickyShadow(false);
        return;
      }
      setShowStickyShadow(window.scrollY > 8);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [sticky]);

  return (
    <div
      className={cn(
        "hidden md:relative md:block md:w-full",
        fullBleed && "desktop-sticky-bleed",
        sticky && showStickyShadow
          ? "desktop-sticky-bleed-shadow"
          : "desktop-sticky-bleed-no-shadow",
        className,
      )}
    >
      <div className="flex w-full items-end justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{title}</h2>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
