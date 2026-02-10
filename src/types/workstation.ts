export interface WorkStation {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface StationDependency {
  id: string;
  stationId: string;
  dependsOnStationId: string;
}
