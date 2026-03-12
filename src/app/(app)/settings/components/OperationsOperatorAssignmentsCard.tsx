"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { WorkStation } from "@/types/workstation";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type UserLike = {
  id: string;
  name: string;
  role: string;
};

type OperationsOperatorAssignmentsCardProps = {
  t: TranslationFn;
  operatorAssignmentsError: string | null;
  displayStations: WorkStation[];
  isAssignmentsLoading: boolean;
  users: UserLike[];
  operatorAssignmentsByKey: Map<string, unknown>;
  handleToggleOperatorAssignment: (
    userId: string,
    stationId: string,
  ) => Promise<void> | void;
};

export function OperationsOperatorAssignmentsCard(
  props: OperationsOperatorAssignmentsCardProps,
) {
  const {
    t,
    operatorAssignmentsError,
    displayStations,
    isAssignmentsLoading,
    users,
    operatorAssignmentsByKey,
    handleToggleOperatorAssignment,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("settings.operations.operatorAssignmentsTitle")}
        </CardTitle>
        <CardDescription>
          {t("settings.operations.operatorAssignmentsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {operatorAssignmentsError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {operatorAssignmentsError}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-190 w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">
                  {t("settings.operations.user")}
                </th>
                {displayStations.map((station) => (
                  <th key={station.id} className="px-4 py-2 text-left">
                    {station.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isAssignmentsLoading ? (
                <tr>
                  <td
                    colSpan={Math.max(1, displayStations.length + 1)}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    <LoadingSpinner
                      className="justify-center"
                      label={t("settings.operations.loadingAssignments")}
                    />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, displayStations.length + 1)}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    {t("settings.users.noUsers")}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">
                      {user.name}
                      <div className="text-xs text-muted-foreground">
                        {user.role}
                      </div>
                    </td>
                    {displayStations.map((station) => {
                      const key = `${user.id}:${station.id}`;
                      const isAssigned = operatorAssignmentsByKey.has(key);
                      return (
                        <td key={station.id} className="px-4 py-2">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={isAssigned}
                              onChange={() =>
                                void handleToggleOperatorAssignment(
                                  user.id,
                                  station.id,
                                )
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {t("settings.operations.assigned")}
                            </span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
