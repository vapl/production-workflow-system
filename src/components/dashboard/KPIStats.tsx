import {
  AlertTriangleIcon,
  ClockIcon,
  FactoryIcon,
  PackageIcon,
  TargetIcon,
  TimerIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { useI18n } from "@/lib/i18n/useI18n";

export function KPIStats({
  kpis,
}: {
  kpis: {
    activeOrders: number;
    totalOrders: number;
    activeBatches: number;
    completedToday: number;
    lateBatches: number;
    dueSoonOrders: number;
    overdueOrders: number;
    onTimeRate: number | null;
    completedOrdersForOnTime: number;
    leadTimeMedianHours: number | null;
    slowestStationName: string | null;
    slowestStationMedianHours: number | null;
    slowestStationSampleSize: number;
  };
}) {
  const { t } = useI18n();
  const {
    activeOrders,
    totalOrders,
    activeBatches,
    completedToday,
    lateBatches,
    dueSoonOrders,
    overdueOrders,
    onTimeRate,
    completedOrdersForOnTime,
    leadTimeMedianHours,
    slowestStationName,
    slowestStationMedianHours,
    slowestStationSampleSize,
  } = kpis;
  const onTimeLabel =
    onTimeRate === null ? "--" : `${Math.round(onTimeRate * 10) / 10}%`;
  const leadTimeLabel =
    leadTimeMedianHours === null
      ? "--"
      : `${Math.round(leadTimeMedianHours * 10) / 10}h`;
  const cycleTimeLabel =
    slowestStationMedianHours === null
      ? "--"
      : `${Math.round(slowestStationMedianHours * 10) / 10}h`;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.activeOrdersTitle")}</CardTitle>
            <PackageIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold">{activeOrders}</div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.totalOrdersSubtitle", { count: totalOrders })}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.inProductionTitle")}</CardTitle>
            <ClockIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold">{activeBatches}</div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.activeWorkBatchesSubtitle")}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.completedTodayTitle")}</CardTitle>
            <TrendingUpIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold">{completedToday}</div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.batchesFinishedSubtitle")}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.bottlenecksTitle")}</CardTitle>
            {lateBatches > 0 && (
              <AlertTriangleIcon className="w-4 h-4 text-amber-500" />
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div
              className={`text-[1.75rem] leading-none font-bold ${lateBatches > 0 ? "text-amber-600" : ""}`}
            >
              {lateBatches}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.batchesOverEstimateSubtitle")}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.dueSoonTitle")}</CardTitle>
            <ClockIcon className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-amber-600">
              {dueSoonOrders}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.ordersApproachingDueDateSubtitle")}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.overdueTitle")}</CardTitle>
            <AlertTriangleIcon className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-rose-600">
              {overdueOrders}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.ordersPastDueDateSubtitle")}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.onTimeRateTitle")}</CardTitle>
            <TargetIcon className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-emerald-600">
              {onTimeLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.onTimeRateSubtitle", {
                count: completedOrdersForOnTime,
              })}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.leadTimeMedianTitle")}</CardTitle>
            <TimerIcon className="w-4 h-4 text-sky-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-sky-600">
              {leadTimeLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.leadTimeMedianSubtitle")}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-1 sm:px-6 sm:pt-6 sm:pb-2">
            <CardTitle className="text-sm">{t("dashboard.kpi.cycleTimeByStationTitle")}</CardTitle>
            <FactoryIcon className="w-4 h-4 text-violet-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="text-[1.75rem] leading-none font-bold text-violet-600">
              {cycleTimeLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.kpi.cycleTimeByStationSubtitle", {
                station: slowestStationName ?? t("dashboard.kpi.notAvailable"),
                count: slowestStationSampleSize,
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
