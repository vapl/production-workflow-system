"use client";

import * as React from "react";
import { ImageIcon, ScanLineIcon } from "lucide-react";
import { cn } from "@/components/ui/utils";

type FileFieldProps = Omit<React.ComponentProps<"input">, "type" | "id"> & {
  id?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  emptyText?: React.ReactNode;
  emptyHint?: React.ReactNode;
  enableScan?: boolean;
  scanButtonLabel?: React.ReactNode;
  wrapperClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  errorClassName?: string;
};

export function FileField({
  id,
  label,
  description,
  error,
  emptyText = "Drag files here or click to upload",
  emptyHint = "Max 20MB per file",
  enableScan = false,
  scanButtonLabel = "Scan document",
  required,
  wrapperClassName,
  className,
  labelClassName,
  descriptionClassName,
  errorClassName,
  ...inputProps
}: FileFieldProps) {
  const { onChange: onChangeProp, ...restInputProps } = inputProps;
  const generatedId = React.useId();
  const inputId = id ?? `file-field-${generatedId}`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);
  const [fileSummary, setFileSummary] = React.useState<string>("");
  const [isDragActive, setIsDragActive] = React.useState(false);

  const applySummary = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setFileSummary("");
    } else if (files.length === 1) {
      setFileSummary(files[0]?.name ?? "");
    } else {
      setFileSummary(`${files.length} files selected`);
    }
  };

  const setInputFilesAndNotify = (files: File[]) => {
    if (!inputRef.current) {
      return;
    }
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
    applySummary(transfer.files);
    onChangeProp?.({
      target: inputRef.current,
      currentTarget: inputRef.current,
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    applySummary(files);
    onChangeProp?.(event);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0 || !inputRef.current) {
      return;
    }
    const dropped = Array.from(files);
    if (restInputProps.multiple) {
      const current = Array.from(inputRef.current.files ?? []);
      setInputFilesAndNotify([...current, ...dropped]);
      return;
    }
    setInputFilesAndNotify(dropped.slice(0, 1));
  };

  const handleScanChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const scanned = Array.from(event.target.files ?? []);
    if (scanned.length === 0 || !inputRef.current) {
      return;
    }
    if (restInputProps.multiple) {
      const current = Array.from(inputRef.current.files ?? []);
      setInputFilesAndNotify([...current, ...scanned]);
    } else {
      setInputFilesAndNotify(scanned.slice(0, 1));
    }
    event.currentTarget.value = "";
  };

  return (
    <div className={cn("space-y-2", wrapperClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className={cn("text-sm font-medium", labelClassName)}
        >
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        required={required}
        className="sr-only"
        onChange={handleChange}
        {...restInputProps}
      />
      {enableScan ? (
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleScanChange}
        />
      ) : null}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "relative flex min-h-30 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-input-background px-4 py-4 text-center transition hover:border-muted-foreground/40 hover:bg-muted/20",
          "focus-within:ring-2 focus-within:ring-ring/30",
          isDragActive && "border-primary/60 bg-primary/5",
          className,
        )}
      >
        <ImageIcon className="mb-2 h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {fileSummary || emptyText}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">{emptyHint}</span>
        {enableScan ? (
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted/50"
            onClick={(event) => {
              event.stopPropagation();
              scanInputRef.current?.click();
            }}
          >
            <ScanLineIcon className="h-4 w-4" />
            {scanButtonLabel}
          </button>
        ) : null}
      </div>
      {description ? (
        <div className={cn("text-xs text-muted-foreground", descriptionClassName)}>
          {description}
        </div>
      ) : null}
      {error ? (
        <div className={cn("text-xs text-destructive", errorClassName)}>{error}</div>
      ) : null}
    </div>
  );
}
