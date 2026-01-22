import { FactoryIcon } from "lucide-react";

export function Header() {
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2">
              <FactoryIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">
                Production Workflow System
              </h1>
              <p className="text-sm text-muted-foreground">
                Operational tool for manufacturing
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm font-medium">Demo Manufacturing Co.</div>
            <div className="text-xs text-muted-foreground">
              Shift: Day | {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
