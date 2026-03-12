"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import type { WorkStation } from "@/types/workstation";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type OperationsStationDependenciesCardProps = {
  t: TranslationFn;
  displayStations: WorkStation[];
  stationDependenciesByStation: Map<string, Set<string>>;
  updateStationDependencies: (
    stationId: string,
    dependencyIds: string[],
  ) => Promise<void> | void;
};

export function OperationsStationDependenciesCard(
  props: OperationsStationDependenciesCardProps,
) {
  const {
    t,
    displayStations,
    stationDependenciesByStation,
    updateStationDependencies,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("settings.operations.stationDependenciesTitle")}
        </CardTitle>
        <CardDescription>
          {t("settings.operations.stationDependenciesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {displayStations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {t("settings.operations.addStationsForDependencies")}
          </div>
        ) : (
          <div className="space-y-3">
            {displayStations.map((station) => {
              const selected =
                stationDependenciesByStation.get(station.id) ?? new Set<string>();
              const available = displayStations.filter(
                (other) => other.id !== station.id,
              );
              return (
                <div
                  key={station.id}
                  className="rounded-lg border border-border px-4 py-3"
                >
                  <div className="text-sm font-medium">{station.name}</div>
                  {available.length === 0 ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t("settings.operations.noOtherStations")}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {available.map((dep) => {
                        const checked = selected.has(dep.id);
                        return (
                          <label
                            key={dep.id}
                            className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
                          >
                            <Checkbox
                              checked={checked}
                              onChange={(event) => {
                                const next = new Set(selected);
                                if (event.target.checked) {
                                  next.add(dep.id);
                                } else {
                                  next.delete(dep.id);
                                }
                                void updateStationDependencies(
                                  station.id,
                                  Array.from(next),
                                );
                              }}
                            />
                            {dep.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
