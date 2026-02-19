import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/utils";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  id?: string;
  title?: string;
  children: React.ReactNode;
  panelClassName?: string;
  backdropClassName?: string;
  closeButtonLabel?: string;
  showHandle?: boolean;
  showCloseButton?: boolean;
  enableSwipeToClose?: boolean;
  keyboardAware?: boolean;
  showOnDesktop?: boolean;
};

export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  id,
  title,
  children,
  panelClassName,
  backdropClassName,
  closeButtonLabel = "Close",
  showHandle = true,
  showCloseButton = true,
  enableSwipeToClose = false,
  keyboardAware = false,
  showOnDesktop = false,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [keyboardDockOffset, setKeyboardDockOffset] = useState(0);

  const updateKeyboardInset = () => {
    if (!open || !keyboardAware || typeof window === "undefined") {
      setKeyboardDockOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) {
      setKeyboardDockOffset(0);
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const isEditable =
      !!active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable);
    const focusedInsideSheet = !!(active && panelRef.current?.contains(active));
    if (!isEditable || !focusedInsideSheet) {
      setKeyboardDockOffset(0);
      return;
    }
    const keyboardTop = vv.offsetTop + vv.height;
    const panelBottom = panelRef.current?.getBoundingClientRect().bottom ?? 0;
    const gap = Math.max(0, keyboardTop - panelBottom);
    setKeyboardDockOffset(gap > 2 ? -gap : 0);
  };

  useEffect(() => {
    if (!open || !keyboardAware) {
      setKeyboardDockOffset(0);
      return;
    }
    updateKeyboardInset();
    const vv = window.visualViewport;
    const onFocusChange = () => updateKeyboardInset();
    window.addEventListener("focusin", onFocusChange);
    window.addEventListener("focusout", onFocusChange);
    vv?.addEventListener("resize", updateKeyboardInset);
    vv?.addEventListener("scroll", updateKeyboardInset);
    return () => {
      window.removeEventListener("focusin", onFocusChange);
      window.removeEventListener("focusout", onFocusChange);
      vv?.removeEventListener("resize", updateKeyboardInset);
      vv?.removeEventListener("scroll", updateKeyboardInset);
    };
  }, [open, keyboardAware]);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enableSwipeToClose || !open) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const inDragArea = !!target?.closest("[data-bottom-sheet-drag]");
    const panelTop = panelRef.current?.getBoundingClientRect().top ?? 0;
    const startedNearTop = event.clientY - panelTop <= 72;
    if (!inDragArea && !startedNearTop) {
      return;
    }
    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    lastYRef.current = event.clientY;
    lastTimeRef.current = performance.now();
    velocityYRef.current = 0;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!enableSwipeToClose || !isDragging) {
      return;
    }
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    const deltaX = Math.abs(event.clientX - startXRef.current);
    const deltaY = event.clientY - startYRef.current;
    if (deltaY <= 0) {
      setDragY(0);
      return;
    }
    if (deltaX > deltaY * 1.2) {
      return;
    }
    const now = performance.now();
    const dt = now - lastTimeRef.current;
    if (dt > 0) {
      velocityYRef.current = (event.clientY - lastYRef.current) / dt;
      lastYRef.current = event.clientY;
      lastTimeRef.current = now;
    }
    setDragY(deltaY);
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    if (!enableSwipeToClose || !isDragging) {
      return;
    }
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    pointerIdRef.current = null;
    const height =
      panelRef.current?.offsetHeight ?? Math.max(window.innerHeight * 0.6, 320);
    const closeDistance = Math.min(220, height * 0.33);
    const shouldClose = dragY > closeDistance || velocityYRef.current > 0.9;

    setIsDragging(false);
    if (shouldClose) {
      setDragY(0);
      onClose();
      return;
    }
    requestAnimationFrame(() => setDragY(0));
  };

  const panelStyle: CSSProperties | undefined =
    open && (isDragging || dragY > 0)
      ? {
          bottom: keyboardDockOffset ? `${keyboardDockOffset}px` : undefined,
          transform: `translateY(${Math.max(dragY, 0)}px)`,
          transitionDuration: isDragging ? "0ms" : undefined,
        }
      : keyboardDockOffset
        ? { bottom: `${keyboardDockOffset}px` }
        : undefined;

  const backdropStyle: CSSProperties | undefined = {
    transform: "none",
    filter: "none",
    WebkitTapHighlightColor: "transparent",
    ...(open && (isDragging || dragY > 0)
      ? {
          opacity: String(Math.max(0, 1 - dragY / 320)),
        }
      : {}),
  };

  return (
    <>
      <button
        type="button"
        aria-label={closeButtonLabel}
        className={cn(
          "fixed inset-0 z-40 h-dvh w-screen appearance-none border-0 bg-black/45 p-0 outline-none backdrop-blur-[1.5px] transition-[opacity,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showOnDesktop ? "" : "md:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
          backdropClassName,
        )}
        style={backdropStyle}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={cn(
          "fixed flex max-h-[78dvh] flex-col inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-border bg-card pb-[calc(4rem+env(safe-area-inset-bottom))] shadow-2xl will-change-transform transition-[transform,opacity] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showOnDesktop ? "" : "md:hidden",
          open
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-[105%] opacity-0 pointer-events-none",
          panelClassName,
        )}
        style={panelStyle}
        onPointerDown={enableSwipeToClose ? handlePointerDown : undefined}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {showHandle ? (
          <div
            data-bottom-sheet-drag
            className={cn(
              "mx-auto mt-2 h-1.5 w-12 rounded-full bg-border",
              enableSwipeToClose
                ? "cursor-grab touch-none active:cursor-grabbing"
                : "",
            )}
          />
        ) : null}
        {title ? (
          <div
            data-bottom-sheet-drag
            className={cn(
              "flex items-center justify-between border-b border-border px-4 py-2",
              enableSwipeToClose ? "touch-none" : "",
            )}
          >
            <p className="text-sm font-semibold">{title}</p>
            {showCloseButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={closeButtonLabel}
                onClick={onClose}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
        {children}
      </aside>
    </>
  );
}
