export type BatchStatus = "planned" | "in_progress" | "blocked" | "completed";

export interface Batch {
  id: string;
  orderId: string;
  name: string;
  workstation: string;
  operator?: string;
  estimatedHours: number;
  actualHours?: number;
  completedAt?: string; // ISO date string
  status: BatchStatus;
}
