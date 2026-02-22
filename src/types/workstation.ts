export type StationTrackingMode =
  | "construction_level"
  | "order_level"
  | "receipt_only";

export interface WorkStation {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  trackingMode?: StationTrackingMode;
}

export interface StationDependency {
  id: string;
  stationId: string;
  dependsOnStationId: string;
}
