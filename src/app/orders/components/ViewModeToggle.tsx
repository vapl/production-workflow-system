import { LayoutGridIcon, LayoutListIcon } from "lucide-react";

interface ViewModeToggleProps {
  value: "table" | "cards";
  onChange: (value: "table" | "cards") => void;
  className?: string;
}

export function ViewModeToggle({
  value,
  onChange,
  className,
}: ViewModeToggleProps) {
  return (
    <div
      className={`inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background p-1 text-xs shadow-sm ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => onChange("table")}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
          value === "table"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted/50"
        }`}
      >
        <LayoutListIcon className="h-3.5 w-3.5" />
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
          value === "cards"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted/50"
        }`}
      >
        <LayoutGridIcon className="h-3.5 w-3.5" />
        Cards
      </button>
    </div>
  );
}
