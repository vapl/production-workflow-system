"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import type { WorkShift } from "@/lib/domain/workingCalendar";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type WeekdayOption = {
  value: number;
  label: string;
};

type OperationsWorkingHoursCardProps = {
  t: TranslationFn;
  optionLabel: (group: string, value: string, fallback: string) => string;
  weekdayOptions: WeekdayOption[];
  workdays: number[];
  toggleWorkday: (day: number) => void;
  workShifts: WorkShift[];
  handleAddShift: () => void;
  handleWorkShiftChange: (
    index: number,
    field: "start" | "end",
    value: string,
  ) => void;
  handleRemoveShift: (index: number) => void;
  isValidWorkTime: (value: string) => boolean;
  workdayError: string | null;
  handleSaveWorkHours: () => Promise<void> | void;
  isWorkdaySaving: boolean;
};

export function OperationsWorkingHoursCard(
  props: OperationsWorkingHoursCardProps,
) {
  const {
    t,
    optionLabel,
    weekdayOptions,
    workdays,
    toggleWorkday,
    workShifts,
    handleAddShift,
    handleWorkShiftChange,
    handleRemoveShift,
    isValidWorkTime,
    workdayError,
    handleSaveWorkHours,
    isWorkdaySaving,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.operations.workingHoursTitle")}</CardTitle>
        <CardDescription>
          {t("settings.operations.workingHoursDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">
            {t("settings.operations.workdays")}
          </label>
          <div className="flex flex-wrap gap-2">
            {weekdayOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => toggleWorkday(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  workdays.includes(option.value)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {optionLabel("weekday", String(option.value), option.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t("settings.operations.shifts")}
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAddShift}
            >
              {t("settings.operations.addShift")}
            </Button>
          </div>
          {workShifts.map((shift, index) => (
            <div
              key={`${index}-${shift.start}-${shift.end}`}
              className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
            >
              <InputField
                label={`Shift ${index + 1} start`}
                type="text"
                inputMode="numeric"
                pattern="^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$"
                value={shift.start}
                onChange={(event) =>
                  handleWorkShiftChange(index, "start", event.target.value)
                }
                placeholder="08:00"
                className={`h-10 w-full text-sm ${
                  isValidWorkTime(shift.start) ? "" : "border-destructive"
                }`}
                labelClassName="text-xs font-medium text-muted-foreground"
              />
              <InputField
                label={`Shift ${index + 1} end`}
                type="text"
                inputMode="numeric"
                pattern="^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$"
                value={shift.end}
                onChange={(event) =>
                  handleWorkShiftChange(index, "end", event.target.value)
                }
                placeholder="17:00"
                className={`h-10 w-full text-sm ${
                  isValidWorkTime(shift.end) ? "" : "border-destructive"
                }`}
                labelClassName="text-xs font-medium text-muted-foreground"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveShift(index)}
                disabled={workShifts.length <= 1}
                className="justify-self-start md:justify-self-auto"
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
            {t("settings.operations.overnightShiftHint")}
          </div>
        </div>
        {workdayError ? (
          <div className="text-xs text-destructive">{workdayError}</div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void handleSaveWorkHours()}
            disabled={isWorkdaySaving}
          >
            {isWorkdaySaving
              ? t("settings.users.saving")
              : t("settings.operations.saveHours")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
