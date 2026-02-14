import { useRef, type CSSProperties, type TouchEvent } from "react";
import { cn } from "@/components/ui/utils";

type SideDrawerProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  id?: string;
  children: React.ReactNode;
  panelClassName?: string;
  backdropClassName?: string;
  closeButtonLabel?: string;
  side?: "left" | "right";
  enableSwipeToClose?: boolean;
};

export function SideDrawer({
  open,
  onClose,
  ariaLabel,
  id,
  children,
  panelClassName,
  backdropClassName,
  closeButtonLabel = "Close drawer",
  side = "left",
  enableSwipeToClose = true,
}: SideDrawerProps) {
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (!enableSwipeToClose || !open) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    pointerIdRef.current = 1;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (!enableSwipeToClose || !open) {
      return;
    }
    if (pointerIdRef.current === null) {
      return;
    }
    pointerIdRef.current = null;
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = Math.abs(touch.clientY - startYRef.current);
    const shouldClose =
      side === "left" ? deltaX < -56 && deltaY < 48 : deltaX > 56 && deltaY < 48;
    if (shouldClose) {
      onClose();
    }
  };

  const backdropStyle: CSSProperties = {
    transform: "none",
    filter: "none",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <>
      <button
        type="button"
        aria-label={closeButtonLabel}
        className={cn(
          "fixed inset-0 z-40 h-dvh w-screen appearance-none border-0 bg-black/45 p-0 outline-none transition-opacity duration-200 md:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
          backdropClassName,
        )}
        style={backdropStyle}
        onClick={onClose}
      />
      <aside
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[86%] max-w-sm flex-col border-border bg-card transition-transform duration-200 ease-out md:hidden",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          open
            ? "translate-x-0 pointer-events-auto"
            : side === "left"
              ? "-translate-x-full pointer-events-none"
              : "translate-x-full pointer-events-none",
          panelClassName,
        )}
        onTouchStart={enableSwipeToClose ? handleTouchStart : undefined}
        onTouchEnd={enableSwipeToClose ? handleTouchEnd : undefined}
      >
        {children}
      </aside>
    </>
  );
}
