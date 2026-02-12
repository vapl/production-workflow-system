import type { WorkflowStatusColor } from "@/contexts/WorkflowContext";

export function getStatusBadgeColorClass(color?: WorkflowStatusColor) {
  switch (color) {
    case "blue":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rose":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "slate":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
