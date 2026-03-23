"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui/utils";

type DesktopPageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  titleBlockClassName?: string;
  sticky?: boolean;
  fullBleed?: boolean;
};

export function DesktopPageHeader({
  title,
  subtitle,
  actions,
  footer,
  className,
  titleBlockClassName,
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
        sticky &&
          "md:-mt-px md:sticky md:[top:var(--desktop-tabs-offset,4rem)] md:z-20 md:bg-app-surface",
        fullBleed && "desktop-sticky-bleed",
        sticky && showStickyShadow
          ? "desktop-sticky-bleed-shadow"
          : "desktop-sticky-bleed-no-shadow",
        className,
      )}
    >
      <div className="flex w-full flex-col gap-2 py-3">
        <div className="flex w-full flex-col items-start gap-4 md:flex-row md:items-end md:justify-between flex-wrap">
          <div
            className={cn(
              "min-w-0 md:max-w-sm md:shrink-0 xl:max-w-md",
              titleBlockClassName,
            )}
          >
            <h2 className="text-2xl font-semibold">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="">{actions}</div> : null}
        </div>
        {footer ? <div className="w-full min-w-0">{footer}</div> : null}
      </div>
    </div>
  );
}
