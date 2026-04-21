export interface DashboardKpis {
  activeOrders: number;
  activeBatches: number;
  completedToday: number;
  lateBatches: number;
  totalOrders: number;
  dueSoonOrders: number;
  overdueOrders: number;
  onTimeRate: number | null;
  completedOrdersForOnTime: number;
  leadTimeMedianHours: number | null;
  slowestStationName: string | null;
  slowestStationMedianHours: number | null;
  slowestStationSampleSize: number;
}

export interface DashboardBottleneck {
  id: string;
  label: string;
  orderNumber: string;
  stationName: string;
  durationMinutes: number;
  plannedDate: string | null;
  status: "blocked" | "late";
}
