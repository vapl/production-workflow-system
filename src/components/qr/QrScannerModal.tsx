"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CameraIcon, KeyboardIcon, ScanLineIcon } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  resolveScanTarget,
  type ResolveScanTargetResult,
} from "@/lib/qr/resolveScanTarget";

type QrScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onResolved: (result: ResolveScanTargetResult) => Promise<void> | void;
  title?: string;
};

type DetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type DetectorCtor = new (options: { formats: string[] }) => DetectorLike;
type Html5QrcodeLike = {
  start: (
    cameraConfig: { facingMode: "environment" | "user" },
    config: {
      fps?: number;
      qrbox?: { width: number; height: number };
      aspectRatio?: number;
      disableFlip?: boolean;
    },
    onSuccess: (decodedText: string) => void,
    onError?: (errorMessage: string) => void,
  ) => Promise<unknown>;
  stop: () => Promise<void> | void;
  clear: () => Promise<void> | void;
};
type Html5QrcodeCtor = new (
  elementId: string,
  config?:
    | boolean
    | {
        formatsToSupport?: number[];
      },
) => Html5QrcodeLike;

export function QrScannerModal({
  open,
  onClose,
  onResolved,
  title = "Scan QR code",
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<DetectorLike | null>(null);
  const html5ScannerRef = useRef<Html5QrcodeLike | null>(null);
  const scannerRegionIdRef = useRef(`qr-scanner-${Math.random().toString(36).slice(2, 10)}`);
  const resolvingRef = useRef(false);
  const keyboardBufferRef = useRef("");
  const keyboardLastTimeRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);

  const cameraSupport = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        hasGetUserMedia: false,
        isSecureContext: false,
        hasBarcodeDetector: false,
      };
    }
    const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
    const isSecureContext = window.isSecureContext;
    const hasNative = Boolean(
      (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector,
    );
    return {
      hasGetUserMedia,
      isSecureContext,
      hasBarcodeDetector: hasNative,
    };
  }, []);

  const scanEngine = useMemo(() => {
    if (!cameraSupport.hasGetUserMedia) {
      return "unsupported" as const;
    }
    return cameraSupport.hasBarcodeDetector
      ? ("native" as const)
      : ("html5" as const);
  }, [cameraSupport]);

  const unsupportedReason = useMemo(() => {
    if (cameraSupport.hasGetUserMedia) {
      return "Camera API is unavailable in this browser context.";
    }
    if (!cameraSupport.isSecureContext) {
      return "Safari blocks camera on non-secure pages. Open the app via HTTPS (or localhost on desktop), then retry.";
    }
    return "Camera API is unavailable in this browser context.";
  }, [cameraSupport]);

  const stopHtml5Scanner = async () => {
    const scanner = html5ScannerRef.current;
    html5ScannerRef.current = null;
    if (!scanner) {
      return;
    }
    try {
      await scanner.stop();
    } catch {
      // Scanner may already be stopped.
    }
    try {
      await scanner.clear();
    } catch {
      // Ignore cleanup errors.
    }
  };

  const resetCapture = () => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    detectorRef.current = null;
    void stopHtml5Scanner();
    setCameraReady(false);
  };

  const handleRawValue = async (rawValue: string) => {
    if (resolvingRef.current || !rawValue.trim()) {
      return;
    }
    resolvingRef.current = true;
    setIsResolving(true);
    try {
      const result = await resolveScanTarget(rawValue);
      await onResolved(result);
      if (result.ok) {
        onClose();
      }
    } finally {
      resolvingRef.current = false;
      setIsResolving(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!open || scanEngine === "unsupported") {
      resetCapture();
      return;
    }

    let disposed = false;
    const setupNative = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.srcObject = stream;
      await video.play();
      const DetectorClass = (window as Window & { BarcodeDetector?: DetectorCtor })
        .BarcodeDetector;
      if (!DetectorClass) {
        throw new Error("BarcodeDetector unavailable");
      }
      detectorRef.current = new DetectorClass({ formats: ["qr_code"] });
      setCameraReady(true);
      const detectFrame = async () => {
        if (disposed || !videoRef.current || !detectorRef.current) {
          return;
        }
        if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const detected = await detectorRef.current.detect(videoRef.current);
            const rawValue = detected[0]?.rawValue?.trim();
            if (rawValue) {
              await handleRawValue(rawValue);
            }
          } catch {
            // Ignore detection frame errors and continue scanning.
          }
        }
        rafRef.current = window.requestAnimationFrame(() => {
          void detectFrame();
        });
      };
      void detectFrame();
    };

    const setupHtml5Fallback = async () => {
      const html5Module = (await import("html5-qrcode")) as unknown as {
        Html5Qrcode: Html5QrcodeCtor;
        Html5QrcodeSupportedFormats: { QR_CODE: number };
      };
      if (disposed) {
        return;
      }
      const elementId = scannerRegionIdRef.current;
      const region = document.getElementById(elementId);
      if (!region) {
        throw new Error("Scanner region is missing");
      }
      const scanner = new html5Module.Html5Qrcode(elementId, {
        formatsToSupport: [html5Module.Html5QrcodeSupportedFormats.QR_CODE],
      });
      html5ScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.333,
          disableFlip: false,
        },
        (decodedText: string) => {
          void handleRawValue(decodedText);
        },
      );
      if (!disposed) {
        setCameraReady(true);
      }
    };

    const setup = async () => {
      setCameraError("");
      setCameraReady(false);
      try {
        if (scanEngine === "native") {
          await setupNative();
          return;
        }
        await setupHtml5Fallback();
      } catch {
        setCameraError("Camera is unavailable. Use manual input or scanner.");
      }
    };
    void setup();

    return () => {
      disposed = true;
      resetCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanEngine, isDesktop]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        const value = keyboardBufferRef.current.trim();
        keyboardBufferRef.current = "";
        keyboardLastTimeRef.current = 0;
        if (value.length >= 6) {
          event.preventDefault();
          void handleRawValue(value);
        }
        return;
      }
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return;
      }
      const now = Date.now();
      if (keyboardLastTimeRef.current && now - keyboardLastTimeRef.current > 120) {
        keyboardBufferRef.current = "";
      }
      keyboardLastTimeRef.current = now;
      keyboardBufferRef.current += event.key;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      keyboardBufferRef.current = "";
      keyboardLastTimeRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const content = (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <CameraIcon className="h-3.5 w-3.5" />
          Camera scan
        </div>
        {scanEngine === "unsupported" ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            {unsupportedReason}
          </div>
        ) : cameraError ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            {cameraError}
          </div>
        ) : scanEngine === "html5" ? (
          <div className="relative overflow-hidden rounded-md border border-border bg-black">
            <div id={scannerRegionIdRef.current} className="min-h-56 w-full" />
            {!cameraReady ? (
              <div className="absolute inset-0 grid place-items-center text-xs text-white/80">
                Starting camera...
              </div>
            ) : null}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-md border border-border bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-56 w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-28 w-28 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
            {!cameraReady ? (
              <div className="absolute inset-0 grid place-items-center text-xs text-white/80">
                Starting camera...
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <ScanLineIcon className="h-3.5 w-3.5" />
          Manual token or QR link
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            placeholder="Paste token or URL"
            className="h-10"
          />
          <Button
            type="button"
            className="h-10"
            disabled={isResolving || !manualValue.trim()}
            onClick={() => void handleRawValue(manualValue)}
          >
            Open
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        <KeyboardIcon className="h-3.5 w-3.5" />
        USB scanner is supported. Scan and press Enter.
      </div>
      {isResolving ? (
        <div className="text-xs text-muted-foreground">Resolving QR target...</div>
      ) : null}
    </div>
  );

  if (!isDesktop) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        ariaLabel={title}
        title={title}
        closeButtonLabel="Close scanner"
        panelClassName="max-h-[86dvh] pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
        keyboardAware
      >
        <div className="overflow-y-auto px-4 pb-4 pt-3">{content}</div>
      </BottomSheet>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      aria-hidden={!open}
    >
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {content}
      </div>
    </div>
  );
}
