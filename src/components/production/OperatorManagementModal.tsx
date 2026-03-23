"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  KeyRoundIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";

import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import { cn } from "@/components/ui/utils";
import { supabase } from "@/lib/supabaseClient";
import type {
  OperatorAssignmentRow,
  OperatorConfigRow,
  OperatorProfileRow,
  OperatorStationRow,
} from "@/lib/domain/productionOperators";

type OperatorManagementModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  profiles: OperatorProfileRow[];
  operatorConfigs: OperatorConfigRow[];
  assignments: OperatorAssignmentRow[];
  stations: OperatorStationRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

type ManagedOperatorRow = {
  userId: string;
  fullName: string;
  loginCode: string;
  isActive: boolean;
  hourlyRate: number | null;
  overtimeRate: number | null;
  stationIds: string[];
};

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function OperatorManagementModal({
  open,
  onClose,
  onSaved,
  profiles,
  operatorConfigs,
  assignments,
  stations,
  t,
}: OperatorManagementModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [pin, setPin] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isResetPinMode, setIsResetPinMode] = useState(false);
  const [mobileMode, setMobileMode] = useState<"list" | "editor">("list");
  const [search, setSearch] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  const managedRows = useMemo<ManagedOperatorRow[]>(() => {
    const configByUserId = new Map(
      operatorConfigs
        .filter(
          (config) => typeof config.user_id === "string" && config.user_id,
        )
        .map((config) => [config.user_id as string, config]),
    );
    const stationIdsByUserId = new Map<string, string[]>();
    assignments.forEach((assignment) => {
      if (!assignment.is_active) {
        return;
      }
      const list = stationIdsByUserId.get(assignment.user_id) ?? [];
      list.push(assignment.station_id);
      stationIdsByUserId.set(assignment.user_id, list);
    });

    return profiles
      .filter(
        (profile) => profile.role === "Operator" || profile.auth_mode === "pin",
      )
      .map((profile) => {
        const config = configByUserId.get(profile.id);
        return {
          userId: profile.id,
          fullName: profile.full_name?.trim() || "",
          loginCode: profile.login_code?.trim() || "",
          isActive: profile.is_active ?? true,
          hourlyRate: config?.hourly_rate ?? null,
          overtimeRate: config?.overtime_rate ?? null,
          stationIds: Array.from(
            new Set(stationIdsByUserId.get(profile.id) ?? []),
          ),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [assignments, operatorConfigs, profiles]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return managedRows;
    }

    return managedRows.filter((row) => {
      return (
        row.fullName.toLowerCase().includes(query) ||
        row.loginCode.toLowerCase().includes(query)
      );
    });
  }, [managedRows, search]);

  const selectedRow = useMemo(
    () => managedRows.find((row) => row.userId === selectedUserId) ?? null,
    [managedRows, selectedUserId],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const initialRow = managedRows[0] ?? null;
    setSelectedUserId(initialRow?.userId ?? "");
    setFullName(initialRow?.fullName ?? "");
    setLoginCode(initialRow?.loginCode ?? "");
    setPin("");
    setHourlyRate(
      initialRow?.hourlyRate != null ? String(initialRow.hourlyRate) : "",
    );
    setOvertimeRate(
      initialRow?.overtimeRate != null ? String(initialRow.overtimeRate) : "",
    );
    setSelectedStationIds(initialRow?.stationIds ?? []);
    setIsResetPinMode(false);
    setMobileMode("list");
    setSearch("");
    setSuccessMessage("");
    setError("");
  }, [open, managedRows]);

  useEffect(() => {
    if (!selectedRow) {
      return;
    }
    setFullName(selectedRow.fullName);
    setLoginCode(selectedRow.loginCode);
    setPin("");
    setHourlyRate(
      selectedRow.hourlyRate != null ? String(selectedRow.hourlyRate) : "",
    );
    setOvertimeRate(
      selectedRow.overtimeRate != null ? String(selectedRow.overtimeRate) : "",
    );
    setSelectedStationIds(selectedRow.stationIds);
    setIsResetPinMode(false);
    setSuccessMessage("");
    setError("");
  }, [selectedRow]);

  const isCreating = !selectedUserId;

  const resetForCreate = () => {
    setSelectedUserId("");
    setFullName("");
    setLoginCode("");
    setPin("");
    setHourlyRate("");
    setOvertimeRate("");
    setSelectedStationIds([]);
    setIsResetPinMode(false);
    setSuccessMessage("");
    setError("");
    setMobileMode("editor");
  };

  const selectExistingOperator = (userId: string) => {
    setSelectedUserId(userId);
    setMobileMode("editor");
  };

  const toggleStation = (stationId: string) => {
    setSelectedStationIds((prev) =>
      prev.includes(stationId)
        ? prev.filter((value) => value !== stationId)
        : [...prev, stationId],
    );
  };

  const getAccessToken = async () => {
    const sessionResult = await supabase?.auth.getSession();
    const token = sessionResult?.data.session?.access_token ?? "";
    if (!token) {
      throw new Error(t("production.main.operators.manageSessionExpired"));
    }
    return token;
  };

  const handleSave = async () => {
    if (!supabase) {
      setError(t("production.main.errors.supabaseNotConfigured"));
      return;
    }
    if (!fullName.trim()) {
      setError(t("production.main.operators.manageNameRequired"));
      return;
    }
    if (!loginCode.trim()) {
      setError(t("production.main.operators.manageCodeRequired"));
      return;
    }
    if ((isCreating || isResetPinMode) && !pin.trim()) {
      setError(t("production.main.operators.managePinRequired"));
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage("");
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/production/operators/upsert", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUserId || undefined,
          fullName,
          loginCode,
          pin: (isCreating || isResetPinMode ? pin.trim() : "") || undefined,
          hourlyRate: parseOptionalNumber(hourlyRate),
          overtimeRate: parseOptionalNumber(overtimeRate),
          stationIds: selectedStationIds,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        userId?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || t("production.main.operators.manageSaveFailed"),
        );
      }

      const savedUserId = isCreating ? (result.userId ?? "") : selectedUserId;

      await onSaved();
      setSuccessMessage(
        isCreating
          ? t("production.main.operators.manageCreateSuccess")
          : t("production.main.operators.manageSaveSuccess"),
      );
      if (savedUserId) {
        setSelectedUserId(savedUserId);
      }
      setPin("");
      setIsResetPinMode(false);
      setMobileMode("editor");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("production.main.operators.manageSaveFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!supabase || !selectedUserId) {
      return;
    }
    setIsDeactivating(true);
    setSuccessMessage("");
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/production/operators/deactivate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || t("production.main.operators.manageDeactivateFailed"),
        );
      }
      await onSaved();
      resetForCreate();
      setMobileMode("list");
    } catch (deactivateError) {
      setError(
        deactivateError instanceof Error
          ? deactivateError.message
          : t("production.main.operators.manageDeactivateFailed"),
      );
    } finally {
      setIsDeactivating(false);
    }
  };

  const renderListPane = () => (
    <div className="flex h-full min-h-0 flex-col border-b border-border p-4 md:border-b-0 md:border-r md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            {t("production.main.operators.manageList")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("production.main.operators.manageListHint")}
          </div>
        </div>
        <Button type="button" size="sm" onClick={resetForCreate}>
          <PlusIcon className="h-4 w-4" />
          {t("production.main.operators.manageNew")}
        </Button>
      </div>

      <div className="mb-4">
        <InputField
          label={t("header.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("production.main.operators.manageSearchPlaceholder")}
          wrapperClassName="h-11"
          startIcon={<SearchIcon className="h-4 w-4" />}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filteredRows.map((row) => (
          <button
            key={row.userId}
            type="button"
            onClick={() => selectExistingOperator(row.userId)}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
              selectedUserId === row.userId
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-medium">
                  {row.fullName}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("production.main.operators.manageCodeLabel")}:{" "}
                  {row.loginCode || "—"}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                  row.isActive
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-border text-muted-foreground",
                )}
              >
                {row.isActive
                  ? t("production.main.operators.manageActive")
                  : t("production.main.operators.manageInactive")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-1">
                {t("production.main.operators.manageStationsCount", {
                  count: row.stationIds.length,
                })}
              </span>
              {row.hourlyRate != null ? (
                <span className="rounded-full bg-muted px-2 py-1">
                  {t("production.main.operators.manageHourlyRate")}:{" "}
                  {row.hourlyRate}
                </span>
              ) : null}
            </div>
          </button>
        ))}

        {filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            {t("production.main.operators.manageEmpty")}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderEditorPane = () => (
    <div className="flex h-full min-h-0 flex-1 flex-col p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3 md:hidden">
        <div>
          <div className="text-sm font-semibold">
            {isCreating
              ? t("production.main.operators.manageNew")
              : fullName || t("production.main.operators.manageTitle")}
          </div>
          <div className="text-xs text-muted-foreground">
            {isCreating
              ? t("production.main.operators.manageNewProfile")
              : loginCode || t("production.main.operators.managePinAccess")}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMobileMode("list")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {t("production.main.operators.manageBack")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <section className="rounded-2xl border border-border p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold">
              {t("production.main.operators.manageBasicInfo")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("production.main.operators.manageBasicInfoHint")}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <InputField
              label={t("production.main.operators.manageName")}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <InputField
              label={t("production.main.operators.manageCode")}
              value={loginCode}
              onChange={(event) =>
                setLoginCode(event.target.value.toUpperCase())
              }
              placeholder={t("production.main.operators.manageCodePlaceholder")}
              description={t("production.main.operators.manageCodeHint")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {t("production.main.operators.manageAccess")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("production.main.operators.manageAccessHint")}
              </div>
            </div>
            {selectedUserId ? (
              !isResetPinMode ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPin("");
                    setIsResetPinMode(true);
                    setSuccessMessage("");
                    setError("");
                  }}
                >
                  <KeyRoundIcon className="h-4 w-4" />
                  {t("production.main.operators.manageResetPin")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPin("");
                    setIsResetPinMode(false);
                    setSuccessMessage("");
                    setError("");
                  }}
                >
                  <XIcon className="h-4 w-4" />
                  {t("production.main.operators.manageResetPinCancel")}
                </Button>
              )
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px_160px]">
            <InputField
              label={t("production.main.operators.managePin")}
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="0000"
              description={
                isCreating || isResetPinMode
                  ? t("production.main.operators.managePinHint")
                  : t("production.main.operators.managePinUnchanged")
              }
              disabled={!isCreating && !isResetPinMode}
            />
            <InputField
              label={t("production.main.operators.manageHourlyRate")}
              inputMode="decimal"
              value={hourlyRate}
              onChange={(event) => setHourlyRate(event.target.value)}
              placeholder="0.00"
            />
            <InputField
              label={t("production.main.operators.manageOvertimeRate")}
              inputMode="decimal"
              value={overtimeRate}
              onChange={(event) => setOvertimeRate(event.target.value)}
              placeholder="0.00"
            />
          </div>

          {selectedUserId && isResetPinMode ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("production.main.operators.manageResetPinHint")}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold">
              {t("production.main.operators.manageStations")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("production.main.operators.manageStationsHint")}
            </div>
          </div>

          {stations.length > 0 ? (
            <>
              <div className="mb-3 text-xs text-muted-foreground">
                {t("production.main.operators.manageStationsSelected", {
                  count: selectedStationIds.length,
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {stations.map((station) => {
                  const selected = selectedStationIds.includes(station.id);
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => toggleStation(station.id)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted/30",
                      )}
                    >
                      {station.name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              {t("production.main.operators.manageStationsEmpty")}
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border bg-background pt-4">
        {selectedUserId ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleDeactivate}
            disabled={isSubmitting || isDeactivating}
          >
            <Trash2Icon className="h-4 w-4" />
            {isDeactivating
              ? t("production.main.operators.manageDeactivating")
              : t("production.main.operators.manageDeactivate")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={
            mobileMode === "editor" ? () => setMobileMode("list") : onClose
          }
        >
          {t("production.main.common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting || isDeactivating}
        >
          {isCreating ? (
            <UserRoundIcon className="h-4 w-4" />
          ) : (
            <SaveIcon className="h-4 w-4" />
          )}
          {isSubmitting
            ? t("production.main.common.saving")
            : isResetPinMode
              ? t("production.main.operators.manageSaveNewPin")
              : selectedUserId
                ? t("production.main.common.save")
                : t("production.main.operators.manageCreate")}
        </Button>
      </div>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      ariaLabel={t("production.main.operators.manageTitle")}
      title={t("production.main.operators.manageTitle")}
      closeButtonLabel={t("production.main.common.close")}
      desktopPanelClassName="w-[min(96vw,1280px)]"
      desktopBodyClassName="flex min-h-0 flex-1 flex-col md:flex-row"
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className={cn(
            "md:flex md:min-w-[380px] md:max-w-[440px] md:flex-col",
            mobileMode === "editor" ? "hidden md:flex" : "flex",
          )}
        >
          {renderListPane()}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            mobileMode === "list" ? "hidden md:block" : "block",
          )}
        >
          {renderEditorPane()}
        </div>
      </div>
    </ResponsiveModal>
  );
}

