"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/components/ui/utils";
import type { ProductionSplitRow } from "@/lib/domain/buildProductionSplitRows";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ProductionStation } from "@/types/production";
import { XIcon } from "lucide-react";

export type ProductionSplitPlannerRow = ProductionSplitRow & {
  locked?: boolean;
  lockReason?: string;
  currentStationName?: string | null;
  sourceRunId?: string | null;
  sourceRunIds?: string[];
};

type ProductionSplitPlannerProps = {
  open: boolean;
  mode: "release" | "replan";
  rows: ProductionSplitPlannerRow[];
  stations: ProductionStation[];
  selections: Record<string, string[]>;
  plannedDates: Record<string, string>;
  globalDate: string;
  submitting?: boolean;
  onClose: () => void;
  onSelectionChange: (rowId: string, stationIds: string[]) => void;
  onDateChange: (rowId: string, value: string) => void;
  onGlobalDateChange: (value: string) => void;
  onSubmit: () => void;
};

export function ProductionSplitPlanner({
  open,
  mode,
  rows,
  stations,
  selections,
  plannedDates,
  globalDate,
  submitting = false,
  onClose,
  onSelectionChange,
  onDateChange,
  onGlobalDateChange,
  onSubmit,
}: ProductionSplitPlannerProps) {
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  const uniqueRows = rows.filter(
    (row, index, collection) =>
      collection.findIndex((candidate) => candidate.id === row.id) === index,
  );

  const title =
    mode === "replan"
      ? t("production.main.split.replanConstructions")
      : t("production.main.split.splitByStations");
  const description =
    mode === "replan"
      ? t("production.main.split.replanDescription")
      : t("production.main.split.splitDescription");

  const selectableRows = uniqueRows.filter((row) => !row.locked);
  const hasSelections = selectableRows.some((row) => (selections[row.id] ?? []).length > 0);
  const singleStationReplan =
    mode === "replan" && stations.length === 1;
  const fixedStation = singleStationReplan ? stations[0] : null;

  const applySelectionToAll = (stationIds: string[]) => {
    selectableRows.forEach((row) => onSelectionChange(row.id, stationIds));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("production.main.split.close")}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-border bg-muted/20 px-5 py-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <DatePicker
              label={t("production.main.split.commonPlannedDate")}
              value={globalDate}
              onChange={(value) => onGlobalDateChange(value || globalDate)}
              className="min-w-[220px] text-xs text-muted-foreground"
              triggerClassName="h-10"
            />
            {singleStationReplan && fixedStation ? (
              <div className="flex h-10 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground">
                {fixedStation.name}
              </div>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    applySelectionToAll(stations.map((station) => station.id))
                  }
                >
                  {t("production.main.split.selectAllStations")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applySelectionToAll([])}
                >
                  {t("production.main.split.clearAll")}
                </Button>
              </>
            )}
            <div className="text-sm text-muted-foreground">
              {t("production.main.split.rows")}:{" "}
              <span className="font-medium text-foreground">{uniqueRows.length}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-2.5">
            {uniqueRows.map((row) => {
              const rowSelections = selections[row.id] ?? [];

              return (
                <Card
                  key={row.id}
                  className={cn(
                    "border-border/80 shadow-sm",
                    row.locked ? "bg-muted/30" : "bg-card",
                  )}
                >
                  <CardContent className="pt-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_220px_minmax(0,1.35fr)]">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-start gap-2">
                          <h3 className="text-[15px] font-semibold text-foreground">{row.itemName}</h3>
                          <Badge variant="outline">{row.orderNumber}</Badge>
                          <Badge variant="secondary">
                            {t("production.main.common.qty")} {row.qty}
                          </Badge>
                          {row.currentStationName ? (
                            <Badge variant="secondary">{row.currentStationName}</Badge>
                          ) : null}
                          {row.locked ? (
                            <Badge variant="destructive">
                              {t("production.main.split.locked")}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {row.customerName} {row.material ? `| ${row.material}` : ""}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.fieldLabel}
                          {row.lockReason ? ` | ${row.lockReason}` : ""}
                        </div>
                      </div>

                      <DatePicker
                        label={t("production.main.split.plannedDate")}
                        value={plannedDates[row.id] ?? globalDate}
                        onChange={(value) => onDateChange(row.id, value || globalDate)}
                        disabled={row.locked}
                        className="text-xs text-muted-foreground"
                        triggerClassName="h-10"
                      />

                      <div className="space-y-1.5">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("production.main.split.stations")}
                        </div>
                        {singleStationReplan && fixedStation ? (
                          <div
                            className={cn(
                              "flex h-11 items-center rounded-xl border border-border bg-background px-3 text-[13px] font-medium text-foreground",
                              row.locked && "opacity-60",
                            )}
                          >
                            {fixedStation.name}
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {stations.map((station) => {
                              const checked = rowSelections.includes(station.id);
                              return (
                                <label
                                  key={station.id}
                                  className={cn(
                                    "flex items-center gap-3 rounded-xl border px-3 py-1.5 text-[13px]",
                                    checked
                                      ? "border-foreground/20 bg-foreground/5"
                                      : "border-border bg-background",
                                    row.locked && "opacity-60",
                                  )}
                                >
                                  <Checkbox
                                    variant="box"
                                    checked={checked}
                                    disabled={row.locked}
                                    onChange={() =>
                                      onSelectionChange(
                                        row.id,
                                        checked
                                          ? rowSelections.filter((id) => id !== station.id)
                                          : [...rowSelections, station.id],
                                      )
                                    }
                                  />
                                  <span>{station.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {hasSelections
              ? t("production.main.split.selectedRowsQueued")
              : t("production.main.split.pickAtLeastOneStation")}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              {t("production.main.common.cancel")}
            </Button>
            <Button onClick={onSubmit} disabled={!hasSelections || submitting}>
              {submitting
                ? mode === "replan"
                  ? t("production.main.split.replanning")
                  : t("production.main.split.creating")
                : mode === "replan"
                  ? t("production.main.split.replanSelectedRows")
                  : t("production.main.split.createWorkOrders")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
