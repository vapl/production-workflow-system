import type { Activity } from "@/types/activity";
import type { ActivityStatus } from "@/types/activity";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { AlertTriangleIcon, CheckCircleIcon, ClockIcon } from "lucide-react";
import { Badge } from "../ui/Badge";
import { formatActivityStatus, formatTime } from "@/lib/domain/formatters";

export function getStatusColor(status: ActivityStatus): string {
  switch (status) {
    case "blocked":
      return "bg-amber-100 text-amber-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "in_progress":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-muted";
  }
}

export function getStatusIcon(status: ActivityStatus) {
  switch (status) {
    case "blocked":
      return <AlertTriangleIcon className="h-4 w-4" />;
    case "completed":
      return <CheckCircleIcon className="h-4 w-4" />;
    case "in_progress":
      return <ClockIcon className="h-4 w-4" />;
  }
}

export function RecentActivityList({ activities }: { activities: Activity[] }) {
  return (
    <>
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between py-3 border-b border-foreground/20 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${getStatusColor(activity.status)}`}
                  >
                    {getStatusIcon(activity.status)}
                  </div>
                  <div>
                    <div className="font-medium">{activity.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {activity.orderNumber &&
                        activity.workStation &&
                        activity.orderNumber + " • " + activity.workStation}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    variant="outline"
                    className={getStatusColor(activity.status)}
                  >
                    {formatActivityStatus(activity.status)}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatTime(activity.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
