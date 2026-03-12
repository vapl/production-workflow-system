"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type SaveState = "idle" | "saving" | "saved" | "error";

type OperationsNotificationsCardProps = {
  t: TranslationFn;
  notificationRoles: string[];
  setNotificationRoles: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  formatUserRoleLabel: (role: string) => string;
  handleSaveNotificationRoles: () => Promise<void> | void;
  notificationState: SaveState;
  notificationMessage: string;
};

const NOTIFICATION_ROLE_OPTIONS = [
  "Production planner",
  "Admin",
  "Owner",
  "Warehouse",
  "Engineering",
  "Sales",
] as const;

export function OperationsNotificationsCard(
  props: OperationsNotificationsCardProps,
) {
  const {
    t,
    notificationRoles,
    setNotificationRoles,
    formatUserRoleLabel,
    handleSaveNotificationRoles,
    notificationState,
    notificationMessage,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.operations.notificationsTitle")}</CardTitle>
        <CardDescription>
          {t("settings.operations.notificationsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          {NOTIFICATION_ROLE_OPTIONS.map((role) => (
            <label
              key={role}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <Checkbox
                checked={notificationRoles.includes(role)}
                onChange={(event) => {
                  setNotificationRoles((prev) => {
                    if (event.target.checked) {
                      return [...new Set([...prev, role])];
                    }
                    return prev.filter((item) => item !== role);
                  });
                }}
              />
              {role === "Owner" ? role : formatUserRoleLabel(role)}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void handleSaveNotificationRoles()}
            disabled={notificationState === "saving"}
          >
            {notificationState === "saving"
              ? t("settings.users.saving")
              : t("settings.operations.saveNotificationRoles")}
          </Button>
          {notificationState !== "idle" && notificationMessage ? (
            <span
              className={`text-xs ${
                notificationState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {notificationMessage}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
