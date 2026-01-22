import { DashboardView } from "./DashboardView";
import { useDashboard } from "@/hooks/useDashboard";

export function DashboardContainer() {
  const dashboard = useDashboard();

  return <DashboardView {...dashboard} />;
}
