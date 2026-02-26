import type { ProductionCompletionConfig } from "@/contexts/WorkflowContext";

export interface ProductionCompletionItem {
  status: string;
  stationId?: string | null;
}

export function isOrderProductionComplete(
  items: ProductionCompletionItem[],
  config: ProductionCompletionConfig,
): boolean {
  if (items.length === 0) {
    return false;
  }

  if (config.mode === "completion_stations_done") {
    const stationIds = new Set(config.completionStationIds);
    if (stationIds.size === 0) {
      return false;
    }
    const completionItems = items.filter(
      (item) => item.stationId && stationIds.has(item.stationId),
    );
    if (completionItems.length === 0) {
      return false;
    }
    return completionItems.every((item) => item.status === "done");
  }

  return items.every((item) => item.status === "done");
}
