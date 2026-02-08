import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
};

const defaultState: ConfirmState = {
  open: false,
  title: "",
  description: undefined,
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  destructive: true,
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmState & {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(defaultState);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title ?? "Delete item?",
        description: options.description,
        confirmLabel: options.confirmLabel ?? "Delete",
        cancelLabel: options.cancelLabel ?? "Cancel",
        destructive: options.destructive ?? true,
      });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
    setState(defaultState);
  }, []);

  const dialog = useMemo(
    () => (
      <ConfirmDialog
        {...state}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    ),
    [close, state],
  );

  return { confirm, dialog };
}

