export type ActivityStatus = "in_progress" | "completed" | "blocked";

export interface Activity {
  id: string;
  title: string;
  timestamp: string; // ISO

  // UI-needed metadata (flat, optional)
  status: ActivityStatus;
  orderNumber?: string;
  workStation?: string;
}
