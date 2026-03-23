"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useI18n } from "@/lib/i18n/useI18n";
import type { StationTrackingMode } from "@/types/production";

type StationRow = {
  id: string;
  tenantId?: string | null;
  name: string;
  description?: string | null;
  trackingMode?: StationTrackingMode;
  sortOrder?: number | null;
};

type StationDraft = {
  id: string;
  name: string;
  description: string;
  trackingMode: StationTrackingMode;
  sortOrder: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  stations: StationRow[];
  onSave: (payload: {
    updates: Array<{
      id: string;
      name: string;
      description: string;
      trackingMode: StationTrackingMode;
      sortOrder: number;
    }>;
    deleteIds?: string[];
    create?: {
      name: string;
      description: string;
      trackingMode: StationTrackingMode;
      sortOrder: number;
      tenantId?: string | null;
    } | null;
  }) => Promise<void> | void;
  isSaving?: boolean;
};

const TRACKING_MODE_OPTIONS: StationTrackingMode[] = [
  "construction_level",
  "order_level",
  "receipt_only",
];

function reorderStationsByInsertIndex(
  items: StationDraft[],
  draggedId: string,
  insertIndex: number,
) {
  const sourceIndex = items.findIndex((item) => item.id === draggedId);
  if (sourceIndex === -1) return items;

  const next = [...items];
  const [dragged] = next.splice(sourceIndex, 1);
  const boundedIndex = Math.max(0, Math.min(insertIndex, next.length));
  next.splice(boundedIndex, 0, dragged);

  return next.map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

export function ProductionStationCatalogModal(props: Props) {
  const { t } = useI18n();
  const { open, onClose, stations, onSave, isSaving } = props;

  const [drafts, setDrafts] = useState<StationDraft[]>([]);
  const [newStationName, setNewStationName] = useState("");
  const [newStationDescription, setNewStationDescription] = useState("");
  const [newTrackingMode, setNewTrackingMode] =
    useState<StationTrackingMode>("construction_level");
  const [draggedStationId, setDraggedStationId] = useState<string | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    // This modal intentionally rehydrates editable drafts from the latest station snapshot on open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(
      stations.map((station, index) => ({
        id: station.id,
        name: station.name,
        description: station.description ?? "",
        trackingMode: station.trackingMode ?? "construction_level",
        sortOrder: station.sortOrder ?? index,
      })),
    );
    setNewStationName("");
    setNewStationDescription("");
    setNewTrackingMode("construction_level");
    setDraggedStationId(null);
    setDragInsertIndex(null);
  }, [open, stations]);

  const defaultTenantId = useMemo(
    () => stations.find((station) => station.tenantId)?.tenantId ?? null,
    [stations],
  );
  const deleteIds = useMemo(
    () =>
      stations
        .filter((existing) => !drafts.some((draft) => draft.id === existing.id))
        .map((station) => station.id),
    [drafts, stations],
  );

  const handleRemoveStation = (stationId: string) => {
    setDrafts((prev) =>
      prev
        .filter((station) => station.id !== stationId)
        .map((station, index) => ({
          ...station,
          sortOrder: index,
        })),
    );
  };

  const handleStationDrop = (insertIndex: number) => {
    if (!draggedStationId) return;
    setDrafts((prev) =>
      reorderStationsByInsertIndex(prev, draggedStationId, insertIndex),
    );
    setDraggedStationId(null);
    setDragInsertIndex(null);
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      ariaLabel={t("production.main.jobs.stationCatalog")}
      title={t("production.main.jobs.stationCatalog")}
      closeButtonLabel={t("production.main.common.close")}
      desktopPanelClassName="w-[min(96vw,860px)]"
      desktopBodyClassName="min-h-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col p-5 md:p-6">
        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="space-y-4">
            {drafts.map((station, index) => (
              <div key={station.id}>
                <div
                  className={
                    dragInsertIndex === index
                      ? "mb-3 h-2 rounded-full bg-primary/15"
                      : "mb-3 h-2"
                  }
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedStationId) {
                      setDragInsertIndex(index);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleStationDrop(index);
                  }}
                />
                <div
                  className="rounded-2xl border border-border bg-background p-5"
                  draggable
                  onDragStart={() => {
                    setDraggedStationId(station.id);
                    setDragInsertIndex(index);
                  }}
                  onDragEnd={() => {
                    setDraggedStationId(null);
                    setDragInsertIndex(null);
                  }}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground">
                        <GripVerticalIcon className="h-4 w-4" />
                      </span>
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-border bg-muted/30 px-2 text-xs font-semibold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div className="text-sm font-semibold">
                        {station.name || "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">
                        {t(
                          `production.main.jobs.trackingModeValues.${station.trackingMode}`,
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveStation(station.id)}
                        aria-label={t("production.main.common.remove")}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_1.3fr_240px]">
                    <Input
                      value={station.name}
                      onChange={(event) =>
                        setDrafts((prev) =>
                          prev.map((entry) =>
                            entry.id === station.id
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={t("production.main.jobs.stationName")}
                    />
                    <Input
                      value={station.description}
                      onChange={(event) =>
                        setDrafts((prev) =>
                          prev.map((entry) =>
                            entry.id === station.id
                              ? { ...entry, description: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={t("production.main.jobs.stationDescription")}
                    />
                    <Select
                      value={station.trackingMode}
                      onValueChange={(value) =>
                        setDrafts((prev) =>
                          prev.map((entry) =>
                            entry.id === station.id
                              ? {
                                  ...entry,
                                  trackingMode: value as StationTrackingMode,
                                }
                              : entry,
                          ),
                        )
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
                </div>
              </div>
            ))}

            <div
              className={
                dragInsertIndex === drafts.length
                  ? "h-2 rounded-full bg-primary/15"
                  : "h-2"
              }
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedStationId) {
                  setDragInsertIndex(drafts.length);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleStationDrop(drafts.length);
              }}
            />

            <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-5">
              <div className="mb-3 text-sm font-semibold">
                {t("production.main.jobs.addStation")}
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_220px_auto]">
                <Input
                  value={newStationName}
                  onChange={(event) => setNewStationName(event.target.value)}
                  placeholder={t("production.main.jobs.stationName")}
                />
                <Input
                  value={newStationDescription}
                  onChange={(event) =>
                    setNewStationDescription(event.target.value)
                  }
                  placeholder={t("production.main.jobs.stationDescription")}
                />
                <Select
                  value={newTrackingMode}
                  onValueChange={(value) =>
                    setNewTrackingMode(value as StationTrackingMode)
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRACKING_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`production.main.jobs.trackingModeValues.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!newStationName.trim()}
                  onClick={() =>
                    void onSave({
                      updates: drafts,
                      deleteIds,
                      create: {
                        name: newStationName.trim(),
                        description: newStationDescription.trim(),
                        trackingMode: newTrackingMode,
                        sortOrder: drafts.length,
                        tenantId: defaultTenantId,
                      },
                    })
                  }
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  {t("production.main.jobs.addStation")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-5">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("production.main.common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() =>
              void onSave({
                updates: drafts,
                deleteIds,
                create: null,
              })
            }
            disabled={isSaving}
          >
            {t("production.main.common.save")}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
