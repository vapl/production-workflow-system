import type { BatchRunRow, ProductionItemRow } from "@/types/production";

export type ProductionLiveStatusChangedEvent = {
  type: "status-changed";
  runId: string;
  runIds?: string[];
  orderId: string;
  batchCode: string;
  stationId: string | null;
  status: BatchRunRow["status"];
  startedAt: string | null;
  doneAt: string | null;
  durationMinutes: number | null;
  itemIds?: string[];
  changedAt: string;
};

export type ProductionLiveEvent = ProductionLiveStatusChangedEvent;

const CHANNEL_NAME = "production-live";

function getChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel(CHANNEL_NAME);
}

export function publishProductionLiveEvent(event: ProductionLiveEvent) {
  const channel = getChannel();
  if (!channel) {
    return;
  }
  channel.postMessage(event);
  channel.close();
}

export function subscribeProductionLiveEvents(
  callback: (event: ProductionLiveEvent) => void,
) {
  const channel = getChannel();
  if (!channel) {
    return () => {};
  }
  const handler = (message: MessageEvent<ProductionLiveEvent>) => {
    if (!message.data || typeof message.data !== "object") {
      return;
    }
    callback(message.data);
  };
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}

export function collectRunItemIds(
  items: ProductionItemRow[],
  batchRun: Pick<BatchRunRow, "order_id" | "batch_code" | "station_id">,
) {
  return items
    .filter(
      (item) =>
        item.order_id === batchRun.order_id &&
        item.batch_code === batchRun.batch_code &&
        item.station_id === batchRun.station_id,
    )
    .map((item) => item.id);
}
