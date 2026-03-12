"use client";

import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { InputField } from "@/components/ui/InputField";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type StopReasonLike = {
  id: string;
  label: string;
  isActive: boolean;
};

type OperationsStopReasonsCardProps = {
  t: TranslationFn;
  stopReasonLabel: string;
  setStopReasonLabel: (value: string) => void;
  handleSaveStopReason: () => Promise<void> | void;
  editingStopReasonId: string | null;
  resetStopReasonForm: () => void;
  selectedStopReasonIds: string[];
  setSelectedStopReasonIds: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  stopReasons: StopReasonLike[];
  handleDeleteSelectedStopReasons: () => Promise<void> | void;
  updateStopReason: (
    reasonId: string,
    patch: Partial<StopReasonLike>,
  ) => Promise<void> | void;
  handleEditStopReason: (reasonId: string) => void;
  handleCopyStopReason: (reasonId: string) => Promise<void> | void;
  confirmRemove: (message: string) => Promise<boolean>;
  removeStopReason: (reasonId: string) => Promise<void> | void;
};

export function OperationsStopReasonsCard(
  props: OperationsStopReasonsCardProps,
) {
  const {
    t,
    stopReasonLabel,
    setStopReasonLabel,
    handleSaveStopReason,
    editingStopReasonId,
    resetStopReasonForm,
    selectedStopReasonIds,
    setSelectedStopReasonIds,
    stopReasons,
    handleDeleteSelectedStopReasons,
    updateStopReason,
    handleEditStopReason,
    handleCopyStopReason,
    confirmRemove,
    removeStopReason,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.operations.stopReasonsTitle")}</CardTitle>
        <CardDescription>
          {t("settings.operations.stopReasonsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
          <InputField
            label={t("settings.operations.reason")}
            value={stopReasonLabel}
            onChange={(event) => setStopReasonLabel(event.target.value)}
            placeholder={t("settings.operations.reasonPlaceholder")}
            className="h-10 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={() => void handleSaveStopReason()}>
              {editingStopReasonId
                ? t("settings.operations.saveReason")
                : t("settings.operations.addReason")}
            </Button>
            {editingStopReasonId ? (
              <Button variant="outline" onClick={resetStopReasonForm}>
                {t("settings.common.cancel")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-sm text-muted-foreground">
              {selectedStopReasonIds.length > 0
                ? t("settings.common.selectedCount", {
                    count: selectedStopReasonIds.length,
                  })
                : " "}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  variant="box"
                  checked={
                    stopReasons.length > 0 &&
                    selectedStopReasonIds.length === stopReasons.length
                  }
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedStopReasonIds(
                        stopReasons.map((reason) => reason.id),
                      );
                    } else {
                      setSelectedStopReasonIds([]);
                    }
                  }}
                  disabled={stopReasons.length === 0}
                />
                {t("settings.operations.selectAll")}
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleDeleteSelectedStopReasons()}
                disabled={selectedStopReasonIds.length === 0}
              >
                {t("settings.common.removeSelected")}
              </Button>
            </div>
          </div>
          {stopReasons.map((reason) => (
            <div
              key={reason.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="font-medium">{reason.label}</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={reason.isActive}
                    onChange={(event) =>
                      updateStopReason(reason.id, {
                        isActive: event.target.checked,
                      })
                    }
                  />
                  {t("settings.common.active")}
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditStopReason(reason.id)}
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyStopReason(reason.id)}
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (
                      !(await confirmRemove(
                        t("settings.operations.removeReasonConfirm", {
                          label: reason.label,
                        }),
                      ))
                    ) {
                      return;
                    }
                    await removeStopReason(reason.id);
                  }}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
                <Checkbox
                  variant="box"
                  checked={selectedStopReasonIds.includes(reason.id)}
                  onChange={(event) => {
                    setSelectedStopReasonIds((prev) => {
                      if (event.target.checked) {
                        return [...prev, reason.id];
                      }
                      return prev.filter((id) => id !== reason.id);
                    });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
