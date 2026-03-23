"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookCopyIcon,
  CheckIcon,
  GripVerticalIcon,
  PlusIcon,
  SaveIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useI18n } from "@/lib/i18n/useI18n";
import { formatProductionDuration } from "@/lib/domain/productionJobDetail";
import type { BatchRunRow, StationTrackingMode } from "@/types/production";
import { Input } from "@/components/ui/Input";

type RoutingStation = {
  id: string;
  tenantId?: string | null;
  name: string;
  description?: string | null;
  trackingMode?: StationTrackingMode;
};

type StationDependencyRow = {
  id: string;
  stationId: string;
  dependsOnStationId: string;
};

type EditableRun = {
  id: string;
  stationId: string;
  plannedDate: string;
  stepIndex: number;
  status: BatchRunRow["status"];
  batchCode: string;
  durationMinutes: number;
};

type SavePayload = {
  runs: EditableRun[];
  trackingModes: Record<string, StationTrackingMode>;
  dependencySelections: Record<string, string[]>;
};

type RouteUnitOption = {
  id: string;
  label: string;
};

type ProductionRoutingSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  runs: BatchRunRow[];
  stations: RoutingStation[];
  dependencies: StationDependencyRow[];
  onSave: (payload: SavePayload) => Promise<void> | void;
  onSyncCurrentUnit?: (payload: SavePayload) => Promise<void> | void;
  unitOptions: RouteUnitOption[];
  currentUnitId: string | null;
  onApplyRoute?: (payload: {
    targetUnitIds: string[];
    includeDates: boolean;
    runs: EditableRun[];
  }) => Promise<void> | void;
  onOpenStationCatalog?: () => void;
  isSaving?: boolean;
};

const TRACKING_MODE_OPTIONS: StationTrackingMode[] = [
  "construction_level",
  "order_level",
  "receipt_only",
];

function reorderRunsByInsertIndex(
  runs: EditableRun[],
  draggedId: string,
  insertIndex: number,
) {
  const fromIndex = runs.findIndex((run) => run.id === draggedId);
  if (fromIndex === -1) {
    return runs;
  }

  const next = [...runs];
  const [moved] = next.splice(fromIndex, 1);
  const normalizedIndex = Math.max(0, Math.min(insertIndex, next.length));
  next.splice(normalizedIndex, 0, moved);
  return next.map((run, index) => ({ ...run, stepIndex: index }));
}

export function ProductionRoutingSettingsModal(
  props: ProductionRoutingSettingsModalProps,
) {
  const { t } = useI18n();
  const {
    open,
    onClose,
    runs,
    stations,
    dependencies,
    onSave,
    onSyncCurrentUnit,
    unitOptions,
    currentUnitId,
    onApplyRoute,
    onOpenStationCatalog,
    isSaving,
  } = props;

  const [localRuns, setLocalRuns] = useState<EditableRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [draggedRunId, setDraggedRunId] = useState<string | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [newStationId, setNewStationId] = useState<string>("");
  const [isAddingOperation, setIsAddingOperation] = useState(false);
  const [isApplyRouteOpen, setIsApplyRouteOpen] = useState(false);
  const [applyMode, setApplyMode] = useState<"all" | "selected">("all");
  const [applyIncludeDates, setApplyIncludeDates] = useState(false);
  const [selectedTargetUnitIds, setSelectedTargetUnitIds] = useState<string[]>(
    [],
  );
  const [applySearch, setApplySearch] = useState("");
  const [trackingModes, setTrackingModes] = useState<
    Record<string, StationTrackingMode>
  >({});
  const [dependencySelections, setDependencySelections] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextRuns = [...runs]
      .sort((a, b) => a.step_index - b.step_index)
      .map((run, index) => ({
        id: run.id,
        stationId: run.station_id ?? "",
        plannedDate: run.planned_date ?? "",
        stepIndex: index,
        status: run.status,
        batchCode: run.batch_code,
        durationMinutes: Number(run.duration_minutes ?? 0),
        }));

    // Modal open should reset local editable state from the latest props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalRuns(nextRuns);
    setSelectedRunId(nextRuns[0]?.id ?? null);
    setTrackingModes(
      Object.fromEntries(
        stations.map((station) => [
          station.id,
          station.trackingMode ?? "construction_level",
        ]),
      ),
    );
    setDependencySelections(
      Object.fromEntries(
        stations.map((station) => [
          station.id,
          dependencies
            .filter((dependency) => dependency.stationId === station.id)
            .map((dependency) => dependency.dependsOnStationId),
        ]),
      ),
    );
    setNewStationId(stations[0]?.id ?? "");
    setIsAddingOperation(false);
    setIsApplyRouteOpen(false);
    setApplyMode("all");
    setApplyIncludeDates(false);
    setApplySearch("");
    setSelectedTargetUnitIds(
      unitOptions
        .filter((unit) => unit.id !== currentUnitId)
        .map((unit) => unit.id),
    );
  }, [currentUnitId, dependencies, open, runs, stations, unitOptions]);

  const usedStationIds = useMemo(
    () => new Set(localRuns.map((run) => run.stationId).filter(Boolean)),
    [localRuns],
  );
  const availableStations = useMemo(
    () => stations.filter((station) => !usedStationIds.has(station.id)),
    [stations, usedStationIds],
  );
  const applyableUnits = useMemo(
    () => unitOptions.filter((unit) => unit.id !== currentUnitId),
    [currentUnitId, unitOptions],
  );
  const filteredApplyableUnits = useMemo(() => {
    const query = applySearch.trim().toLowerCase();
    if (!query) return applyableUnits;
    return applyableUnits.filter((unit) =>
      unit.label.toLowerCase().includes(query),
    );
  }, [applySearch, applyableUnits]);
  const selectedApplyableCount = useMemo(
    () =>
      selectedTargetUnitIds.filter((id) =>
        applyableUnits.some((unit) => unit.id === id),
      ).length,
    [applyableUnits, selectedTargetUnitIds],
  );

  useEffect(() => {
    if (availableStations.length === 0) {
      // Reset inline add controls when the route already contains every station.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewStationId("");
      setIsAddingOperation(false);
      return;
    }
    if (!availableStations.some((station) => station.id === newStationId)) {
      setNewStationId(availableStations[0]?.id ?? "");
    }
  }, [availableStations, newStationId]);

  const selectedRun =
    localRuns.find((run) => run.id === selectedRunId) ?? localRuns[0] ?? null;
  const selectedStation = useMemo(
    () =>
      stations.find((station) => station.id === selectedRun?.stationId) ?? null,
    [selectedRun?.stationId, stations],
  );
  const dependencyOptions = useMemo(
    () =>
      stations.filter((station) => station.id !== selectedStation?.id),
    [selectedStation?.id, stations],
  );

  const handleAddOperation = () => {
    if (!newStationId) {
      return;
    }
    const nextId = `new:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const nextRun: EditableRun = {
      id: nextId,
      stationId: newStationId,
      plannedDate: selectedRun?.plannedDate ?? "",
      stepIndex: localRuns.length,
      status: "queued",
      batchCode: selectedRun?.batchCode ?? runs[0]?.batch_code ?? "B1",
      durationMinutes: 0,
    };
    setLocalRuns((prev) => [...prev, nextRun]);
    setSelectedRunId(nextId);
    setIsAddingOperation(false);
  };

  const handleRemoveOperation = (runId: string) => {
    const nextRuns = localRuns
      .filter((run) => run.id !== runId)
      .map((run, index) => ({ ...run, stepIndex: index }));
    setLocalRuns(nextRuns);
    setSelectedRunId((prev) => {
      if (prev === runId) {
        return nextRuns[0]?.id ?? null;
      }
      return prev;
    });
  };
  const handleApplyRouteNow = async (targetUnitIds: string[]) => {
    if (!onApplyRoute || targetUnitIds.length === 0) {
      return;
    }
    if (onSyncCurrentUnit) {
      await onSyncCurrentUnit({
        runs: localRuns,
        trackingModes,
        dependencySelections,
      });
    }
    await onApplyRoute({
      targetUnitIds,
      includeDates: applyIncludeDates,
      runs: localRuns,
    });
    setIsApplyRouteOpen(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      ariaLabel={t("production.main.jobs.routingSettings")}
      title={t("production.main.jobs.routingSettings")}
      closeButtonLabel={t("production.main.common.close")}
      desktopPanelClassName="w-[min(96vw,1240px)]"
      desktopBodyClassName="min-h-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[360px_1fr]">
        <div className="border-b border-border p-4 md:min-h-0 md:border-b-0 md:border-r">
          <div className="mb-3 text-sm font-semibold">
            {t("production.main.jobs.routingOperations")}
          </div>
          <div className="space-y-2 overflow-y-auto md:max-h-full">
            {localRuns.map((run, index) => {
              const stationName =
                stations.find((station) => station.id === run.stationId)?.name ??
                t("production.main.jobs.unassigned");
              return (
                <div key={run.id} className="space-y-2">
                  <div
                    className={`rounded-full transition-all ${
                      draggedRunId
                        ? dragInsertIndex === index
                          ? "h-2 bg-emerald-200/90"
                          : "h-1 bg-transparent"
                        : "h-0 bg-transparent"
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragInsertIndex !== index) {
                        setDragInsertIndex(index);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedRunId) return;
                      setLocalRuns((prev) =>
                        reorderRunsByInsertIndex(prev, draggedRunId, index),
                      );
                      setDraggedRunId(null);
                      setDragInsertIndex(null);
                    }}
                  />
                  <div
                    className={`group relative rounded-xl border px-3 py-3 transition ${
                      selectedRun?.id === run.id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-border bg-background hover:bg-muted/20"
                    } ${draggedRunId === run.id ? "opacity-50" : ""}`}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={() => {
                        setDraggedRunId(run.id);
                        setDragInsertIndex(index);
                      }}
                      onDragEnd={() => {
                        setDraggedRunId(null);
                        setDragInsertIndex(null);
                      }}
                      onClick={() => setSelectedRunId(run.id)}
                      className="flex w-full items-start gap-3 pr-8 text-left"
                    >
                      <div className="pt-0.5 text-muted-foreground">
                        <GripVerticalIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {index + 1}. {stationName}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("production.main.common.batch")} {run.batchCode} |{" "}
                          {t("production.main.jobs.duration")}{" "}
                          {formatProductionDuration(run.durationMinutes)}
                        </div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleRemoveOperation(run.id)}
                      aria-label={t("production.main.common.remove")}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                  {index === localRuns.length - 1 ? (
                    <div
                      className={`rounded-full transition-all ${
                        draggedRunId
                          ? dragInsertIndex === localRuns.length
                            ? "h-2 bg-emerald-200/90"
                            : "h-1 bg-transparent"
                          : "h-0 bg-transparent"
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragInsertIndex !== localRuns.length) {
                          setDragInsertIndex(localRuns.length);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!draggedRunId) return;
                        setLocalRuns((prev) =>
                          reorderRunsByInsertIndex(
                            prev,
                            draggedRunId,
                            localRuns.length,
                          ),
                        );
                        setDraggedRunId(null);
                        setDragInsertIndex(null);
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
            {isAddingOperation ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Select value={newStationId} onValueChange={setNewStationId}>
                    <SelectTrigger className="h-9 w-full bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStations.map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 justify-center"
                    onClick={handleAddOperation}
                    disabled={!newStationId}
                  >
                    <PlusIcon className="mr-2 h-4 w-4" />
                    {t("production.main.jobs.addOperationShort")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-3"
                    onClick={() => setIsAddingOperation(false)}
                  >
                    {t("production.main.common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingOperation(true)}
                disabled={availableStations.length === 0}
                className="flex h-16 w-full items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/20 disabled:text-muted-foreground"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-end border-b border-border px-4 py-3">
            {onOpenStationCatalog ? (
              <Button type="button" variant="outline" onClick={onOpenStationCatalog}>
                <Settings2Icon className="mr-2 h-4 w-4" />
                {t("production.main.jobs.stationCatalog")}
              </Button>
            ) : null}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {selectedRun ? (
              <>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="mb-3 text-sm font-semibold">
                    {t("production.main.jobs.selectedOperation")}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                      <div className="text-sm font-medium">
                        {selectedStation?.name ??
                          t("production.main.jobs.unassigned")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t("production.main.common.batch")} {selectedRun.batchCode} |{" "}
                        {t("production.main.jobs.duration")}{" "}
                        {formatProductionDuration(selectedRun.durationMinutes)}
                      </div>
                    </div>
                    <DatePicker
                      label={t("production.main.split.plannedDate")}
                      value={selectedRun.plannedDate}
                      onChange={(value) =>
                        setLocalRuns((prev) =>
                          prev.map((run) =>
                            run.id === selectedRun.id
                              ? { ...run, plannedDate: value ?? "" }
                              : run,
                          ),
                        )
                      }
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="mb-3 text-sm font-semibold">
                    {t("production.main.jobs.stationSettings")}
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        {selectedStation?.name ??
                          t("production.main.jobs.unassigned")}
                      </div>
                      {selectedStation?.description ? (
                        <div className="text-sm text-muted-foreground">
                          {selectedStation.description}
                        </div>
                      ) : null}
                    </div>

                    {selectedStation ? (
                      <>
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            {t("settings.operations.trackingMode")}
                          </div>
                          <Select
                            value={
                              trackingModes[selectedStation.id] ??
                              "construction_level"
                            }
                            onValueChange={(value) =>
                              setTrackingModes((prev) => ({
                                ...prev,
                                [selectedStation.id]:
                                  value as StationTrackingMode,
                              }))
                            }
                          >
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TRACKING_MODE_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {t(
                                    `production.main.jobs.trackingModeValues.${option}`,
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            {t("settings.operations.stationDependenciesTitle")}
                          </div>
                          {dependencyOptions.length > 0 ? (
                            <div className="space-y-2">
                              {dependencyOptions.map((station) => {
                                const selected =
                                  dependencySelections[selectedStation.id] ?? [];
                                return (
                                  <label
                                    key={`${selectedStation.id}:${station.id}`}
                                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                  >
                                    <Checkbox
                                      checked={selected.includes(station.id)}
                                      onChange={(event) =>
                                        setDependencySelections((prev) => {
                                          const current =
                                            prev[selectedStation.id] ?? [];
                                          return {
                                            ...prev,
                                            [selectedStation.id]:
                                              event.target.checked
                                                ? [...current, station.id]
                                                : current.filter(
                                                    (id) => id !== station.id,
                                                  ),
                                          };
                                        })
                                      }
                                    />
                                    {station.name}
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              {t("settings.operations.noOtherStations")}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {t("production.main.jobs.noQueueSteps")}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            {onApplyRoute && applyableUnits.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void handleApplyRouteNow(applyableUnits.map((unit) => unit.id))
                }
              >
                <CheckIcon className="mr-2 h-4 w-4" />
                {t("production.main.jobs.applyRouteAll")}
              </Button>
            ) : null}
            {onApplyRoute && applyableUnits.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsApplyRouteOpen((prev) => !prev)}
              >
                <BookCopyIcon className="mr-2 h-4 w-4" />
                {t("production.main.jobs.applyRouteSelectedCta")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon className="mr-2 h-4 w-4" />
              {t("production.main.common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() =>
                void onSave({
                  runs: localRuns,
                  trackingModes,
                  dependencySelections,
                })
              }
              disabled={isSaving}
            >
              <SaveIcon className="mr-2 h-4 w-4" />
              {t("production.main.common.save")}
            </Button>
          </div>
          {isApplyRouteOpen && onApplyRoute ? (
            <div className="border-t border-border p-4">
              <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      {t("production.main.jobs.applyRoute")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("production.main.jobs.applyRouteHint")}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("production.main.jobs.selectedCount", {
                      count:
                        applyMode === "all"
                          ? applyableUnits.length
                          : selectedApplyableCount,
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={applyMode === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setApplyMode("all")}
                  >
                    {t("production.main.jobs.applyRouteAll")}
                  </Button>
                  <Button
                    type="button"
                    variant={applyMode === "selected" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setApplyMode("selected")}
                  >
                    {t("production.main.jobs.applyRouteSelected")}
                  </Button>
                </div>
                {applyMode === "selected" ? (
                  <div className="space-y-3">
                    <Input
                      value={applySearch}
                      onChange={(event) => setApplySearch(event.target.value)}
                      placeholder={t("production.main.jobs.searchUnits")}
                      icon="search"
                      className="h-10"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedTargetUnitIds(filteredApplyableUnits.map((unit) => unit.id))
                        }
                      >
                        {t("production.main.jobs.selectAllUnits")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedTargetUnitIds([])}
                      >
                        {t("production.main.jobs.clearUnitSelection")}
                      </Button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                    {filteredApplyableUnits.map((unit) => (
                      <label
                        key={unit.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={selectedTargetUnitIds.includes(unit.id)}
                          onChange={(event) =>
                            setSelectedTargetUnitIds((prev) =>
                              event.target.checked
                                ? [...prev, unit.id]
                                : prev.filter((id) => id !== unit.id),
                            )
                          }
                        />
                        {unit.label}
                      </label>
                    ))}
                    </div>
                    {filteredApplyableUnits.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                        {t("production.main.jobs.noUnitsMatch")}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={applyIncludeDates}
                    onChange={(event) => setApplyIncludeDates(event.target.checked)}
                  />
                  {t("production.main.jobs.applyRouteIncludeDates")}
                </label>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() =>
                      void handleApplyRouteNow(
                        applyMode === "all"
                          ? applyableUnits.map((unit) => unit.id)
                          : selectedTargetUnitIds,
                      )
                    }
                    disabled={
                      isSaving ||
                      (applyMode === "selected" && selectedTargetUnitIds.length === 0)
                    }
                  >
                    <BookCopyIcon className="mr-2 h-4 w-4" />
                    {applyMode === "all"
                      ? t("production.main.jobs.applyRouteAll")
                      : t("production.main.jobs.applyRouteSelected")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ResponsiveModal>
  );
}
