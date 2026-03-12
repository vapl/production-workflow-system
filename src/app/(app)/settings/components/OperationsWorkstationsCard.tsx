"use client";

import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { InputField } from "@/components/ui/InputField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type { StationTrackingMode, WorkStation } from "@/types/workstation";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type OptionLike = {
  value: string;
  label: string;
};

type OperationsWorkstationsCardProps = {
  t: TranslationFn;
  optionLabel: (group: string, value: string, fallback: string) => string;
  stationName: string;
  setStationName: (value: string) => void;
  stationDescription: string;
  setStationDescription: (value: string) => void;
  stationTrackingMode: StationTrackingMode;
  setStationTrackingMode: (value: StationTrackingMode) => void;
  stationTrackingModeOptions: OptionLike[];
  handleSaveStation: () => Promise<void> | void;
  editingStationId: string | null;
  resetStationForm: () => void;
  selectedWorkStationIds: string[];
  setSelectedWorkStationIds: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  displayStations: WorkStation[];
  handleDeleteSelectedWorkStations: () => Promise<void> | void;
  setDragStationId: (value: string | null) => void;
  handleStationDrop: (targetId: string) => void;
  updateWorkStation: (
    stationId: string,
    patch: Partial<WorkStation>,
  ) => Promise<void> | void;
  handleEditStation: (stationId: string) => void;
  handleCopyWorkStation: (stationId: string) => Promise<void> | void;
  confirmRemove: (message: string) => Promise<boolean>;
  removeWorkStation: (stationId: string) => Promise<void> | void;
};

export function OperationsWorkstationsCard(
  props: OperationsWorkstationsCardProps,
) {
  const {
    t,
    optionLabel,
    stationName,
    setStationName,
    stationDescription,
    setStationDescription,
    stationTrackingMode,
    setStationTrackingMode,
    stationTrackingModeOptions,
    handleSaveStation,
    editingStationId,
    resetStationForm,
    selectedWorkStationIds,
    setSelectedWorkStationIds,
    displayStations,
    handleDeleteSelectedWorkStations,
    setDragStationId,
    handleStationDrop,
    updateWorkStation,
    handleEditStation,
    handleCopyWorkStation,
    confirmRemove,
    removeWorkStation,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.operations.workStationsTitle")}</CardTitle>
        <CardDescription>
          {t("settings.operations.workStationsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <InputField
            label={t("settings.operations.stationName")}
            value={stationName}
            onChange={(event) => setStationName(event.target.value)}
            placeholder={t("settings.operations.stationNamePlaceholder")}
            className="h-10 text-sm"
          />
          <InputField
            label={t("settings.operations.description")}
            value={stationDescription}
            onChange={(event) => setStationDescription(event.target.value)}
            placeholder={t("settings.operations.descriptionPlaceholder")}
            className="h-10 text-sm"
          />
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("settings.operations.trackingMode")}</span>
            <Select
              value={stationTrackingMode}
              onValueChange={(value) =>
                setStationTrackingMode(value as StationTrackingMode)
              }
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stationTrackingModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {optionLabel(
                      "stationTrackingMode",
                      option.value,
                      option.label,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
            <Button onClick={() => void handleSaveStation()}>
              {editingStationId
                ? t("settings.operations.saveStation")
                : t("settings.operations.addStation")}
            </Button>
            {editingStationId ? (
              <Button variant="outline" onClick={resetStationForm}>
                {t("settings.common.cancel")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm text-muted-foreground">
            {selectedWorkStationIds.length > 0
              ? t("settings.common.selectedCount", {
                  count: selectedWorkStationIds.length,
                })
              : " "}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                variant="box"
                checked={
                  displayStations.length > 0 &&
                  selectedWorkStationIds.length === displayStations.length
                }
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedWorkStationIds(
                      displayStations.map((station) => station.id),
                    );
                  } else {
                    setSelectedWorkStationIds([]);
                  }
                }}
                disabled={displayStations.length === 0}
              />
              {t("settings.operations.selectAll")}
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleDeleteSelectedWorkStations()}
              disabled={selectedWorkStationIds.length === 0}
            >
              {t("settings.common.removeSelected")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {displayStations.map((station, index) => (
            <div
              key={station.id}
              className="min-w-0 rounded-lg border border-border px-4 py-3"
              draggable
              onDragStart={() => setDragStationId(station.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleStationDrop(station.id)}
            >
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="wrap-break-word text-md font-semibold leading-tight">
                      {station.name}
                    </span>
                  </div>
                  <div className="mt-1 wrap-break-word text-sm text-muted-foreground">
                    {station.description ??
                      t("settings.operations.noDescription")}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm lg:mt-1">
                  <Checkbox
                    checked={station.isActive}
                    onChange={(event) =>
                      updateWorkStation(station.id, {
                        isActive: event.target.checked,
                      })
                    }
                  />
                  {t("settings.common.active")}
                </label>
              </div>
              <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <Select
                  value={station.trackingMode ?? "construction_level"}
                  onValueChange={(value) => {
                    void updateWorkStation(station.id, {
                      trackingMode: value as StationTrackingMode,
                    });
                  }}
                >
                  <SelectTrigger className="h-9 w-full rounded-md text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stationTrackingModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {optionLabel(
                          "stationTrackingMode",
                          option.value,
                          option.label,
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditStation(station.id)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyWorkStation(station.id)}
                  >
                    <CopyIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (
                        !(await confirmRemove(
                          t(
                            "settings.operations.removeWorkstationConfirm",
                            { name: station.name },
                          ),
                        ))
                      ) {
                        return;
                      }
                      await removeWorkStation(station.id);
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                  <Checkbox
                    variant="box"
                    checked={selectedWorkStationIds.includes(station.id)}
                    onChange={(event) => {
                      setSelectedWorkStationIds((prev) => {
                        if (event.target.checked) {
                          return [...prev, station.id];
                        }
                        return prev.filter((id) => id !== station.id);
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
