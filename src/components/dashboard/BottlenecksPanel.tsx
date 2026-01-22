import type { Batch } from "@/types/batch";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { AlertTriangleIcon } from "lucide-react";

export function BottlenecksPanel({ batches }: { batches: Batch[] }) {
  if (batches.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
          Bottlenecks Requiring Attention
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="flex items-center justify-between rounded-lg bg-amber-50 p-3 text-slate-900"
            >
              <div className="flex-1">
                <div className="font-medium">{batch.name}</div>
                <div className="text-sm text-slate-600">
                  Station: {batch.workstation}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-medium text-amber-700">
                  {batch.actualHours ?? 0}h / {batch.estimatedHours}h
                </div>
                <div className="text-xs text-slate-600">
                  Over estimate
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
