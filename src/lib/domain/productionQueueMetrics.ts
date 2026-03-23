import type { ProductionQueueItem } from "@/lib/domain/productionQueue";
import type { ProductionStation } from "@/types/production";

export type StationQueueMetrics = {
  queueCount: number;
  totalQty: number;
  totalMinutes: number;
  blockedCount: number;
  lateCount: number;
};

export function computeStationQueueMetrics(
  stations: ProductionStation[],
  queueByStation: Map<string, ProductionQueueItem[]>,
  todayIso: string,
) {
  const metrics = new Map<string, StationQueueMetrics>();

  stations.forEach((station) => {
    const queue = queueByStation.get(station.id) ?? [];
    const stationMetrics = queue.reduce<StationQueueMetrics>(
      (acc, item) => {
        acc.queueCount += 1;
        acc.totalQty += Number(item.totalQty ?? 0);
        acc.totalMinutes += Number(item.durationMinutes ?? 0);
        if (item.status === "blocked") {
          acc.blockedCount += 1;
        }
        if (item.dueDate && item.dueDate <= todayIso) {
          acc.lateCount += 1;
        }
        return acc;
      },
      {
        queueCount: 0,
        totalQty: 0,
        totalMinutes: 0,
        blockedCount: 0,
        lateCount: 0,
      },
    );
    metrics.set(station.id, stationMetrics);
  });

  return metrics;
}

export function formatQueueDuration(totalMinutes: number) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
