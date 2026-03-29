import {
  AlertTriangleIcon,
  ClockIcon,
  FactoryIcon,
  PackageIcon,
  TargetIcon,
  TimerIcon,
  TrendingUpIcon,
} from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label={t("dashboard.kpi.activeOrdersTitle")}
        value={activeOrders}
        hint={t("dashboard.kpi.totalOrdersSubtitle", { count: totalOrders })}
        icon={<PackageIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.inProductionTitle")}
        value={activeBatches}
        hint={t("dashboard.kpi.activeWorkBatchesSubtitle")}
        icon={<ClockIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.completedTodayTitle")}
        value={completedToday}
        hint={t("dashboard.kpi.batchesFinishedSubtitle")}
        icon={<TrendingUpIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.bottlenecksTitle")}
        value={lateBatches}
        hint={t("dashboard.kpi.batchesOverEstimateSubtitle")}
        tone={lateBatches > 0 ? "warning" : "default"}
        icon={lateBatches > 0 ? <AlertTriangleIcon className="w-4 h-4" /> : undefined}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.dueSoonTitle")}
        value={dueSoonOrders}
        hint={t("dashboard.kpi.ordersApproachingDueDateSubtitle")}
        tone="warning"
        icon={<ClockIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.overdueTitle")}
        value={overdueOrders}
        hint={t("dashboard.kpi.ordersPastDueDateSubtitle")}
        tone="danger"
        icon={<AlertTriangleIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.onTimeRateTitle")}
        value={onTimeLabel}
        hint={t("dashboard.kpi.onTimeRateSubtitle", {
          count: completedOrdersForOnTime,
        })}
        tone="success"
        icon={<TargetIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold"
      />
      <KpiCard
        label={t("dashboard.kpi.leadTimeMedianTitle")}
        value={leadTimeLabel}
        hint={t("dashboard.kpi.leadTimeMedianSubtitle")}
        icon={<TimerIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold text-sky-600"
      />
      <KpiCard
        label={t("dashboard.kpi.cycleTimeByStationTitle")}
        value={cycleTimeLabel}
        hint={t("dashboard.kpi.cycleTimeByStationSubtitle", {
          station: slowestStationName ?? t("dashboard.kpi.notAvailable"),
          count: slowestStationSampleSize,
        })}
        icon={<FactoryIcon className="w-4 h-4" />}
        valueClassName="text-[1.75rem] leading-none font-bold text-violet-600"
      />
    </div>
  );
}
