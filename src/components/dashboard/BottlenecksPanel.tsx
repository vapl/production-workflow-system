import type { DashboardBottleneck } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { AlertTriangleIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { formatWorkedDuration } from "@/lib/domain/productionOperators";

export function BottlenecksPanel({ batches }: { batches: DashboardBottleneck[] }) {
  const { t } = useI18n();

  if (batches.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
          {t("dashboard.bottlenecksPanel.title")}
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
                <div className="font-medium">{batch.label}</div>
                <div className="text-sm text-slate-600">
                  {batch.orderNumber} / {batch.stationName}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-medium text-amber-700">
                  {formatWorkedDuration(batch.durationMinutes)}
                </div>
                <div className="text-xs text-slate-600">
                  {batch.status === "blocked"
                    ? t("dashboard.bottlenecksPanel.title")
                    : batch.plannedDate
                      ? `${t("dashboard.bottlenecksPanel.station")}: ${batch.plannedDate}`
                      : t("dashboard.bottlenecksPanel.overEstimate")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
