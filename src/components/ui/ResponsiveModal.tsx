"use client";

import { useEffect } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/utils";

type ResponsiveModalProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  title?: string;
  closeButtonLabel?: string;
  children: React.ReactNode;
  mobilePanelClassName?: string;
  desktopPanelClassName?: string;
  desktopBodyClassName?: string;
};

export function ResponsiveModal({
  open,
  onClose,
  ariaLabel,
  title,
  closeButtonLabel = "Close",
  children,
  mobilePanelClassName,
  desktopPanelClassName,
  desktopBodyClassName,
}: ResponsiveModalProps) {
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        ariaLabel={ariaLabel}
        title={title}
        closeButtonLabel={closeButtonLabel}
        keyboardAware
        panelClassName={mobilePanelClassName}
      >
        {children}
      </BottomSheet>

      {open ? (
        <div className="hidden md:fixed md:inset-0 md:z-50 md:flex md:items-center md:justify-center md:bg-black/45 md:p-4 md:backdrop-blur-[1.5px]">
          <button
            type="button"
            aria-label={closeButtonLabel}
            className="absolute inset-0"
            onClick={onClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={cn(
              "relative z-10 flex h-[min(92dvh,960px)] w-[min(96vw,1400px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
              desktopPanelClassName,
            )}
          >
            {title ? (
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="text-lg font-semibold">{title}</div>
                <Button type="button" variant="ghost" onClick={onClose}>
                  {closeButtonLabel}
                </Button>
              </div>
            ) : null}
            <div className={cn("min-h-0 flex-1", desktopBodyClassName)}>
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
