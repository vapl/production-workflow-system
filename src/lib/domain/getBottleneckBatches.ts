import type { Batch } from "@/types/batch";

/**
 * A bottleneck is a batch that is either:
 * - blocked
 * - or exceeds estimated time
 */

export function getBottleneckBatches(batches: Batch[]): Batch[] {
  return batches.filter((batch) => {
    if (batch.status === "blocked") return true;

    if (
      batch.actualHours !== undefined &&
      batch.actualHours > batch.estimatedHours
    ) {
      return true;
    }
    return false;
  });
}
