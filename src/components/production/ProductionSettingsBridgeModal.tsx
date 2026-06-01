"use client";

import { useEffect, useMemo, useState } from "react";
import { FactoryIcon, WorkflowIcon, XIcon } from "lucide-react";

import { DetailTabsBar } from "@/components/layout/DetailTabsBar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatUserRoleLabel,
  type UserRole,
} from "@/contexts/UserContext";
import {
  useWorkflowRules,
  type WorkflowStatusColor,
  type WorkflowTargetStatus,
} from "@/contexts/WorkflowContext";
import { useWorkingCalendar } from "@/contexts/WorkingCalendarContext";
import { useCurrentUser } from "@/contexts/UserContext";
import {
  DEFAULT_WORKDAYS,
  DEFAULT_WORK_SHIFTS,
  isValidWorkTime,
  normalizeWorkTime,
  parseWorkingCalendar,
  validateWorkingCalendar,
  type WorkShift,
} from "@/lib/domain/workingCalendar";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";
import { useSettingsData } from "@/hooks/useSettingsData";
import { ProductionStationCatalogModal } from "@/components/production/ProductionStationCatalogModal";
import { WorkflowSettingsCard } from "@/app/(app)/settings/components/WorkflowSettingsCard";
import { OperationsNotificationsCard } from "@/app/(app)/settings/components/OperationsNotificationsCard";
import { OperationsQrSettingsCard } from "@/app/(app)/settings/components/OperationsQrSettingsCard";
import { OperationsStopReasonsCard } from "@/app/(app)/settings/components/OperationsStopReasonsCard";
import { OperationsWorkingHoursCard } from "@/app/(app)/settings/components/OperationsWorkingHoursCard";
import type { ExternalJobStatus, OrderStatus } from "@/types/orders";

type ProductionSettingsBridgeModalProps = {
  open: boolean;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const weekdayOptions: Array<{ value: number; label: string }> = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const workflowStatusOptions: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ready_for_engineering", label: "Ready for engineering" },
  { value: "in_engineering", label: "In engineering" },
  { value: "engineering_blocked", label: "Engineering blocked" },
  { value: "ready_for_production", label: "Ready for production" },
  { value: "in_production", label: "In production" },
  { value: "done", label: "Done" },
];

const externalJobStatusOptions: {
  value: ExternalJobStatus;
  label: string;
}[] = [
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "in_progress", label: "In progress" },
  { value: "delivered", label: "In Stock" },
  { value: "approved", label: "Approved" },
  { value: "cancelled", label: "Cancelled" },
];

const statusColorOptions: {
  value: WorkflowStatusColor;
  label: string;
  swatchClass: string;
}[] = [
  { value: "slate", label: "Gray", swatchClass: "bg-slate-500" },
  { value: "blue", label: "Blue", swatchClass: "bg-blue-500" },
  { value: "amber", label: "Amber", swatchClass: "bg-amber-500" },
  { value: "emerald", label: "Green", swatchClass: "bg-emerald-500" },
  { value: "rose", label: "Red", swatchClass: "bg-rose-500" },
];

const qrLabelSizeOptions = [
  { value: "A4", label: "A4 (210 x 297 mm)" },
  { value: "A5", label: "A5 (148 x 210 mm)" },
  { value: "A6", label: "A6 (105 x 148 mm)" },
  { value: "LABEL_70x35", label: "Label 70 x 35 mm" },
  { value: "LABEL_105x148", label: "Label 105 x 148 mm" },
];

const qrContentFieldOptions = [
  { value: "order_number", label: "Order number" },
  { value: "customer_name", label: "Customer name" },
  { value: "batch_code", label: "Batch code" },
  { value: "item_name", label: "Construction" },
  { value: "qty", label: "Quantity" },
  { value: "material", label: "Material" },
  { value: "field_label", label: "Field label" },
  { value: "due_date", label: "Due date" },
];

const defaultQrEnabledSizes = [
  "A4",
  "A5",
  "A6",
  "LABEL_70x35",
  "LABEL_105x148",
];

const defaultQrContentFields = [
  "order_number",
  "customer_name",
  "batch_code",
  "item_name",
  "qty",
  "material",
];

const requiredActiveOrderStatuses: OrderStatus[] = [
  "draft",
  "ready_for_engineering",
  "in_engineering",
  "engineering_blocked",
  "ready_for_production",
  "in_production",
];

const requiredActiveExternalStatuses: ExternalJobStatus[] = [
  "requested",
  "ordered",
  "in_progress",
  "delivered",
  "approved",
  "cancelled",
];

const attachmentRoles: UserRole[] = [
  "Admin",
  "Sales",
  "Engineering",
  "Production planner",
  "Operator",
  "Dealer",
  "Warehouse",
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function ProductionSettingsBridgeModal({
  open,
  onClose,
}: ProductionSettingsBridgeModalProps) {
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const { refresh: refreshWorkingCalendar } = useWorkingCalendar();
  const { confirm, dialog } = useConfirmDialog();
  const {
    workStations,
    stopReasons,
    isLoading: isSettingsDataLoading,
    addWorkStation,
    updateWorkStation,
    removeWorkStation,
    addStopReason,
    updateStopReason,
    removeStopReason,
  } = useSettingsData();
  const {
    rules,
    setRules,
    addChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    addReturnReason,
    removeReturnReason,
    saveError,
    isLoadedFromDb,
  } = useWorkflowRules();

  const [activeTab, setActiveTab] = useState("operations");
  const [isStationCatalogOpen, setIsStationCatalogOpen] = useState(false);
  const [isStationCatalogSaving, setIsStationCatalogSaving] = useState(false);
  const [workdays, setWorkdays] = useState<number[]>([...DEFAULT_WORKDAYS]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([
    ...DEFAULT_WORK_SHIFTS,
  ]);
  const [overtimeEnabled, setOvertimeEnabled] = useState(false);
  const [workdayError, setWorkdayError] = useState<string | null>(null);
  const [isWorkdaySaving, setIsWorkdaySaving] = useState(false);
  const [isTenantSettingsLoading, setIsTenantSettingsLoading] = useState(false);
  const [stopReasonLabel, setStopReasonLabel] = useState("");
  const [editingStopReasonId, setEditingStopReasonId] = useState<string | null>(
    null,
  );
  const [selectedStopReasonIds, setSelectedStopReasonIds] = useState<string[]>(
    [],
  );
  const [notificationRoles, setNotificationRoles] = useState<string[]>([
    "Production planner",
    "Admin",
    "Owner",
  ]);
  const [notificationState, setNotificationState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [qrEnabledSizes, setQrEnabledSizes] = useState<string[]>(
    defaultQrEnabledSizes,
  );
  const [qrDefaultSize, setQrDefaultSize] = useState<string>("A4");
  const [qrContentFields, setQrContentFields] = useState<string[]>(
    defaultQrContentFields,
  );
  const [qrSettingsState, setQrSettingsState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [qrSettingsMessage, setQrSettingsMessage] = useState("");
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistRequired, setNewChecklistRequired] = useState<
    WorkflowTargetStatus[]
  >(["ready_for_engineering"]);
  const [newReturnReason, setNewReturnReason] = useState("");
  const [orderStatusConfigDrafts, setOrderStatusConfigDrafts] = useState(
    rules.orderStatusConfig,
  );
  const [externalJobStatusConfigDrafts, setExternalJobStatusConfigDrafts] =
    useState(rules.externalJobStatusConfig);
  const [statusLabelState, setStatusLabelState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [statusLabelMessage, setStatusLabelMessage] = useState("");
  const [externalJobStatusLabelState, setExternalJobStatusLabelState] =
    useState<"idle" | "saving" | "saved" | "error">("idle");
  const [externalJobStatusLabelMessage, setExternalJobStatusLabelMessage] =
    useState("");
  const [assignmentLabelDrafts, setAssignmentLabelDrafts] = useState({
    engineer: rules.assignmentLabels?.engineer ?? "Engineer",
    manager: rules.assignmentLabels?.manager ?? "Manager",
  });
  const [assignmentLabelState, setAssignmentLabelState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [assignmentLabelMessage, setAssignmentLabelMessage] = useState("");
  const [attachmentCategoryDrafts, setAttachmentCategoryDrafts] = useState(
    rules.attachmentCategories,
  );
  const [attachmentDefaultDrafts, setAttachmentDefaultDrafts] = useState(
    rules.attachmentCategoryDefaults,
  );
  const [attachmentCategoryState, setAttachmentCategoryState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [attachmentCategoryMessage, setAttachmentCategoryMessage] =
    useState("");
  const [newAttachmentCategoryLabel, setNewAttachmentCategoryLabel] =
    useState("");

  const optionLabel = (group: string, value: string, fallback: string) =>
    t(`settings.options.${group}.${value}`, { fallback }) ===
    `settings.options.${group}.${value}`
      ? fallback
      : t(`settings.options.${group}.${value}`);

  const sortedStations = useMemo(
    () =>
      [...workStations].sort((a, b) => {
        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return a.name.localeCompare(b.name);
      }),
    [workStations],
  );

  const displayStations = sortedStations;

  const hasStatusLabelChanges = useMemo(
    () =>
      JSON.stringify(orderStatusConfigDrafts) !==
      JSON.stringify(rules.orderStatusConfig),
    [orderStatusConfigDrafts, rules.orderStatusConfig],
  );

  const hasExternalJobStatusLabelChanges = useMemo(
    () =>
      JSON.stringify(externalJobStatusConfigDrafts) !==
      JSON.stringify(rules.externalJobStatusConfig),
    [externalJobStatusConfigDrafts, rules.externalJobStatusConfig],
  );

  const hasAssignmentLabelChanges =
    assignmentLabelDrafts.engineer.trim() !==
      (rules.assignmentLabels?.engineer ?? "Engineer") ||
    assignmentLabelDrafts.manager.trim() !==
      (rules.assignmentLabels?.manager ?? "Manager");

  const hasAttachmentCategoryChanges = useMemo(() => {
    const normalize = (
      items: { id: string; label: string; aiParseEnabled?: boolean }[],
    ) =>
      items
        .map(
          (item) => `${item.id}:${item.label}:${item.aiParseEnabled ? 1 : 0}`,
        )
        .sort()
        .join("|");
    return (
      normalize(attachmentCategoryDrafts) !==
        normalize(rules.attachmentCategories) ||
      JSON.stringify(attachmentDefaultDrafts) !==
        JSON.stringify(rules.attachmentCategoryDefaults)
    );
  }, [
    attachmentCategoryDrafts,
    attachmentDefaultDrafts,
    rules.attachmentCategories,
    rules.attachmentCategoryDefaults,
  ]);

  const activeTabSubtitle =
    activeTab === "operations"
      ? t("settings.sectionSubtitle.operations")
      : t("settings.sectionSubtitle.workflow");

  useEffect(() => {
    if (!open) {
      setActiveTab("operations");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  useEffect(() => {
    setOrderStatusConfigDrafts(rules.orderStatusConfig);
  }, [rules.orderStatusConfig]);

  useEffect(() => {
    setExternalJobStatusConfigDrafts(rules.externalJobStatusConfig);
  }, [rules.externalJobStatusConfig]);

  useEffect(() => {
    setAssignmentLabelDrafts({
      engineer: rules.assignmentLabels?.engineer ?? "Engineer",
      manager: rules.assignmentLabels?.manager ?? "Manager",
    });
  }, [rules.assignmentLabels]);

  useEffect(() => {
    setAttachmentCategoryDrafts(rules.attachmentCategories);
    setAttachmentDefaultDrafts(rules.attachmentCategoryDefaults);
  }, [rules.attachmentCategories, rules.attachmentCategoryDefaults]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadTenantSettings = async () => {
      setIsTenantSettingsLoading(true);
      try {
        const { data, error } = await sb
          .from("tenant_settings")
          .select(
            "workday_start, workday_end, workdays, work_shifts, overtime_enabled, qr_enabled_sizes, qr_default_size, qr_content_fields, notification_roles",
          )
          .eq("tenant_id", currentUser.tenantId)
          .maybeSingle();
        if (!isMounted || error || !data) {
          return;
        }
        const calendar = parseWorkingCalendar(data);
        setWorkdays(calendar.workdays);
        setWorkShifts(calendar.shifts);
        setOvertimeEnabled(calendar.overtimeEnabled);
        if (Array.isArray(data.qr_enabled_sizes)) {
          setQrEnabledSizes(
            data.qr_enabled_sizes.filter(
              (value: unknown) => typeof value === "string",
            ),
          );
        }
        if (typeof data.qr_default_size === "string") {
          setQrDefaultSize(data.qr_default_size);
        }
        if (Array.isArray(data.qr_content_fields)) {
          setQrContentFields(
            data.qr_content_fields.filter(
              (value: unknown) => typeof value === "string",
            ),
          );
        }
        if (Array.isArray(data.notification_roles)) {
          setNotificationRoles(
            data.notification_roles.filter(
              (value: unknown) => typeof value === "string",
            ),
          );
        }
      } finally {
        if (isMounted) {
          setIsTenantSettingsLoading(false);
        }
      }
    };
    void loadTenantSettings();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  useEffect(() => {
    const valid = new Set(stopReasons.map((reason) => reason.id));
    const next = selectedStopReasonIds.filter((id) => valid.has(id));
    if (next.length !== selectedStopReasonIds.length) {
      setSelectedStopReasonIds(next);
    }
  }, [selectedStopReasonIds, stopReasons]);

  const sanitizeOrderStatusDrafts = () => {
    const next = { ...orderStatusConfigDrafts };
    workflowStatusOptions.forEach((option) => {
      const current = next[option.value];
      const fallback = rules.orderStatusConfig[option.value];
      next[option.value] = {
        label:
          (current?.label ?? "").trim() ||
          fallback.label ||
          optionLabel("workflowStatus", option.value, option.label),
        color: statusColorOptions.some((item) => item.value === current?.color)
          ? (current?.color ?? fallback.color)
          : fallback.color,
        isActive:
          requiredActiveOrderStatuses.includes(option.value) ||
          (current?.isActive ?? true),
      };
    });
    return next;
  };

  const sanitizeExternalStatusDrafts = () => {
    const next = { ...externalJobStatusConfigDrafts };
    externalJobStatusOptions.forEach((option) => {
      const current = next[option.value];
      const fallback = rules.externalJobStatusConfig[option.value];
      next[option.value] = {
        label:
          (current?.label ?? "").trim() ||
          fallback.label ||
          optionLabel("externalJobStatus", option.value, option.label),
        color: statusColorOptions.some((item) => item.value === current?.color)
          ? (current?.color ?? fallback.color)
          : fallback.color,
        isActive:
          requiredActiveExternalStatuses.includes(option.value) ||
          (current?.isActive ?? true),
      };
    });
    return next;
  };

  function resetStopReasonForm() {
    setStopReasonLabel("");
    setEditingStopReasonId(null);
  }

  async function handleSaveStopReason() {
    const trimmedLabel = stopReasonLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    if (editingStopReasonId) {
      await updateStopReason(editingStopReasonId, { label: trimmedLabel });
      resetStopReasonForm();
      return;
    }
    await addStopReason(trimmedLabel);
    resetStopReasonForm();
  }

  function handleEditStopReason(reasonId: string) {
    const reason = stopReasons.find((item) => item.id === reasonId);
    if (!reason) {
      return;
    }
    setEditingStopReasonId(reasonId);
    setStopReasonLabel(reason.label);
  }

  async function handleCopyStopReason(reasonId: string) {
    const reason = stopReasons.find((item) => item.id === reasonId);
    if (!reason) {
      return;
    }
    await addStopReason(`${reason.label} copy`);
  }

  async function handleDeleteSelectedStopReasons() {
    if (selectedStopReasonIds.length === 0) {
      return;
    }
    if (
      !(await confirm(
        t("settings.operations.removeSelectedReasonsConfirm", {
          count: selectedStopReasonIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedStopReasonIds];
    for (const id of ids) {
      await removeStopReason(id);
    }
    setSelectedStopReasonIds([]);
  }

  async function handleSaveWorkHours() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const normalizedShifts = workShifts.map((shift) => ({
      start: normalizeWorkTime(shift.start, ""),
      end: normalizeWorkTime(shift.end, ""),
      overtimeStart: normalizeWorkTime(
        overtimeEnabled ? shift.overtimeStart ?? shift.start : shift.start,
        normalizeWorkTime(shift.start, ""),
      ),
      overtimeEnd: normalizeWorkTime(
        overtimeEnabled ? shift.overtimeEnd ?? shift.end : shift.end,
        normalizeWorkTime(shift.end, ""),
      ),
    }));
    const validationError = validateWorkingCalendar(workdays, normalizedShifts);
    if (validationError) {
      setWorkdayError(validationError);
      return;
    }
    setWorkShifts(normalizedShifts);
    const primaryShift = normalizedShifts[0] ?? DEFAULT_WORK_SHIFTS[0];
    setWorkdayError(null);
    setIsWorkdaySaving(true);
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      workday_start: primaryShift.start,
      workday_end: primaryShift.end,
      workdays,
      overtime_enabled: overtimeEnabled,
      work_shifts: normalizedShifts,
    });
    if (error) {
      setWorkdayError(error.message);
    } else {
      await refreshWorkingCalendar();
    }
    setIsWorkdaySaving(false);
  }

  function toggleWorkday(day: number) {
    setWorkdays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((value) => value !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }

  function handleWorkShiftChange(
    index: number,
    field: keyof WorkShift,
    value: string,
  ) {
    setWorkShifts((prev) =>
      prev.map((shift, shiftIndex) =>
        shiftIndex === index ? { ...shift, [field]: value } : shift,
      ),
    );
  }

  function handleAddShift() {
    setWorkShifts((prev) => [
      ...prev,
      {
        start: "17:00",
        end: "21:00",
        overtimeStart: "17:00",
        overtimeEnd: "21:00",
      },
    ]);
  }

  function handleRemoveShift(index: number) {
    setWorkShifts((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((_, shiftIndex) => shiftIndex !== index);
    });
  }

  async function handleSaveQrSettings() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setQrSettingsState("saving");
    setQrSettingsMessage("");
    const enabledSizes =
      qrEnabledSizes.length > 0 ? qrEnabledSizes : defaultQrEnabledSizes;
    const nextDefaultSize = enabledSizes.includes(qrDefaultSize)
      ? qrDefaultSize
      : enabledSizes[0];
    const contentFields =
      qrContentFields.length > 0 ? qrContentFields : defaultQrContentFields;
    setQrEnabledSizes(enabledSizes);
    setQrDefaultSize(nextDefaultSize);
    setQrContentFields(contentFields);
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      qr_enabled_sizes: enabledSizes,
      qr_default_size: nextDefaultSize,
      qr_content_fields: contentFields,
    });
    if (error) {
      setQrSettingsState("error");
      setQrSettingsMessage(error.message ?? "Failed to save QR settings.");
      return;
    }
    setQrSettingsState("saved");
    setQrSettingsMessage("Saved.");
  }

  async function handleSaveNotificationRoles() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const roles = notificationRoles.length
      ? notificationRoles
      : ["Production planner", "Admin", "Owner"];
    setNotificationRoles(roles);
    setNotificationState("saving");
    setNotificationMessage("");
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      notification_roles: roles,
    });
    if (error) {
      setNotificationState("error");
      setNotificationMessage(error.message ?? "Failed to save roles.");
      return;
    }
    setNotificationState("saved");
    setNotificationMessage("Saved.");
  }

  async function handleSaveStationCatalog(payload: {
    updates: Array<{
      id: string;
      name: string;
      description: string;
      trackingMode: "construction_level" | "order_level" | "receipt_only";
      sortOrder: number;
    }>;
    deleteIds?: string[];
    create?: {
      name: string;
      description: string;
      trackingMode: "construction_level" | "order_level" | "receipt_only";
      sortOrder: number;
      tenantId?: string | null;
    } | null;
  }) {
    setIsStationCatalogSaving(true);
    try {
      if (payload.deleteIds?.length) {
        for (const stationId of payload.deleteIds) {
          await removeWorkStation(stationId);
        }
      }

      for (const station of payload.updates) {
        await updateWorkStation(station.id, {
          name: station.name.trim(),
          description: station.description.trim() || undefined,
          trackingMode: station.trackingMode,
          sortOrder: station.sortOrder,
        });
      }

      if (payload.create && payload.create.name.trim()) {
        await addWorkStation({
          name: payload.create.name.trim(),
          description: payload.create.description.trim() || undefined,
          isActive: true,
          sortOrder: payload.create.sortOrder,
          trackingMode: payload.create.trackingMode,
        });
      }

      setIsStationCatalogOpen(false);
    } finally {
      setIsStationCatalogSaving(false);
    }
  }

  async function handleSaveStatusLabels() {
    if (!hasStatusLabelChanges) {
      setStatusLabelState("idle");
      setStatusLabelMessage("");
      return;
    }
    setStatusLabelState("saving");
    setStatusLabelMessage("");
    const safeOrderConfig = sanitizeOrderStatusDrafts();
    setOrderStatusConfigDrafts(safeOrderConfig);
    setRules({ orderStatusConfig: safeOrderConfig });
    if (!supabase || !currentUser.tenantId) {
      setStatusLabelState("saved");
      setStatusLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert(
      {
        tenant_id: currentUser.tenantId,
        order_status_config: safeOrderConfig,
        status_labels: Object.fromEntries(
          Object.entries(safeOrderConfig).map(([key, value]) => [
            key,
            value.label,
          ]),
        ),
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      setStatusLabelState("error");
      setStatusLabelMessage(error.message);
      return;
    }
    setStatusLabelState("saved");
    setStatusLabelMessage("Status labels saved.");
  }

  async function handleSaveExternalJobStatusLabels() {
    if (!hasExternalJobStatusLabelChanges) {
      setExternalJobStatusLabelState("idle");
      setExternalJobStatusLabelMessage("");
      return;
    }
    setExternalJobStatusLabelState("saving");
    setExternalJobStatusLabelMessage("");
    const safeExternalConfig = sanitizeExternalStatusDrafts();
    setExternalJobStatusConfigDrafts(safeExternalConfig);
    setRules({ externalJobStatusConfig: safeExternalConfig });
    if (!supabase || !currentUser.tenantId) {
      setExternalJobStatusLabelState("saved");
      setExternalJobStatusLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert(
      {
        tenant_id: currentUser.tenantId,
        external_job_status_config: safeExternalConfig,
        external_job_status_labels: Object.fromEntries(
          Object.entries(safeExternalConfig).map(([key, value]) => [
            key,
            value.label,
          ]),
        ),
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      setExternalJobStatusLabelState("error");
      setExternalJobStatusLabelMessage(error.message);
      return;
    }
    setExternalJobStatusLabelState("saved");
    setExternalJobStatusLabelMessage("External job status labels saved.");
  }

  async function handleSaveAssignmentLabels() {
    if (!hasAssignmentLabelChanges) {
      setAssignmentLabelState("idle");
      setAssignmentLabelMessage("");
      return;
    }
    const nextEngineer = assignmentLabelDrafts.engineer.trim() || "Engineer";
    const nextManager = assignmentLabelDrafts.manager.trim() || "Manager";
    setAssignmentLabelState("saving");
    setAssignmentLabelMessage("");
    setRules({
      assignmentLabels: {
        ...rules.assignmentLabels,
        engineer: nextEngineer,
        manager: nextManager,
      },
    });
    if (!supabase || !currentUser.tenantId) {
      setAssignmentLabelState("saved");
      setAssignmentLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert(
      {
        tenant_id: currentUser.tenantId,
        assignment_labels: {
          ...rules.assignmentLabels,
          engineer: nextEngineer,
          manager: nextManager,
        },
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      setAssignmentLabelState("error");
      setAssignmentLabelMessage(error.message);
      return;
    }
    setAssignmentLabelState("saved");
    setAssignmentLabelMessage("Assignment labels saved.");
  }

  async function handleSaveAttachmentCategories() {
    if (!hasAttachmentCategoryChanges) {
      setAttachmentCategoryState("idle");
      setAttachmentCategoryMessage("");
      return;
    }
    setAttachmentCategoryState("saving");
    setAttachmentCategoryMessage("");
    setRules({
      attachmentCategories: attachmentCategoryDrafts,
      attachmentCategoryDefaults: attachmentDefaultDrafts,
    });
    if (!supabase || !currentUser.tenantId) {
      setAttachmentCategoryState("saved");
      setAttachmentCategoryMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert(
      {
        tenant_id: currentUser.tenantId,
        attachment_categories: attachmentCategoryDrafts,
        attachment_category_defaults: attachmentDefaultDrafts,
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      setAttachmentCategoryState("error");
      setAttachmentCategoryMessage(error.message);
      return;
    }
    setAttachmentCategoryState("saved");
    setAttachmentCategoryMessage("Attachment categories saved.");
  }

  function handleAddAttachmentCategory() {
    const trimmed = newAttachmentCategoryLabel.trim();
    if (!trimmed) {
      return;
    }
    const baseId = slugify(trimmed);
    if (!baseId) {
      return;
    }
    let nextId = baseId;
    let counter = 2;
    const existingIds = new Set(attachmentCategoryDrafts.map((item) => item.id));
    while (existingIds.has(nextId)) {
      nextId = `${baseId}-${counter}`;
      counter += 1;
    }
    const nextCategories = [
      ...attachmentCategoryDrafts,
      { id: nextId, label: trimmed, aiParseEnabled: false },
    ];
    setAttachmentCategoryDrafts(nextCategories);
    if (!attachmentDefaultDrafts.Sales) {
      setAttachmentDefaultDrafts((prev) => ({
        ...prev,
        Sales: nextId,
      }));
    }
    setNewAttachmentCategoryLabel("");
  }

  async function handleRemoveAttachmentCategory(id: string) {
    if (!(await confirm(t("settings.workflow.removeAttachmentCategoryConfirm")))) {
      return;
    }
    const nextCategories = attachmentCategoryDrafts.filter(
      (item) => item.id !== id,
    );
    setAttachmentCategoryDrafts(nextCategories);
    if (nextCategories.length === 0) {
      setAttachmentDefaultDrafts({});
      return;
    }
    const fallbackId = nextCategories[0].id;
    setAttachmentDefaultDrafts((prev) => {
      const nextDefaults = { ...prev };
      attachmentRoles.forEach((role) => {
        if (nextDefaults[role] === id) {
          nextDefaults[role] = fallbackId;
        }
      });
      return nextDefaults;
    });
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="fixed inset-x-0 bottom-0 z-50 md:inset-4 md:mx-auto md:max-w-6xl"
      >
        <div className="flex max-h-[92vh] min-h-[70vh] flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl md:max-h-full md:min-h-0 md:rounded-3xl">
          <div className="border-b border-border bg-card/95 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 inline-flex rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {t("production.main.header.title")}
                </div>
                <h2 className="text-lg font-semibold md:text-xl">
                  {t("production.main.settingsModal.title")}
                </h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("production.main.common.close")}
                onClick={onClose}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              {t("production.main.settingsModal.description")}
            </p>
          </div>

          <div className="border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
            <DetailTabsBar
              tabs={[
                {
                  value: "operations",
                  label: t("production.main.settingsModal.operations"),
                  icon: FactoryIcon,
                },
                {
                  value: "workflow",
                  label: t("production.main.settingsModal.workflow"),
                  icon: WorkflowIcon,
                },
              ]}
              className="py-0"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
            <div className="mb-6 rounded-2xl border border-border/80 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              {activeTabSubtitle}
            </div>

            <TabsContent value="operations" className="mt-0">
              <div className="space-y-6">
                {isSettingsDataLoading || isTenantSettingsLoading ? (
                  <Card>
                    <CardContent className="py-10">
                      <LoadingSpinner label={t("settings.operations.loading")} />
                    </CardContent>
                  </Card>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="border-border/80">
                    <CardContent className="flex h-full flex-col gap-4 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {t("settings.operations.workStationsTitle")}
                          </div>
                          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                            {t(
                              "production.main.settingsModal.stationCatalogDescription",
                            )}
                          </p>
                        </div>
                        <div className="inline-flex h-8 items-center rounded-full border border-border bg-muted/30 px-3 text-xs font-medium text-muted-foreground">
                          {t("production.main.jobs.stationCount", {
                            count: displayStations.length,
                          })}
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsStationCatalogOpen(true)}
                        >
                          {t("production.main.settingsModal.openStationCatalog")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <OperationsWorkingHoursCard
                    t={t}
                    optionLabel={optionLabel}
                    weekdayOptions={weekdayOptions}
                    workdays={workdays}
                    toggleWorkday={toggleWorkday}
                    overtimeEnabled={overtimeEnabled}
                    toggleOvertimeEnabled={setOvertimeEnabled}
                    workShifts={workShifts}
                    handleAddShift={handleAddShift}
                    handleWorkShiftChange={handleWorkShiftChange}
                    handleRemoveShift={handleRemoveShift}
                    isValidWorkTime={isValidWorkTime}
                    workdayError={workdayError}
                    handleSaveWorkHours={handleSaveWorkHours}
                    isWorkdaySaving={isWorkdaySaving}
                  />

                  <OperationsQrSettingsCard
                    t={t}
                    optionLabel={optionLabel}
                    qrLabelSizeOptions={qrLabelSizeOptions}
                    qrEnabledSizes={qrEnabledSizes}
                    setQrEnabledSizes={setQrEnabledSizes}
                    qrDefaultSize={qrDefaultSize}
                    setQrDefaultSize={setQrDefaultSize}
                    qrContentFieldOptions={qrContentFieldOptions}
                    qrContentFields={qrContentFields}
                    setQrContentFields={setQrContentFields}
                    getQrContentFieldLabel={(option) =>
                      (
                        rules.orderStatusConfig as Record<string, { label?: string }>
                      )[option.value]?.label ??
                      optionLabel("qrContentField", option.value, option.label)
                    }
                    handleSaveQrSettings={handleSaveQrSettings}
                    qrSettingsState={qrSettingsState}
                    qrSettingsMessage={qrSettingsMessage}
                  />

                  <OperationsNotificationsCard
                    t={t}
                    notificationRoles={notificationRoles}
                    setNotificationRoles={setNotificationRoles}
                    formatUserRoleLabel={formatUserRoleLabel}
                    handleSaveNotificationRoles={handleSaveNotificationRoles}
                    notificationState={notificationState}
                    notificationMessage={notificationMessage}
                  />
                </div>

                <OperationsStopReasonsCard
                  t={t}
                  stopReasonLabel={stopReasonLabel}
                  setStopReasonLabel={setStopReasonLabel}
                  handleSaveStopReason={handleSaveStopReason}
                  editingStopReasonId={editingStopReasonId}
                  resetStopReasonForm={resetStopReasonForm}
                  selectedStopReasonIds={selectedStopReasonIds}
                  setSelectedStopReasonIds={setSelectedStopReasonIds}
                  stopReasons={stopReasons}
                  handleDeleteSelectedStopReasons={handleDeleteSelectedStopReasons}
                  updateStopReason={updateStopReason}
                  handleEditStopReason={handleEditStopReason}
                  handleCopyStopReason={handleCopyStopReason}
                  confirmRemove={confirm}
                  removeStopReason={removeStopReason}
                />
              </div>
            </TabsContent>

            <WorkflowSettingsCard
              t={t}
              saveError={saveError}
              isLoadedFromDb={isLoadedFromDb}
              rules={rules}
              setRules={setRules}
              displayStations={displayStations}
              workflowStatusOptions={workflowStatusOptions}
              externalJobStatusOptions={externalJobStatusOptions}
              statusColorOptions={statusColorOptions}
              optionLabel={optionLabel}
              orderStatusConfigDrafts={orderStatusConfigDrafts}
              setOrderStatusConfigDrafts={setOrderStatusConfigDrafts}
              requiredActiveOrderStatuses={requiredActiveOrderStatuses}
              hasStatusLabelChanges={hasStatusLabelChanges}
              handleSaveStatusLabels={handleSaveStatusLabels}
              statusLabelState={statusLabelState}
              statusLabelMessage={statusLabelMessage}
              externalJobStatusConfigDrafts={externalJobStatusConfigDrafts}
              setExternalJobStatusConfigDrafts={setExternalJobStatusConfigDrafts}
              requiredActiveExternalStatuses={requiredActiveExternalStatuses}
              hasExternalJobStatusLabelChanges={
                hasExternalJobStatusLabelChanges
              }
              handleSaveExternalJobStatusLabels={
                handleSaveExternalJobStatusLabels
              }
              externalJobStatusLabelState={externalJobStatusLabelState}
              externalJobStatusLabelMessage={externalJobStatusLabelMessage}
              assignmentLabelDrafts={assignmentLabelDrafts}
              setAssignmentLabelDrafts={setAssignmentLabelDrafts}
              hasAssignmentLabelChanges={hasAssignmentLabelChanges}
              handleSaveAssignmentLabels={handleSaveAssignmentLabels}
              assignmentLabelState={assignmentLabelState}
              assignmentLabelMessage={assignmentLabelMessage}
              attachmentCategoryDrafts={attachmentCategoryDrafts}
              setAttachmentCategoryDrafts={setAttachmentCategoryDrafts}
              newAttachmentCategoryLabel={newAttachmentCategoryLabel}
              setNewAttachmentCategoryLabel={setNewAttachmentCategoryLabel}
              handleAddAttachmentCategory={handleAddAttachmentCategory}
              handleRemoveAttachmentCategory={handleRemoveAttachmentCategory}
              attachmentRoles={attachmentRoles}
              formatUserRoleLabel={formatUserRoleLabel}
              attachmentDefaultDrafts={attachmentDefaultDrafts}
              setAttachmentDefaultDrafts={setAttachmentDefaultDrafts}
              hasAttachmentCategoryChanges={hasAttachmentCategoryChanges}
              handleSaveAttachmentCategories={handleSaveAttachmentCategories}
              attachmentCategoryState={attachmentCategoryState}
              attachmentCategoryMessage={attachmentCategoryMessage}
              isStationOrderSaving={false}
              newChecklistLabel={newChecklistLabel}
              setNewChecklistLabel={setNewChecklistLabel}
              newChecklistRequired={newChecklistRequired}
              setNewChecklistRequired={setNewChecklistRequired}
              addChecklistItem={addChecklistItem}
              updateChecklistItem={updateChecklistItem}
              removeChecklistItem={removeChecklistItem}
              confirmRemove={confirm}
              newReturnReason={newReturnReason}
              setNewReturnReason={setNewReturnReason}
              addReturnReason={addReturnReason}
              removeReturnReason={removeReturnReason}
            />
          </div>

          <div className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("production.main.settingsModal.hint")}
              </p>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("production.main.common.close")}
              </Button>
            </div>
          </div>
        </div>
      </Tabs>
      <ProductionStationCatalogModal
        open={isStationCatalogOpen}
        onClose={() => setIsStationCatalogOpen(false)}
        stations={displayStations}
        onSave={handleSaveStationCatalog}
        isSaving={isStationCatalogSaving}
      />
      {dialog}
    </>
  );
}
