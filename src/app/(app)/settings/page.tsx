"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CopyIcon,
  FactoryIcon,
  GitBranchIcon,
  InfoIcon,
  NetworkIcon,
  PanelRightIcon,
  PencilIcon,
  PuzzleIcon,
  Trash2Icon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InputField } from "@/components/ui/InputField";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DataTable } from "@/components/ui/DataTable";
import { Tooltip } from "@/components/ui/Tooltip";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { DetailTabsBar } from "@/components/layout/DetailTabsBar";
import { useHideMobileFloatingControls } from "@/hooks/useHideMobileFloatingControls";
import { useOrderFieldSettings } from "./OrderFieldSettingsContext";
import { useSettingsData } from "@/hooks/useSettingsData";
import {
  formatUserRoleLabel,
  normalizeUserRole,
  useAuthActions,
  useCurrentUser,
  type UserRole,
  userRoleOptions,
} from "@/contexts/UserContext";
import { useRbac } from "@/contexts/RbacContext";
import {
  defaultPermissionRoles,
  permissionDefinitions,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabaseClient";
import { getStatusBadgeColorClass } from "@/lib/domain/statusBadgeColor";
import type { StationTrackingMode, WorkStation } from "@/types/workstation";
import type {
  OrderInputFieldType,
  OrderInputGroupKey,
  OrderInputTableColumn,
  OrderInputTableColumnType,
} from "@/types/orderInputs";
import {
  useWorkflowRules,
  type ProductionCompletionMode,
  type WorkflowTargetStatus,
  type WorkflowStatusColor,
} from "@/contexts/WorkflowContext";
import { useWorkingCalendar } from "@/contexts/WorkingCalendarContext";
import {
  DEFAULT_WORKDAYS,
  DEFAULT_WORK_SHIFTS,
  isValidWorkTime,
  normalizeWorkTime,
  parseWorkingCalendar,
  validateWorkingCalendar,
  type WorkShift,
} from "@/lib/domain/workingCalendar";
import type {
  ExternalJobFieldRole,
  ExternalJobFieldScope,
  ExternalJobFieldType,
  ExternalJobStatus,
  OrderStatus,
} from "@/types/orders";
import { useI18n } from "@/lib/i18n/useI18n";
import { ORDER_CORE_FIELD_KEYS } from "@/lib/domain/orderCoreFields";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const integrations = [
  { id: "int-1", name: "Horizon", status: "Coming soon" },
  { id: "int-2", name: "Odoo", status: "Coming soon" },
  { id: "int-3", name: "SAP Business One", status: "Coming soon" },
  { id: "int-4", name: "QuickBooks", status: "Coming soon" },
  { id: "int-5", name: "Custom API", status: "Coming soon" },
];

const defaultExternalRequestEmailSubjectTemplate =
  "PWS request {{order_number}} - action required";
const defaultExternalRequestEmailHtmlTemplate = `
<p>Sveiki,</p>
<p>Jūs saņēmāt jaunu ārējā darba pieprasījumu no {{customer_name}}.</p>
<p><strong>Pasūtījums:</strong> {{order_number}}</p>
<p><strong>Ārējais pasūtījums:</strong> {{external_order_number}}</p>
<p><strong>Termiņš:</strong> {{due_date}}</p>
{{comment_block}}
{{attachments_block}}
<p><a href="{{secure_form_link}}">Atvērt drošo formu</a></p>
<p>Šī saite beidzas {{expires_at}}.</p>
`.trim();
const defaultExternalRequestEmailTextTemplate = [
  "Sveiki,",
  "Pasūtījums: {{order_number}}",
  "Klients: {{customer_name}}",
  "Ārējais pasūtījums: {{external_order_number}}",
  "Termiņš: {{due_date}}",
  "{{comment_line}}",
  "{{attachments_line}}",
  "Drošā forma: {{secure_form_link}}",
  "Saite beidzas: {{expires_at}}",
].join("\n");

const workflowStatusOptions: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ready_for_engineering", label: "Ready for engineering" },
  { value: "in_engineering", label: "In engineering" },
  { value: "engineering_blocked", label: "Engineering blocked" },
  { value: "ready_for_production", label: "Ready for production" },
  { value: "in_production", label: "In production" },
  { value: "done", label: "Done" },
];

type AttachmentRole = UserRole;

const lockedFieldKeys = new Set(ORDER_CORE_FIELD_KEYS);

const defaultFieldDescriptions: Record<string, string> = {
  order_number: "Unique order identifier shown in the main order list.",
  customer_name: "Customer or company for the order.",
  quantity: "Planned order quantity.",
  due_date: "Promised delivery date.",
  manager: "Sales/lead owner responsible for the order.",
  engineer: "Assigned engineer or designer handling the order.",
  priority: "Order urgency level used in planning and sorting.",
  status: "Current order workflow state.",
  actions: "Attachment and comment indicators shown in the list row.",
  delivery_address: "Delivery destination metadata field.",
  customer_phone: "Customer contact phone metadata field.",
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

const orderInputGroupOptions: { value: OrderInputGroupKey; label: string }[] = [
  { value: "order_info", label: "Order info" },
  { value: "production_scope", label: "Production scope" },
];

const orderInputFieldTypeOptions: {
  value: OrderInputFieldType;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Multiline text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "toggle", label: "Toggle" },
  { value: "toggle_number", label: "Toggle + number" },
  { value: "table", label: "Table (repeatable rows)" },
];

const externalJobFieldTypeOptions: {
  value: ExternalJobFieldType;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Multiline text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "toggle", label: "Toggle" },
];

const stationTrackingModeOptions: Array<{
  value: StationTrackingMode;
  label: string;
}> = [
  { value: "construction_level", label: "By construction" },
  { value: "order_level", label: "By whole order/batch" },
  { value: "receipt_only", label: "Receipt only" },
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

const externalJobFieldScopeOptions: {
  value: ExternalJobFieldScope;
  label: string;
}[] = [
  { value: "manual", label: "Manual entry" },
  { value: "portal_response", label: "Partner portal response" },
];

const externalJobFieldRoleOptions: {
  value: ExternalJobFieldRole;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "planned_price", label: "Planned price" },
  { value: "invoice_price", label: "Invoice price" },
];

const orderInputColumnTypeOptions: {
  value: OrderInputTableColumnType;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
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

const inactiveRoleOptions = new Set<UserRole>(["Dealer"]);

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

const settingsSections = [
  { value: "orderFields", icon: NetworkIcon },
  { value: "operations", icon: FactoryIcon },
  { value: "partners", icon: GitBranchIcon },
  { value: "users", icon: UsersIcon },
  { value: "workflow", icon: WorkflowIcon },
  { value: "integrations", icon: PuzzleIcon },
] as const;

type SettingsSectionValue = (typeof settingsSections)[number]["value"];

type ExternalTableColumnSetting = {
  id: string;
  visible: boolean;
  label?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const { signOut } = useAuthActions();
  const { t } = useI18n();
  const {
    permissions: rolePermissions,
    loading: rolePermissionsLoading,
    error: rolePermissionsError,
    hasPermission,
    savePermissionRoles,
  } = useRbac();
  const { confirm, dialog } = useConfirmDialog();
  const { orderFields, addOrderField, updateOrderField, removeOrderField } =
    useOrderFieldSettings();

  const sortedFields = useMemo(
    () => [...orderFields].sort((a, b) => a.order - b.order),
    [orderFields],
  );
  const [fieldName, setFieldName] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldActive, setFieldActive] = useState(true);
  const [fieldShowInTable, setFieldShowInTable] = useState(true);
  const [inlineEditingFieldId, setInlineEditingFieldId] = useState<
    string | null
  >(null);
  const [inlineFieldName, setInlineFieldName] = useState("");
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [fieldDropIndex, setFieldDropIndex] = useState<number | null>(null);

  const {
    workStations,
    stationDependencies,
    orderInputFields,
    externalJobFields,
    stopReasons,
    partners,
    partnerGroups,
    isLoading: isSettingsDataLoading,
    addWorkStation,
    updateWorkStation,
    removeWorkStation,
    updateStationDependencies,
    addOrderInputField,
    updateOrderInputField,
    removeOrderInputField,
    ensureDefaultOrderInputFields,
    addExternalJobField,
    updateExternalJobField,
    removeExternalJobField,
    addStopReason,
    updateStopReason,
    removeStopReason,
    addPartner,
    updatePartner,
    removePartner,
    addPartnerGroup,
    updatePartnerGroup,
    removePartnerGroup,
  } = useSettingsData();
  const sortedOrderInputFields = useMemo(
    () =>
      [...orderInputFields].sort((a, b) => {
        if (a.groupKey !== b.groupKey) {
          return a.groupKey.localeCompare(b.groupKey);
        }
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.label.localeCompare(b.label);
      }),
    [orderInputFields],
  );
  const sortedExternalJobFields = useMemo(() => {
    const uniqueById = Array.from(
      new Map(externalJobFields.map((field) => [field.id, field])).values(),
    );
    return uniqueById.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.label.localeCompare(b.label);
    });
  }, [externalJobFields]);
  const externalTableColumnCatalog = useMemo(
    () => [
      { id: "sys.order_number", label: "Order #" },
      { id: "sys.customer_name", label: "Customer" },
      { id: "sys.partner_name", label: "Partner" },
      ...sortedExternalJobFields
        .filter((field) => field.showInTable ?? true)
        .map((field) => ({
          id: `field.${field.id}`,
          label: field.label,
        })),
      { id: "cmp.price_diff", label: "Price diff" },
      { id: "sys.received_at", label: "Received" },
      { id: "sys.added_by", label: "Added by" },
      { id: "sys.status", label: "Status" },
    ],
    [sortedExternalJobFields],
  );
  const externalTableColumnCatalogById = useMemo(
    () =>
      Object.fromEntries(
        externalTableColumnCatalog.map((column) => [column.id, column]),
      ),
    [externalTableColumnCatalog],
  );
  const externalJobFieldById = useMemo(
    () =>
      Object.fromEntries(
        sortedExternalJobFields.map((field) => [field.id, field]),
      ),
    [sortedExternalJobFields],
  );
  const [stationName, setStationName] = useState("");
  const [stationDescription, setStationDescription] = useState("");
  const [stationTrackingMode, setStationTrackingMode] =
    useState<StationTrackingMode>("construction_level");
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [dragStationId, setDragStationId] = useState<string | null>(null);
  const [isStationOrderSaving, setIsStationOrderSaving] = useState(false);
  const [workdays, setWorkdays] = useState<number[]>([...DEFAULT_WORKDAYS]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([
    ...DEFAULT_WORK_SHIFTS,
  ]);
  const [workdayError, setWorkdayError] = useState<string | null>(null);
  const [isWorkdaySaving, setIsWorkdaySaving] = useState(false);
  const [orderFieldLabel, setOrderFieldLabel] = useState("");
  const [orderFieldKey, setOrderFieldKey] = useState("");
  const [orderFieldGroup, setOrderFieldGroup] =
    useState<OrderInputGroupKey>("order_info");
  const [orderFieldType, setOrderFieldType] =
    useState<OrderInputFieldType>("text");
  const [orderFieldUnit, setOrderFieldUnit] = useState("");
  const [orderFieldOptions, setOrderFieldOptions] = useState("");
  const [orderFieldColumns, setOrderFieldColumns] = useState<
    OrderInputTableColumn[]
  >([]);
  const [dragColumnIndex, setDragColumnIndex] = useState<number | null>(null);
  const [dragOverColumnIndex, setDragOverColumnIndex] = useState<number | null>(
    null,
  );
  const [orderFieldRequired, setOrderFieldRequired] = useState(false);
  const [orderFieldActive, setOrderFieldActive] = useState(true);
  const [orderFieldShowInProduction, setOrderFieldShowInProduction] =
    useState(false);
  const [orderFieldSortOrder, setOrderFieldSortOrder] = useState(0);
  const [editingOrderFieldId, setEditingOrderFieldId] = useState<string | null>(
    null,
  );
  const [selectedOrderFieldIds, setSelectedOrderFieldIds] = useState<string[]>(
    [],
  );
  const [externalJobFieldLabel, setExternalJobFieldLabel] = useState("");
  const [externalJobFieldType, setExternalJobFieldType] =
    useState<ExternalJobFieldType>("text");
  const [externalJobFieldScope, setExternalJobFieldScope] =
    useState<ExternalJobFieldScope>("manual");
  const [externalJobFieldRole, setExternalJobFieldRole] =
    useState<ExternalJobFieldRole>("none");
  const [externalJobFieldUnit, setExternalJobFieldUnit] = useState("");
  const [externalJobFieldOptions, setExternalJobFieldOptions] = useState("");
  const [externalJobFieldRequired, setExternalJobFieldRequired] =
    useState(false);
  const [externalJobFieldActive, setExternalJobFieldActive] = useState(true);
  const [externalJobFieldShowInTable, setExternalJobFieldShowInTable] =
    useState(true);
  const [externalJobFieldAiEnabled, setExternalJobFieldAiEnabled] =
    useState(false);
  const [externalJobFieldAiMatchOnly, setExternalJobFieldAiMatchOnly] =
    useState(false);
  const [externalJobFieldAiAliases, setExternalJobFieldAiAliases] =
    useState("");
  const [externalJobFieldSortOrder, setExternalJobFieldSortOrder] = useState(0);
  const [editingExternalJobFieldId, setEditingExternalJobFieldId] = useState<
    string | null
  >(null);
  const [selectedExternalJobFieldIds, setSelectedExternalJobFieldIds] =
    useState<string[]>([]);
  const [selectedWorkStationIds, setSelectedWorkStationIds] = useState<
    string[]
  >([]);
  const [selectedStopReasonIds, setSelectedStopReasonIds] = useState<string[]>(
    [],
  );
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [selectedPartnerGroupIds, setSelectedPartnerGroupIds] = useState<
    string[]
  >([]);

  const [stopReasonLabel, setStopReasonLabel] = useState("");
  const [editingStopReasonId, setEditingStopReasonId] = useState<string | null>(
    null,
  );
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [partnerGroupId, setPartnerGroupId] = useState<string>("");
  const [partnerGroupName, setPartnerGroupName] = useState("");
  const [editingPartnerGroupId, setEditingPartnerGroupId] = useState<
    string | null
  >(null);
  const [users, setUsers] = useState<
    {
      id: string;
      name: string;
      role: UserRole;
      isAdmin: boolean;
      isOwner: boolean;
    }[]
  >([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isTenantProfileLoading, setIsTenantProfileLoading] = useState(false);
  const [isTenantSettingsLoading, setIsTenantSettingsLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(
    null,
  );
  const [operatorAssignments, setOperatorAssignments] = useState<
    { id: string; userId: string; stationId: string; isActive: boolean }[]
  >([]);
  const [operatorAssignmentsError, setOperatorAssignmentsError] = useState<
    string | null
  >(null);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);
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
  const [notificationRoles, setNotificationRoles] = useState<string[]>([
    "Production planner",
    "Admin",
    "Owner",
  ]);
  const [notificationState, setNotificationState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [externalTableColumns, setExternalTableColumns] = useState<
    ExternalTableColumnSetting[]
  >([]);
  const [dragExternalTableColumnId, setDragExternalTableColumnId] = useState<
    string | null
  >(null);
  const [externalTableDropIndex, setExternalTableDropIndex] = useState<
    number | null
  >(null);
  const [externalTableState, setExternalTableState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [externalTableMessage, setExternalTableMessage] = useState("");
  const [externalPricingEnabled, setExternalPricingEnabled] = useState(false);
  const [externalPricingState, setExternalPricingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [externalPricingMessage, setExternalPricingMessage] = useState("");
  const [devRoleOverride, setDevRoleOverride] = useState(false);
  const sortedStations = useMemo(
    () =>
      [...workStations].sort((a, b) => {
        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return a.name.localeCompare(b.name);
      }),
    [workStations],
  );
  const [localStations, setLocalStations] = useState(sortedStations);
  const displayStations = localStations.length ? localStations : sortedStations;
  const stationDependenciesByStation = useMemo(() => {
    const map = new Map<string, Set<string>>();
    stationDependencies.forEach((row) => {
      if (!map.has(row.stationId)) {
        map.set(row.stationId, new Set());
      }
      map.get(row.stationId)?.add(row.dependsOnStationId);
    });
    return map;
  }, [stationDependencies]);

  useEffect(() => {
    setLocalStations(sortedStations);
  }, [sortedStations]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadWorkHours = async () => {
      setIsTenantSettingsLoading(true);
      try {
        const { data, error } = await sb
          .from("tenant_settings")
          .select(
            "workday_start, workday_end, workdays, work_shifts, qr_enabled_sizes, qr_default_size, qr_content_fields, notification_roles, external_price_reconciliation_enabled, external_table_columns",
          )
          .eq("tenant_id", currentUser.tenantId)
          .maybeSingle();
        if (!isMounted) {
          return;
        }
        if (error || !data) {
          return;
        }
        const calendar = parseWorkingCalendar(data);
        setWorkdays(calendar.workdays);
        setWorkShifts(calendar.shifts);
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
        if (typeof data.external_price_reconciliation_enabled === "boolean") {
          setExternalPricingEnabled(data.external_price_reconciliation_enabled);
        }
        if (Array.isArray(data.external_table_columns)) {
          setExternalTableColumns(
            data.external_table_columns
              .map((item) => {
                if (
                  item &&
                  typeof item === "object" &&
                  "id" in item &&
                  typeof (item as { id?: unknown }).id === "string"
                ) {
                  return {
                    id: (item as { id: string }).id,
                    visible: (item as { visible?: unknown }).visible !== false,
                    label:
                      typeof (item as { label?: unknown }).label === "string"
                        ? (item as { label: string }).label
                        : undefined,
                  } as ExternalTableColumnSetting;
                }
                return null;
              })
              .filter((item): item is ExternalTableColumnSetting =>
                Boolean(item),
              ),
          );
        }
      } finally {
        if (isMounted) {
          setIsTenantSettingsLoading(false);
        }
      }
    };
    void loadWorkHours();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);
  const [companyName, setCompanyName] = useState("");
  const [outboundFromName, setOutboundFromName] = useState("");
  const [outboundFromEmail, setOutboundFromEmail] = useState("");
  const [outboundReplyToEmail, setOutboundReplyToEmail] = useState("");
  const [outboundUseUserSender, setOutboundUseUserSender] = useState(true);
  const [outboundSenderVerified, setOutboundSenderVerified] = useState(false);
  const [
    externalRequestEmailSubjectTemplate,
    setExternalRequestEmailSubjectTemplate,
  ] = useState(defaultExternalRequestEmailSubjectTemplate);
  const [
    externalRequestEmailHtmlTemplate,
    setExternalRequestEmailHtmlTemplate,
  ] = useState(defaultExternalRequestEmailHtmlTemplate);
  const [
    externalRequestEmailTextTemplate,
    setExternalRequestEmailTextTemplate,
  ] = useState(defaultExternalRequestEmailTextTemplate);
  const [outboundState, setOutboundState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [outboundMessage, setOutboundMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("Sales");
  const [inviteState, setInviteState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [inviteMessage, setInviteMessage] = useState("");
  const [isSecurityPromptOpen, setIsSecurityPromptOpen] = useState(false);
  const [securityPassword, setSecurityPassword] = useState("");
  const [securityState, setSecurityState] = useState<
    "idle" | "verifying" | "error"
  >("idle");
  const [securityMessage, setSecurityMessage] = useState("");
  const [privilegedVerifiedAt, setPrivilegedVerifiedAt] = useState<
    number | null
  >(null);
  const [pendingPrivilegedAction, setPendingPrivilegedAction] = useState<{
    run: () => Promise<void>;
  } | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState(rolePermissions);
  const [permissionState, setPermissionState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [permissionMessage, setPermissionMessage] = useState("");
  const [invites, setInvites] = useState<
    {
      id: string;
      email: string;
      fullName?: string | null;
      role: UserRole;
      invitedAt: string;
      acceptedAt?: string | null;
    }[]
  >([]);
  const [isInvitesLoading, setIsInvitesLoading] = useState(false);
  const [resendingInviteEmail, setResendingInviteEmail] = useState<
    string | null
  >(null);
  const [inviteListState, setInviteListState] = useState<
    "idle" | "sent" | "error"
  >("idle");
  const [inviteListMessage, setInviteListMessage] = useState("");
  const canManageRolePermissions = hasPermission("settings.manage");
  const privilegedSessionTtlMs = 5 * 60 * 1000;
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
  const { refresh: refreshWorkingCalendar } = useWorkingCalendar();
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
  const attachmentRoles: AttachmentRole[] = [
    "Admin",
    "Sales",
    "Engineering",
    "Production planner",
    "Operator",
    "Dealer",
    "Warehouse",
  ];
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
  const hasPermissionChanges = useMemo(
    () => JSON.stringify(permissionDrafts) !== JSON.stringify(rolePermissions),
    [permissionDrafts, rolePermissions],
  );
  const editablePermissionRoles = useMemo(
    () =>
      userRoleOptions.filter(
        (role) => !inactiveRoleOptions.has(role) && role !== "Operator",
      ),
    [],
  );
  const assignableRoleOptions = useMemo(
    () =>
      userRoleOptions.filter(
        (role) => !inactiveRoleOptions.has(role) && role !== "Admin",
      ),
    [],
  );
  const optionLabel = (group: string, value: string, fallback: string) =>
    t(`settings.options.${group}.${value}`, { fallback }) ===
    `settings.options.${group}.${value}`
      ? fallback
      : t(`settings.options.${group}.${value}`);

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
    setPermissionDrafts(rolePermissions);
  }, [rolePermissions]);
  useEffect(() => {
    setAttachmentCategoryDrafts(rules.attachmentCategories);
    setAttachmentDefaultDrafts(rules.attachmentCategoryDefaults);
  }, [rules.attachmentCategories, rules.attachmentCategoryDefaults]);

  const sanitizeOrderStatusDrafts = (
    drafts: typeof orderStatusConfigDrafts,
  ) => {
    const next = { ...drafts };
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

  const sanitizeExternalStatusDrafts = (
    drafts: typeof externalJobStatusConfigDrafts,
  ) => {
    const next = { ...drafts };
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

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const fetchCompany = async () => {
      setIsTenantProfileLoading(true);
      try {
        const { data, error } = await sb
          .from("tenants")
          .select(
            "name, legal_name, registration_no, vat_no, billing_email, address, logo_url, outbound_from_name, outbound_from_email, outbound_reply_to_email, outbound_use_user_sender, outbound_sender_verified, external_request_email_subject_template, external_request_email_html_template, external_request_email_text_template",
          )
          .eq("id", currentUser.tenantId)
          .maybeSingle();
        if (!isMounted || error || !data) {
          return;
        }
        setCompanyName(data.name ?? "");
        setOutboundFromName(data.outbound_from_name ?? "");
        setOutboundFromEmail(data.outbound_from_email ?? "");
        setOutboundReplyToEmail(data.outbound_reply_to_email ?? "");
        setOutboundUseUserSender(data.outbound_use_user_sender ?? true);
        setOutboundSenderVerified(data.outbound_sender_verified ?? false);
        setExternalRequestEmailSubjectTemplate(
          data.external_request_email_subject_template ??
            defaultExternalRequestEmailSubjectTemplate,
        );
        setExternalRequestEmailHtmlTemplate(
          data.external_request_email_html_template ??
            defaultExternalRequestEmailHtmlTemplate,
        );
        setExternalRequestEmailTextTemplate(
          data.external_request_email_text_template ??
            defaultExternalRequestEmailTextTemplate,
        );
      } finally {
        if (isMounted) {
          setIsTenantProfileLoading(false);
        }
      }
    };
    void fetchCompany();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    const fetchInvites = async () => {
      setIsInvitesLoading(true);
      const { data, error } = await sb
        .from("user_invites")
        .select("id, email, full_name, role, invited_at, accepted_at")
        .eq("tenant_id", currentUser.tenantId)
        .order("invited_at", { ascending: false });
      if (!error) {
        setInvites(
          (data ?? []).map((row) => ({
            id: row.id,
            email: row.email,
            fullName: row.full_name ?? null,
            role: normalizeUserRole(row.role),
            invitedAt: row.invited_at,
            acceptedAt: row.accepted_at,
          })),
        );
      }
      setIsInvitesLoading(false);
    };
    fetchInvites();
  }, [currentUser.tenantId]);

  async function handleSaveStatusLabels() {
    if (!hasStatusLabelChanges) {
      setStatusLabelState("idle");
      setStatusLabelMessage("");
      return;
    }
    setStatusLabelState("saving");
    setStatusLabelMessage("");
    const safeOrderConfig = sanitizeOrderStatusDrafts(orderStatusConfigDrafts);
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
    const safeExternalConfig = sanitizeExternalStatusDrafts(
      externalJobStatusConfigDrafts,
    );
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

  async function handleInviteUser() {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!supabase || !currentUser.tenantId || !trimmed) {
      return;
    }
    setInviteState("sending");
    setInviteMessage("");
    const { data: inviteRow, error: insertError } = await supabase
      .from("user_invites")
      .insert({
        tenant_id: currentUser.tenantId,
        email: trimmed,
        full_name: inviteFullName.trim() || null,
        role: inviteRole,
        invited_by: currentUser.id,
      })
      .select("id, email, full_name, role, invited_at, accepted_at")
      .single();
    if (insertError || !inviteRow) {
      setInviteState("error");
      setInviteMessage(insertError.message);
      return;
    }
    let response: Response;
    try {
      response = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmed, mode: "invite" }),
      });
    } catch {
      await supabase.from("user_invites").delete().eq("id", inviteRow.id);
      setInviteState("error");
      setInviteMessage("Failed to send invite.");
      return;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      await supabase.from("user_invites").delete().eq("id", inviteRow.id);
      setInviteState("error");
      setInviteMessage(data.error ?? "Failed to send invite.");
      return;
    }
    setInviteState("sent");
    setInviteMessage("Invite sent.");
    setInviteEmail("");
    setInviteFullName("");
    setInvites((prev) => [
      {
        id: inviteRow.id,
        email: inviteRow.email,
        fullName: inviteRow.full_name ?? null,
        role: normalizeUserRole(inviteRow.role),
        invitedAt: inviteRow.invited_at,
        acceptedAt: inviteRow.accepted_at,
      },
      ...prev,
    ]);
  }

  async function handleResendInvite(email: string) {
    setResendingInviteEmail(email);
    setInviteListState("idle");
    setInviteListMessage("");
    try {
      const response = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, mode: "invite" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setInviteListState("error");
        setInviteListMessage(data.error ?? "Failed to resend invite.");
        return;
      }
      setInviteListState("sent");
      setInviteListMessage(`Invite resent to ${email}.`);
    } finally {
      setResendingInviteEmail(null);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!supabase) {
      return;
    }
    const { error } = await supabase
      .from("user_invites")
      .delete()
      .eq("id", inviteId);
    if (!error) {
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    }
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
    const existingIds = new Set(
      attachmentCategoryDrafts.map((item) => item.id),
    );
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
    if (
      !(await confirmRemove(
        t("settings.workflow.removeAttachmentCategoryConfirm"),
      ))
    ) {
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

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setUsers([
        {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          isAdmin: currentUser.isAdmin,
          isOwner: currentUser.isOwner,
        },
      ]);
      return;
    }
    if (currentUser.loading || !currentUser.isAuthenticated) {
      setUsers([]);
      return;
    }
    let isMounted = true;
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      setUsersError(null);
      const query = sb
        .from("profiles")
        .select("id, full_name, role, tenant_id, is_admin, is_owner")
        .order("full_name", { ascending: true });
      if (currentUser.tenantId) {
        query.eq("tenant_id", currentUser.tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setUsersError(error.message);
        setIsUsersLoading(false);
        return;
      }
      setUsers(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.full_name ?? "User",
          role: normalizeUserRole(row.role),
          isAdmin: row.is_admin ?? false,
          isOwner: row.is_owner ?? false,
        })),
      );
      setIsUsersLoading(false);
    };
    fetchUsers();
    return () => {
      isMounted = false;
    };
  }, [
    currentUser.id,
    currentUser.isAuthenticated,
    currentUser.loading,
    currentUser.name,
    currentUser.role,
    currentUser.isAdmin,
    currentUser.isOwner,
    currentUser.tenantId,
  ]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.isAuthenticated) {
      setOperatorAssignments([]);
      return;
    }
    let isMounted = true;
    const fetchAssignments = async () => {
      setIsAssignmentsLoading(true);
      setOperatorAssignmentsError(null);
      const { data, error } = await sb
        .from("operator_station_assignments")
        .select("id, user_id, station_id, is_active")
        .order("created_at", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (error) {
        setOperatorAssignmentsError(error.message);
        setIsAssignmentsLoading(false);
        return;
      }
      setOperatorAssignments(
        (data ?? []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          stationId: row.station_id,
          isActive: row.is_active ?? true,
        })),
      );
      setIsAssignmentsLoading(false);
    };
    void fetchAssignments();
    return () => {
      isMounted = false;
    };
  }, [currentUser.id, currentUser.isAuthenticated]);

  const operatorAssignmentsByKey = useMemo(() => {
    const map = new Map<
      string,
      { id: string; userId: string; stationId: string; isActive: boolean }
    >();
    operatorAssignments.forEach((assignment) => {
      map.set(`${assignment.userId}:${assignment.stationId}`, assignment);
    });
    return map;
  }, [operatorAssignments]);

  async function handleToggleOperatorAssignment(
    userId: string,
    stationId: string,
  ) {
    if (!supabase) {
      return;
    }
    const key = `${userId}:${stationId}`;
    const existing = operatorAssignmentsByKey.get(key);
    if (existing) {
      const { error } = await supabase
        .from("operator_station_assignments")
        .delete()
        .eq("id", existing.id);
      if (error) {
        setOperatorAssignmentsError(error.message);
        return;
      }
      setOperatorAssignments((prev) =>
        prev.filter((assignment) => assignment.id !== existing.id),
      );
      return;
    }
    const { data, error } = await supabase
      .from("operator_station_assignments")
      .insert({
        user_id: userId,
        station_id: stationId,
        is_active: true,
      })
      .select("id, user_id, station_id, is_active")
      .single();
    if (error || !data) {
      setOperatorAssignmentsError(
        error?.message ?? "Failed to assign station.",
      );
      return;
    }
    setOperatorAssignments((prev) => [
      ...prev,
      {
        id: data.id,
        userId: data.user_id,
        stationId: data.station_id,
        isActive: data.is_active ?? true,
      },
    ]);
  }

  async function handleUpdateUserRole(userId: string, role: UserRole) {
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role } : user)),
      );
      return;
    }
    setUpdatingUserId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (error) {
      setUsersError(error.message);
      setUpdatingUserId(null);
      return;
    }
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role } : user)),
    );
    setUpdatingUserId(null);
    if (userId === currentUser.id) {
      await signOut();
      return;
    }
  }

  const hasFreshPrivilegedVerification = () =>
    privilegedVerifiedAt !== null &&
    Date.now() - privilegedVerifiedAt < privilegedSessionTtlMs;

  async function runPrivilegedAction(action: () => Promise<void>) {
    if (hasFreshPrivilegedVerification()) {
      await action();
      return;
    }
    setPendingPrivilegedAction({ run: action });
    setSecurityPassword("");
    setSecurityState("idle");
    setSecurityMessage("");
    setIsSecurityPromptOpen(true);
  }

  async function handleConfirmSecurityVerification() {
    if (!supabase) {
      setSecurityState("error");
      setSecurityMessage("Supabase is not configured.");
      return;
    }
    if (!currentUser.email) {
      setSecurityState("error");
      setSecurityMessage("Current user email is missing.");
      return;
    }
    if (!securityPassword.trim()) {
      setSecurityState("error");
      setSecurityMessage("Password is required.");
      return;
    }

    setSecurityState("verifying");
    setSecurityMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: securityPassword,
    });
    if (error || !data.user) {
      setSecurityState("error");
      setSecurityMessage(error?.message ?? "Verification failed.");
      return;
    }
    if (data.user.id !== currentUser.id) {
      setSecurityState("error");
      setSecurityMessage("Verification user mismatch.");
      return;
    }

    setPrivilegedVerifiedAt(Date.now());
    setIsSecurityPromptOpen(false);
    setSecurityPassword("");
    setSecurityState("idle");
    const action = pendingPrivilegedAction?.run;
    setPendingPrivilegedAction(null);
    if (action) {
      await action();
    }
  }

  function closeSecurityPrompt() {
    setIsSecurityPromptOpen(false);
    setSecurityPassword("");
    setSecurityState("idle");
    setSecurityMessage("");
    setPendingPrivilegedAction(null);
  }

  async function handleUpdateUserAdminInternal(
    userId: string,
    isAdmin: boolean,
  ) {
    const targetUser = users.find((user) => user.id === userId);
    if (targetUser?.isOwner && !isAdmin) {
      setUsersError("Owner must always keep admin access.");
      return;
    }
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, isAdmin: user.isOwner ? true : isAdmin }
            : user,
        ),
      );
      return;
    }
    setUpdatingUserId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: isAdmin })
      .eq("id", userId);
    if (error) {
      setUsersError(error.message);
      setUpdatingUserId(null);
      return;
    }
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? { ...user, isAdmin: user.isOwner ? true : isAdmin }
          : user,
      ),
    );
    setUpdatingUserId(null);
  }

  async function handleUpdateUserAdmin(userId: string, isAdmin: boolean) {
    await runPrivilegedAction(() =>
      handleUpdateUserAdminInternal(userId, isAdmin),
    );
  }

  async function handleUpdateUserOwnerInternal(
    userId: string,
    isOwner: boolean,
  ) {
    if (!isOwner) {
      setUsersError("Owner cannot be removed directly. Assign another owner.");
      return;
    }

    const currentOwner = users.find((user) => user.isOwner);
    if (currentOwner?.id === userId) {
      return;
    }

    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id === userId) {
            return { ...user, isOwner: true, isAdmin: true };
          }
          if (user.isOwner) {
            return { ...user, isOwner: false };
          }
          return user;
        }),
      );
      return;
    }

    setUpdatingUserId(userId);
    setUsersError(null);

    if (currentOwner) {
      const { error: demoteError } = await supabase
        .from("profiles")
        .update({ is_owner: false })
        .eq("id", currentOwner.id);
      if (demoteError) {
        setUsersError(demoteError.message);
        setUpdatingUserId(null);
        return;
      }
    }

    const { error: promoteError } = await supabase
      .from("profiles")
      .update({ is_owner: true, is_admin: true })
      .eq("id", userId);

    if (promoteError) {
      if (currentOwner) {
        await supabase
          .from("profiles")
          .update({ is_owner: true, is_admin: true })
          .eq("id", currentOwner.id);
      }
      setUsersError(promoteError.message);
      setUpdatingUserId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id === userId) {
          return { ...user, isOwner: true, isAdmin: true };
        }
        if (user.isOwner) {
          return { ...user, isOwner: false };
        }
        return user;
      }),
    );
    setUpdatingUserId(null);
  }

  async function handleUpdateUserOwner(userId: string, isOwner: boolean) {
    if (isOwner) {
      const approved = await confirm({
        title: t("settings.users.transferOwnershipTitle"),
        description: t("settings.users.transferOwnershipDescription"),
        confirmLabel: t("settings.users.transferOwner"),
        cancelLabel: t("settings.common.cancel"),
        destructive: true,
      });
      if (!approved) {
        return;
      }
    }
    await runPrivilegedAction(() =>
      handleUpdateUserOwnerInternal(userId, isOwner),
    );
  }

  async function handleRemoveUserFromWorkspaceInternal(userId: string) {
    if (!supabase) {
      return;
    }
    if (userId === currentUser.id) {
      setUsersError(t("settings.users.cannotRemoveOwnAccount"));
      return;
    }
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    if (targetUser.isOwner) {
      setUsersError(t("settings.users.ownerCannotBeRemoved"));
      return;
    }

    setRemovingUserId(userId);
    setUsersError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setUsersError(t("settings.users.sessionExpired"));
        return;
      }

      const response = await fetch("/api/settings/users/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setUsersError(data.error ?? t("settings.users.failedRemoveUser"));
        return;
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setOperatorAssignments((prev) =>
        prev.filter((assignment) => assignment.userId !== userId),
      );
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleRemoveUserFromWorkspace(userId: string) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    const approved = await confirm({
      title: t("settings.users.removeUserTitle"),
      description: t("settings.users.removeUserDescription", {
        name: targetUser.name,
      }),
      confirmLabel: t("settings.users.removeUser"),
      cancelLabel: t("settings.common.cancel"),
      destructive: true,
    });
    if (!approved) {
      return;
    }
    await runPrivilegedAction(() =>
      handleRemoveUserFromWorkspaceInternal(userId),
    );
  }

  async function handleDeactivateUserInternal(userId: string) {
    if (!supabase) {
      return;
    }
    if (userId === currentUser.id) {
      setUsersError(t("settings.users.cannotDeactivateOwnAccount"));
      return;
    }
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    if (targetUser.isOwner) {
      setUsersError(t("settings.users.ownerCannotBeDeactivated"));
      return;
    }

    setDeactivatingUserId(userId);
    setUsersError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setUsersError(t("settings.users.sessionExpired"));
        return;
      }

      const response = await fetch("/api/settings/users/deactivate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setUsersError(data.error ?? t("settings.users.failedDeactivateUser"));
        return;
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setOperatorAssignments((prev) =>
        prev.filter((assignment) => assignment.userId !== userId),
      );
    } finally {
      setDeactivatingUserId(null);
    }
  }

  async function handleDeactivateUser(userId: string) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    const approved = await confirm({
      title: t("settings.users.deactivateUserTitle"),
      description: t("settings.users.deactivateUserDescription", {
        name: targetUser.name,
      }),
      confirmLabel: t("settings.users.deactivate"),
      cancelLabel: t("settings.common.cancel"),
      destructive: true,
    });
    if (!approved) {
      return;
    }
    await runPrivilegedAction(() => handleDeactivateUserInternal(userId));
  }

  function togglePermissionRole(permission: PermissionKey, role: UserRole) {
    setPermissionDrafts((prev) => {
      const current = prev[permission] ?? defaultPermissionRoles[permission];
      const hasRole = current.includes(role);
      return {
        ...prev,
        [permission]: hasRole
          ? current.filter((value) => value !== role)
          : [...current, role],
      };
    });
  }

  async function handleSaveRolePermissions() {
    if (!canManageRolePermissions) {
      return;
    }
    setPermissionState("saving");
    setPermissionMessage("");
    for (const def of permissionDefinitions) {
      const nextRoles =
        permissionDrafts[def.key] ?? defaultPermissionRoles[def.key];
      const currentRoles =
        rolePermissions[def.key] ?? defaultPermissionRoles[def.key];
      const unchanged =
        JSON.stringify([...nextRoles].sort()) ===
        JSON.stringify([...currentRoles].sort());
      if (unchanged) {
        continue;
      }
      const result = await savePermissionRoles(def.key, nextRoles);
      if (result.error) {
        setPermissionState("error");
        setPermissionMessage(result.error);
        return;
      }
    }
    setPermissionState("saved");
    setPermissionMessage(t("settings.users.rolePermissionsSaved"));
  }

  function resetFieldForm() {
    setFieldName("");
    setFieldRequired(false);
    setFieldActive(true);
    setFieldShowInTable(true);
  }

  function handleSaveField() {
    const trimmedName = fieldName.trim();
    if (!trimmedName) {
      return;
    }
    const normalizedKey = slugify(trimmedName);

    void addOrderField({
      name: trimmedName,
      key: normalizedKey,
      order: sortedFields.length + 1,
      isRequired: fieldRequired,
      isActive: fieldActive,
      showInTable: fieldShowInTable,
    });
    resetFieldForm();
  }

  function startInlineFieldEdit(fieldId: string) {
    const field = orderFields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }
    setInlineEditingFieldId(fieldId);
    setInlineFieldName(field.name);
  }

  function cancelInlineFieldEdit() {
    setInlineEditingFieldId(null);
    setInlineFieldName("");
  }

  async function handleSaveInlineField() {
    if (!inlineEditingFieldId) {
      return;
    }
    const trimmedName = inlineFieldName.trim();
    if (!trimmedName) {
      return;
    }
    await updateOrderField(inlineEditingFieldId, {
      name: trimmedName,
    });
    cancelInlineFieldEdit();
  }

  async function persistFieldOrder(nextFields: typeof sortedFields) {
    await Promise.all(
      nextFields.map((field, index) =>
        updateOrderField(field.id, {
          order: index + 1,
        }),
      ),
    );
  }

  async function handleDropField() {
    if (
      draggedFieldId === null ||
      fieldDropIndex === null ||
      sortedFields.length === 0
    ) {
      setDraggedFieldId(null);
      setFieldDropIndex(null);
      return;
    }

    const fromIndex = sortedFields.findIndex(
      (field) => field.id === draggedFieldId,
    );
    if (fromIndex === -1) {
      setDraggedFieldId(null);
      setFieldDropIndex(null);
      return;
    }

    let targetIndex = fieldDropIndex;
    if (fieldDropIndex > fromIndex) {
      targetIndex -= 1;
    }
    if (targetIndex === fromIndex) {
      setDraggedFieldId(null);
      setFieldDropIndex(null);
      return;
    }

    const reordered = [...sortedFields];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await persistFieldOrder(reordered);
    setDraggedFieldId(null);
    setFieldDropIndex(null);
  }

  async function handleCopyOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    const label = `${target.label} copy`;
    await addOrderInputField({
      key: slugify(label),
      label,
      groupKey: target.groupKey,
      fieldType: target.fieldType,
      unit: target.unit,
      options: target.options,
      columns: target.columns,
      isRequired: target.isRequired,
      isActive: target.isActive,
      sortOrder: target.sortOrder + 1,
    });
  }

  async function handleCopyExternalJobField(fieldId: string) {
    const target = externalJobFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    const label = `${target.label} copy`;
    await addExternalJobField({
      key: slugify(label),
      label,
      fieldType: target.fieldType,
      scope: target.scope ?? "manual",
      fieldRole: target.fieldRole ?? "none",
      unit: target.unit,
      options: target.options,
      isRequired: target.isRequired,
      isActive: target.isActive,
      showInTable: target.showInTable ?? true,
      aiEnabled: target.aiEnabled ?? false,
      aiMatchOnly: target.aiMatchOnly ?? false,
      aiAliases: target.aiAliases ?? [],
      sortOrder: target.sortOrder + 1,
    });
  }

  async function handleCopyWorkStation(stationId: string) {
    const station = workStations.find((item) => item.id === stationId);
    if (!station) {
      return;
    }
    await addWorkStation({
      name: `${station.name} copy`,
      description: station.description,
      isActive: station.isActive,
      sortOrder: station.sortOrder,
      trackingMode: station.trackingMode ?? "construction_level",
    });
  }

  async function handleDeleteSelectedWorkStations() {
    if (selectedWorkStationIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.operations.removeSelectedWorkstationsConfirm", {
          count: selectedWorkStationIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedWorkStationIds];
    for (const id of ids) {
      await removeWorkStation(id);
    }
    setSelectedWorkStationIds([]);
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
      !(await confirmRemove(
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

  async function handleCopyPartner(partnerId: string) {
    const partner = partners.find((item) => item.id === partnerId);
    if (!partner) {
      return;
    }
    await addPartner({
      name: `${partner.name} copy`,
      groupId: partner.groupId,
      email: partner.email,
      phone: partner.phone,
    });
  }

  async function handleSaveOutboundEmail() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setOutboundState("saving");
    setOutboundMessage("");
    const { error } = await supabase
      .from("tenants")
      .update({
        outbound_from_name: outboundFromName.trim() || null,
        outbound_from_email: outboundFromEmail.trim() || null,
        outbound_reply_to_email: outboundReplyToEmail.trim() || null,
        outbound_use_user_sender: outboundUseUserSender,
        outbound_sender_verified: outboundSenderVerified,
        external_request_email_subject_template:
          externalRequestEmailSubjectTemplate.trim() || null,
        external_request_email_html_template:
          externalRequestEmailHtmlTemplate.trim() || null,
        external_request_email_text_template:
          externalRequestEmailTextTemplate.trim() || null,
      })
      .eq("id", currentUser.tenantId);
    if (error) {
      setOutboundState("error");
      setOutboundMessage(
        error.message ?? "Failed to save outbound email settings.",
      );
      return;
    }
    setOutboundState("saved");
    setOutboundMessage("Outbound email settings saved.");
  }

  async function handleDeleteSelectedPartners() {
    if (selectedPartnerIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.partners.removeSelectedPartnersConfirm", {
          count: selectedPartnerIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedPartnerIds];
    for (const id of ids) {
      await removePartner(id);
    }
    setSelectedPartnerIds([]);
  }

  async function handleCopyPartnerGroup(groupId: string) {
    const group = partnerGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    await addPartnerGroup(`${group.name} copy`);
  }

  async function handleDeleteSelectedPartnerGroups() {
    if (selectedPartnerGroupIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.partners.removeSelectedGroupsConfirm", {
          count: selectedPartnerGroupIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedPartnerGroupIds];
    for (const id of ids) {
      await removePartnerGroup(id);
    }
    setSelectedPartnerGroupIds([]);
  }

  function resetStationForm() {
    setStationName("");
    setStationDescription("");
    setStationTrackingMode("construction_level");
    setEditingStationId(null);
  }

  async function handleSaveWorkHours() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const normalizedShifts = workShifts.map((shift) => ({
      start: normalizeWorkTime(shift.start, ""),
      end: normalizeWorkTime(shift.end, ""),
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
    setWorkShifts((prev) => [...prev, { start: "17:00", end: "21:00" }]);
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

  async function handleSaveExternalPricingSettings() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setExternalPricingState("saving");
    setExternalPricingMessage("");
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      external_price_reconciliation_enabled: externalPricingEnabled,
    });
    if (error) {
      setExternalPricingState("error");
      setExternalPricingMessage(
        error.message ?? "Failed to save price reconciliation settings.",
      );
      return;
    }
    setExternalPricingState("saved");
    setExternalPricingMessage("Saved.");
  }

  async function handleSaveExternalTableColumns() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setExternalTableState("saving");
    setExternalTableMessage("");
    const payload = externalTableColumns.map((item) => ({
      id: item.id,
      visible: item.visible,
      label: item.label?.trim() || null,
    }));
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      external_table_columns: payload,
    });
    if (error) {
      setExternalTableState("error");
      setExternalTableMessage(
        error.message ?? "Failed to save external table columns.",
      );
      return;
    }
    setExternalTableState("saved");
    setExternalTableMessage("Saved.");
  }

  function resetOrderFieldForm() {
    setOrderFieldLabel("");
    setOrderFieldKey("");
    setOrderFieldGroup("order_info");
    setOrderFieldType("text");
    setOrderFieldUnit("");
    setOrderFieldOptions("");
    setOrderFieldColumns([]);
    setOrderFieldRequired(false);
    setOrderFieldActive(true);
    setOrderFieldShowInProduction(false);
    setOrderFieldSortOrder(0);
    setEditingOrderFieldId(null);
  }

  function resetExternalJobFieldForm() {
    setExternalJobFieldLabel("");
    setExternalJobFieldType("text");
    setExternalJobFieldScope("manual");
    setExternalJobFieldRole("none");
    setExternalJobFieldUnit("");
    setExternalJobFieldOptions("");
    setExternalJobFieldRequired(false);
    setExternalJobFieldActive(true);
    setExternalJobFieldShowInTable(true);
    setExternalJobFieldAiEnabled(false);
    setExternalJobFieldAiMatchOnly(false);
    setExternalJobFieldAiAliases("");
    setExternalJobFieldSortOrder(0);
    setEditingExternalJobFieldId(null);
  }

  function updateOrderFieldColumn(
    index: number,
    patch: Partial<OrderInputTableColumn>,
  ) {
    setOrderFieldColumns((prev) =>
      prev.map((column, idx) =>
        idx === index ? { ...column, ...patch } : column,
      ),
    );
  }

  function addOrderFieldColumn() {
    setOrderFieldColumns((prev) => [
      ...prev,
      { key: "", label: "", aiKey: "", fieldType: "text", maxSelect: 1 },
    ]);
  }

  function removeOrderFieldColumn(index: number) {
    setOrderFieldColumns((prev) => prev.filter((_, idx) => idx !== index));
  }

  function reorderOrderFieldColumns(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }
    setOrderFieldColumns((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function parseOrderFieldOptions(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    const parts = trimmed.split(/[,\n\\]+/);
    return parts.map((item) => item.trim()).filter(Boolean);
  }

  async function confirmRemove(message: string) {
    return confirm({ description: message });
  }

  useEffect(() => {
    if (orderInputFields.length === 0) {
      if (selectedOrderFieldIds.length > 0) {
        setSelectedOrderFieldIds([]);
      }
      return;
    }
    const valid = new Set(orderInputFields.map((field) => field.id));
    const next = selectedOrderFieldIds.filter((id) => valid.has(id));
    if (next.length !== selectedOrderFieldIds.length) {
      setSelectedOrderFieldIds(next);
    }
  }, [orderInputFields, selectedOrderFieldIds]);

  useEffect(() => {
    if (externalJobFields.length === 0) {
      if (selectedExternalJobFieldIds.length > 0) {
        setSelectedExternalJobFieldIds([]);
      }
      return;
    }
    const valid = new Set(externalJobFields.map((field) => field.id));
    const next = selectedExternalJobFieldIds.filter((id) => valid.has(id));
    if (next.length !== selectedExternalJobFieldIds.length) {
      setSelectedExternalJobFieldIds(next);
    }
  }, [externalJobFields, selectedExternalJobFieldIds]);

  useEffect(() => {
    setExternalTableColumns((prev) => {
      const catalogIds = new Set(externalTableColumnCatalog.map((c) => c.id));
      const defaults = externalTableColumnCatalog.map((column) => ({
        id: column.id,
        visible: true,
      }));
      if (prev.length === 0) {
        return defaults;
      }
      const kept = prev.filter((item) => catalogIds.has(item.id));
      const missing = defaults.filter(
        (item) => !kept.some((existing) => existing.id === item.id),
      );
      const next = [...kept, ...missing];
      const isSame =
        next.length === prev.length &&
        next.every(
          (item, index) =>
            prev[index]?.id === item.id &&
            prev[index]?.visible === item.visible,
        );
      return isSame ? prev : next;
    });
  }, [externalTableColumnCatalog]);

  useEffect(() => {
    const valid = new Set(workStations.map((station) => station.id));
    const next = selectedWorkStationIds.filter((id) => valid.has(id));
    if (next.length !== selectedWorkStationIds.length) {
      setSelectedWorkStationIds(next);
    }
  }, [workStations, selectedWorkStationIds]);

  useEffect(() => {
    const valid = new Set(stopReasons.map((reason) => reason.id));
    const next = selectedStopReasonIds.filter((id) => valid.has(id));
    if (next.length !== selectedStopReasonIds.length) {
      setSelectedStopReasonIds(next);
    }
  }, [stopReasons, selectedStopReasonIds]);

  useEffect(() => {
    const valid = new Set(partners.map((partner) => partner.id));
    const next = selectedPartnerIds.filter((id) => valid.has(id));
    if (next.length !== selectedPartnerIds.length) {
      setSelectedPartnerIds(next);
    }
  }, [partners, selectedPartnerIds]);

  useEffect(() => {
    const valid = new Set(partnerGroups.map((group) => group.id));
    const next = selectedPartnerGroupIds.filter((id) => valid.has(id));
    if (next.length !== selectedPartnerGroupIds.length) {
      setSelectedPartnerGroupIds(next);
    }
  }, [partnerGroups, selectedPartnerGroupIds]);

  async function handleSaveOrderField() {
    const trimmedLabel = orderFieldLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const resolvedKey = orderFieldKey.trim() || slugify(trimmedLabel);
    const options =
      orderFieldType === "select"
        ? parseOrderFieldOptions(orderFieldOptions)
        : undefined;
    const columns =
      orderFieldType === "table"
        ? orderFieldColumns
            .map((column) => {
              const trimmedColumnLabel = column.label.trim();
              if (!trimmedColumnLabel) {
                return null;
              }
              const columnKey =
                column.key?.trim() || slugify(trimmedColumnLabel);
              const columnOptions =
                column.fieldType === "select"
                  ? (column.options ?? [])
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : undefined;
              return {
                key: columnKey,
                label: trimmedColumnLabel,
                aiKey: column.aiKey?.trim() || undefined,
                fieldType: column.fieldType,
                unit: column.unit?.trim() || undefined,
                options: columnOptions,
                isRequired: column.isRequired ?? false,
                maxSelect:
                  column.fieldType === "select"
                    ? Math.max(1, Math.min(3, Number(column.maxSelect ?? 1)))
                    : undefined,
              } as OrderInputTableColumn;
            })
            .filter((column): column is OrderInputTableColumn =>
              Boolean(column),
            )
        : undefined;
    const payload = {
      key: resolvedKey,
      label: trimmedLabel,
      groupKey: orderFieldGroup,
      fieldType: orderFieldType,
      unit: orderFieldUnit.trim() || undefined,
      options,
      columns,
      isRequired: orderFieldRequired,
      isActive: orderFieldActive,
      showInProduction: orderFieldShowInProduction,
      sortOrder: Number.isFinite(orderFieldSortOrder) ? orderFieldSortOrder : 0,
    };
    if (editingOrderFieldId) {
      await updateOrderInputField(editingOrderFieldId, payload);
      resetOrderFieldForm();
      return;
    }
    await addOrderInputField(payload);
    resetOrderFieldForm();
  }

  async function handleSaveExternalJobField() {
    const trimmedLabel = externalJobFieldLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const options =
      externalJobFieldType === "select"
        ? parseOrderFieldOptions(externalJobFieldOptions)
        : undefined;
    const aiAliases = parseOrderFieldOptions(externalJobFieldAiAliases);
    const normalizedFieldRole =
      externalJobFieldType === "number" ? externalJobFieldRole : "none";
    if (editingExternalJobFieldId) {
      await updateExternalJobField(editingExternalJobFieldId, {
        label: trimmedLabel,
        fieldType: externalJobFieldType,
        scope: externalJobFieldScope,
        fieldRole: normalizedFieldRole,
        unit: externalJobFieldUnit.trim() || undefined,
        options,
        isRequired: externalJobFieldRequired,
        isActive: externalJobFieldActive,
        showInTable: externalJobFieldShowInTable,
        aiEnabled: externalJobFieldAiEnabled,
        aiMatchOnly: externalJobFieldAiEnabled && externalJobFieldAiMatchOnly,
        aiAliases,
        sortOrder: Number.isFinite(externalJobFieldSortOrder)
          ? externalJobFieldSortOrder
          : 0,
      });
      resetExternalJobFieldForm();
      return;
    }
    await addExternalJobField({
      key: slugify(trimmedLabel),
      label: trimmedLabel,
      fieldType: externalJobFieldType,
      scope: externalJobFieldScope,
      fieldRole: normalizedFieldRole,
      unit: externalJobFieldUnit.trim() || undefined,
      options,
      isRequired: externalJobFieldRequired,
      isActive: externalJobFieldActive,
      showInTable: externalJobFieldShowInTable,
      aiEnabled: externalJobFieldAiEnabled,
      aiMatchOnly: externalJobFieldAiEnabled && externalJobFieldAiMatchOnly,
      aiAliases,
      sortOrder: Number.isFinite(externalJobFieldSortOrder)
        ? externalJobFieldSortOrder
        : 0,
    });
    resetExternalJobFieldForm();
  }

  function handleEditOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    setEditingOrderFieldId(fieldId);
    setOrderFieldLabel(target.label);
    setOrderFieldKey(target.key);
    setOrderFieldGroup(target.groupKey);
    setOrderFieldType(target.fieldType);
    setOrderFieldUnit(target.unit ?? "");
    setOrderFieldOptions((target.options ?? []).join(", "));
    setOrderFieldColumns(
      target.columns?.map((column) => ({
        ...column,
        aiKey: column.aiKey ?? "",
        options: column.options ?? [],
        maxSelect: column.maxSelect ?? 1,
      })) ?? [],
    );
    setOrderFieldRequired(target.isRequired);
    setOrderFieldActive(target.isActive);
    setOrderFieldShowInProduction(target.showInProduction ?? false);
    setOrderFieldSortOrder(target.sortOrder);
  }

  function handleEditExternalJobField(fieldId: string) {
    const target = externalJobFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    setEditingExternalJobFieldId(fieldId);
    setExternalJobFieldLabel(target.label);
    setExternalJobFieldType(target.fieldType);
    setExternalJobFieldScope(target.scope ?? "manual");
    setExternalJobFieldRole(target.fieldRole ?? "none");
    setExternalJobFieldUnit(target.unit ?? "");
    setExternalJobFieldOptions((target.options ?? []).join(", "));
    setExternalJobFieldRequired(target.isRequired);
    setExternalJobFieldActive(target.isActive);
    setExternalJobFieldShowInTable(target.showInTable ?? true);
    setExternalJobFieldAiEnabled(target.aiEnabled ?? false);
    setExternalJobFieldAiMatchOnly(target.aiMatchOnly ?? false);
    setExternalJobFieldAiAliases((target.aiAliases ?? []).join(", "));
    setExternalJobFieldSortOrder(target.sortOrder);
  }

  async function handleDeleteOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    const label = target?.label ?? t("settings.orderInputs.label");
    if (
      !(await confirmRemove(
        t("settings.orderInputs.removeFieldConfirm", { label }),
      ))
    ) {
      return;
    }
    await removeOrderInputField(fieldId);
    setSelectedOrderFieldIds((prev) => prev.filter((id) => id !== fieldId));
  }

  async function handleDeleteSelectedOrderFields() {
    if (selectedOrderFieldIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.orderInputs.removeSelectedFieldsConfirm", {
          count: selectedOrderFieldIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedOrderFieldIds];
    for (const id of ids) {
      // Sequential deletes to keep UI feedback consistent.
      await removeOrderInputField(id);
    }
    setSelectedOrderFieldIds([]);
  }

  async function handleDeleteExternalJobField(fieldId: string) {
    const target = externalJobFields.find((field) => field.id === fieldId);
    const label = target?.label ?? t("settings.partners.externalFieldFallback");
    if (
      !(await confirmRemove(
        t("settings.partners.removeFieldConfirm", { label }),
      ))
    ) {
      return;
    }
    await removeExternalJobField(fieldId);
    setSelectedExternalJobFieldIds((prev) =>
      prev.filter((id) => id !== fieldId),
    );
  }

  async function handleDeleteSelectedExternalJobFields() {
    if (selectedExternalJobFieldIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.partners.removeSelectedFieldsConfirm", {
          count: selectedExternalJobFieldIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedExternalJobFieldIds];
    for (const id of ids) {
      await removeExternalJobField(id);
    }
    setSelectedExternalJobFieldIds([]);
  }

  async function persistStationOrder(nextStations: WorkStation[]) {
    setIsStationOrderSaving(true);
    await Promise.all(
      nextStations.map((station, index) =>
        updateWorkStation(station.id, { sortOrder: index }),
      ),
    );
    setIsStationOrderSaving(false);
  }

  function reorderExternalTableColumns(
    columns: ExternalTableColumnSetting[],
    draggedId: string,
    toIndex: number,
  ) {
    const fromIndex = columns.findIndex((column) => column.id === draggedId);
    if (fromIndex === -1) {
      return columns;
    }
    const next = [...columns];
    const [moved] = next.splice(fromIndex, 1);
    const safeIndex = Math.max(0, Math.min(toIndex, next.length));
    next.splice(safeIndex, 0, moved);
    return next;
  }

  const externalSchemaTableColumns = useMemo(
    () => [
      {
        id: "label",
        label: t("settings.orderInputs.label"),
        widthClassName: "min-w-25 md:min-w-35",
      },
      {
        id: "type",
        label: t("settings.orderInputs.type"),
        widthClassName: "min-w-27.5 md:min-w-0",
      },
      {
        id: "scope",
        label: t("settings.partners.scope"),
        widthClassName: "min-w-30 md:min-w-0",
      },
      {
        id: "role",
        label: t("settings.users.role"),
        widthClassName: "min-w-27.5 md:min-w-0",
      },
      {
        id: "unit",
        label: t("settings.orderInputs.unit"),
        widthClassName: "min-w-[64px] md:min-w-0",
      },
      {
        id: "order",
        label: t("settings.orderInputs.order"),
        widthClassName: "min-w-[64px] md:min-w-0",
      },
      {
        id: "required",
        label: t("settings.common.required"),
        widthClassName: "min-w-[84px] md:min-w-0",
      },
      {
        id: "active",
        label: t("settings.common.active"),
        widthClassName: "min-w-[72px] md:min-w-0",
      },
      {
        id: "in_table",
        label: t("settings.orderFields.inTable"),
        widthClassName: "min-w-[84px] md:min-w-0",
      },
      {
        id: "ai",
        label: "AI",
        widthClassName: "min-w-[60px] md:min-w-0",
      },
      {
        id: "match_only",
        label: t("settings.partners.matchOnly"),
        widthClassName: "min-w-[96px] md:min-w-0",
      },
      {
        id: "actions",
        label: (
          <div className="flex items-center justify-end gap-2">
            <span>{t("settings.common.actions")}</span>
            <Checkbox
              variant="box"
              checked={
                sortedExternalJobFields.length > 0 &&
                selectedExternalJobFieldIds.length ===
                  sortedExternalJobFields.length
              }
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedExternalJobFieldIds(
                    sortedExternalJobFields.map((field) => field.id),
                  );
                } else {
                  setSelectedExternalJobFieldIds([]);
                }
              }}
            />
          </div>
        ),
        widthClassName: "min-w-[250px] md:min-w-0",
        headerClassName: "text-right",
      },
    ],
    [selectedExternalJobFieldIds.length, sortedExternalJobFields, t],
  );
  const usersAccessColumns = useMemo(
    () => [
      {
        id: "name",
        label: t("settings.users.name"),
        widthClassName: "min-w-[160px] md:min-w-[220px]",
      },
      {
        id: "role",
        label: t("settings.users.role"),
        widthClassName: "min-w-[140px] md:min-w-[180px]",
      },
      {
        id: "owner",
        label: t("settings.users.owner"),
        widthClassName: "min-w-22.5 md:min-w-27.5",
      },
      {
        id: "admin",
        label: t("settings.users.admin"),
        widthClassName: "min-w-22.5 md:min-w-27.5",
      },
      {
        id: "actions",
        label: t("settings.common.actions"),
        widthClassName: "min-w-25 md:min-w-30",
        headerClassName: "text-right",
      },
    ],
    [t],
  );

  function reorderStations(
    stations: WorkStation[],
    draggedId: string,
    targetId: string,
  ) {
    const fromIndex = stations.findIndex((station) => station.id === draggedId);
    const toIndex = stations.findIndex((station) => station.id === targetId);
    if (fromIndex === -1 || toIndex === -1) {
      return stations;
    }
    const next = [...stations];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function handleStationDrop(targetId: string) {
    if (!dragStationId || dragStationId === targetId) {
      setDragStationId(null);
      return;
    }
    const nextStations = reorderStations(
      displayStations,
      dragStationId,
      targetId,
    );
    setLocalStations(nextStations);
    setDragStationId(null);
    void persistStationOrder(nextStations);
  }

  async function handleSaveStation() {
    const trimmedName = stationName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingStationId) {
      await updateWorkStation(editingStationId, {
        name: trimmedName,
        description: stationDescription.trim() || undefined,
        trackingMode: stationTrackingMode,
      });
      resetStationForm();
      return;
    }
    await addWorkStation({
      name: trimmedName,
      description: stationDescription.trim() || undefined,
      isActive: true,
      sortOrder: displayStations.length,
      trackingMode: stationTrackingMode,
    });
    resetStationForm();
  }

  function handleEditStation(stationId: string) {
    const station = workStations.find((item) => item.id === stationId);
    if (!station) {
      return;
    }
    setEditingStationId(stationId);
    setStationName(station.name);
    setStationDescription(station.description ?? "");
    setStationTrackingMode(station.trackingMode ?? "construction_level");
  }

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

  function resetPartnerForm() {
    setPartnerName("");
    setPartnerEmail("");
    setPartnerPhone("");
    setPartnerGroupId("");
    setEditingPartnerId(null);
  }

  async function handleSavePartner() {
    const trimmedName = partnerName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingPartnerId) {
      await updatePartner(editingPartnerId, {
        name: trimmedName,
        groupId: partnerGroupId || undefined,
        email: partnerEmail.trim() || undefined,
        phone: partnerPhone.trim() || undefined,
      });
      resetPartnerForm();
      return;
    }
    await addPartner({
      name: trimmedName,
      groupId: partnerGroupId || undefined,
      email: partnerEmail.trim() || undefined,
      phone: partnerPhone.trim() || undefined,
    });
    resetPartnerForm();
  }

  function handleEditPartner(partnerId: string) {
    const partner = partners.find((item) => item.id === partnerId);
    if (!partner) {
      return;
    }
    setEditingPartnerId(partnerId);
    setPartnerName(partner.name);
    setPartnerEmail(partner.email ?? "");
    setPartnerPhone(partner.phone ?? "");
    setPartnerGroupId(partner.groupId ?? "");
  }

  function resetPartnerGroupForm() {
    setPartnerGroupName("");
    setEditingPartnerGroupId(null);
  }

  async function handleSavePartnerGroup() {
    const trimmedName = partnerGroupName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingPartnerGroupId) {
      await updatePartnerGroup(editingPartnerGroupId, { name: trimmedName });
      resetPartnerGroupForm();
      return;
    }
    await addPartnerGroup(trimmedName);
    resetPartnerGroupForm();
  }

  function handleEditPartnerGroup(groupId: string) {
    const group = partnerGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    setEditingPartnerGroupId(groupId);
    setPartnerGroupName(group.name);
  }

  const [activeTab, setActiveTab] =
    useState<SettingsSectionValue>("orderFields");
  const [isMobileSectionsOpen, setIsMobileSectionsOpen] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const hideMobileFloatingControls = useHideMobileFloatingControls();

  useEffect(() => {
    const tab = searchParams?.get("tab");
    const normalizedTab = tab === "structure" ? "orderFields" : tab;
    if (
      normalizedTab &&
      settingsSections.some((section) => section.value === normalizedTab)
    ) {
      setActiveTab(normalizedTab as SettingsSectionValue);
    }
  }, [searchParams]);

  const setActiveSettingsTab = (nextTab: string) => {
    const validTab = settingsSections.find(
      (section) => section.value === nextTab,
    );
    if (validTab) {
      setActiveTab(validTab.value);
      const current = new URLSearchParams(searchParams?.toString() ?? "");
      current.set("tab", nextTab);
      router.replace(`${pathname ?? "/settings"}?${current.toString()}`, {
        scroll: false,
      });
    }
  };

  useEffect(() => {
    if (!isMobileSectionsOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSectionsOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileSectionsOpen]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= 768) {
        setShowCompactMobileTitle(false);
        return;
      }
      setShowCompactMobileTitle(window.scrollY > 110);
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const sectionLabel = (value: SettingsSectionValue) =>
    t(`settings.section.${value}`);
  const sectionSubtitle = (value: SettingsSectionValue) =>
    t(`settings.sectionSubtitle.${value}`);

  const activeSectionValue = (settingsSections.find(
    (section) => section.value === activeTab,
  )?.value ?? "orderFields") as SettingsSectionValue;

  const activeSectionLabel = sectionLabel(activeSectionValue);
  const activeSectionSubtitle = sectionSubtitle(activeSectionValue);

  return (
    <section className="space-y-0 pt-16 md:space-y-4 md:pt-0">
      <div
        className={`fixed bottom-[calc(6.75rem+env(safe-area-inset-bottom))] right-4 z-40 transition-all duration-200 md:hidden ${
          hideMobileFloatingControls
            ? "translate-y-16 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg"
          onClick={() => setIsMobileSectionsOpen(true)}
          aria-label={t("settings.openSections")}
          aria-haspopup="dialog"
          aria-expanded={isMobileSectionsOpen}
          aria-controls="settings-sections-drawer"
        >
          <PanelRightIcon className="h-4 w-4" />
        </Button>
      </div>
      <MobilePageTitle
        title={activeSectionLabel}
        showCompact={showCompactMobileTitle}
        subtitle={activeSectionSubtitle}
        className="pt-6 pb-6"
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveSettingsTab}
        className="space-y-0 md:space-y-4"
      >
        <DesktopPageHeader
          sticky
          title={activeSectionLabel}
          subtitle={activeSectionSubtitle}
          className="md:z-20"
          actions={
            <DetailTabsBar
              tabs={settingsSections.map((section) => ({
                value: section.value,
                label: sectionLabel(section.value),
                icon: section.icon,
              }))}
              className="py-0"
            />
          }
        />

        {
          <>
            <BottomSheet
              id="settings-sections-drawer"
              open={isMobileSectionsOpen}
              onClose={() => setIsMobileSectionsOpen(false)}
              ariaLabel={t("settings.sections")}
              closeButtonLabel={t("settings.closeSections")}
              title={t("settings.sections")}
              enableSwipeToClose
            >
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-1">
                  {settingsSections.map((section) => {
                    const isActive = activeTab === section.value;
                    return (
                      <button
                        key={section.value}
                        type="button"
                        onClick={() => {
                          setActiveSettingsTab(section.value);
                          setIsMobileSectionsOpen(false);
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-muted/60"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <section.icon className="h-4 w-4" />
                          {sectionLabel(section.value)}
                        </span>
                        {isActive ? (
                          <span className="text-xs">
                            {t("settings.active")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </BottomSheet>
          </>
        }

        <TabsContent value="orderFields">
          <div className="space-y-6">
            {isSettingsDataLoading ? (
              <Card className="min-w-0">
                <CardContent className="py-10">
                  <LoadingSpinner label={t("settings.loadingOrderFields")} />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.orderFields.title")}</CardTitle>
                <CardDescription>
                  {t("settings.orderFields.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.2fr)_minmax(280px,1fr)_auto] lg:items-end">
                  <InputField
                    label={t("settings.orderFields.fieldLabel")}
                    value={fieldName}
                    onChange={(event) => {
                      setFieldName(event.target.value);
                    }}
                    placeholder={t(
                      "settings.orderFields.fieldLabelPlaceholder",
                    )}
                    className="h-10 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <Checkbox
                      checked={fieldRequired}
                      onChange={(event) =>
                        setFieldRequired(event.target.checked)
                      }
                      label={t("settings.common.required")}
                    />
                    <Checkbox
                      checked={fieldActive}
                      onChange={(event) => setFieldActive(event.target.checked)}
                      label={t("settings.common.active")}
                    />
                    <Checkbox
                      checked={fieldShowInTable}
                      onChange={(event) =>
                        setFieldShowInTable(event.target.checked)
                      }
                      label={t("settings.orderFields.showInTable")}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveField}>
                      {t("settings.orderFields.addField")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.orderFields.defaultMeaningHint")}
                </p>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-190 w-full table-auto text-sm [&_th]:whitespace-normal [&_th]:wrap-break-word [&_td]:whitespace-normal [&_td]:wrap-break-word [&_td]:align-top [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-xs [&_td]:text-sm md:[&_th]:px-4 md:[&_td]:px-4">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="w-12 px-2 py-2 text-left font-medium">
                          <span className="sr-only">Drag</span>
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderFields.field")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderFields.displayOrder")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.common.required")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.common.active")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderFields.inTable")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          {t("settings.common.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFields.map((field, rowIndex) => {
                        const isInlineEditing =
                          inlineEditingFieldId === field.id;
                        return (
                          <Fragment key={field.id}>
                            <tr
                              className={`border-t border-border transition-all ${
                                fieldDropIndex === rowIndex && draggedFieldId
                                  ? "h-4 bg-primary/10"
                                  : "h-0"
                              }`}
                            />
                            <tr
                              className={`border-t border-border ${
                                draggedFieldId === field.id
                                  ? "bg-primary/5"
                                  : "bg-background"
                              }`}
                              draggable={!isInlineEditing}
                              onDragStart={() => {
                                setDraggedFieldId(field.id);
                                setFieldDropIndex(rowIndex);
                              }}
                              onDragOver={(event) => {
                                if (!draggedFieldId) {
                                  return;
                                }
                                event.preventDefault();
                                const rect =
                                  event.currentTarget.getBoundingClientRect();
                                const before =
                                  event.clientY < rect.top + rect.height / 2;
                                setFieldDropIndex(
                                  before ? rowIndex : rowIndex + 1,
                                );
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                void handleDropField();
                              }}
                              onDragEnd={() => {
                                setDraggedFieldId(null);
                                setFieldDropIndex(null);
                              }}
                            >
                              <td className="px-2 py-2 align-middle text-muted-foreground">
                                <span
                                  className="cursor-grab select-none"
                                  aria-hidden
                                >
                                  ::
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                {isInlineEditing ? (
                                  <Input
                                    value={inlineFieldName}
                                    onChange={(event) =>
                                      setInlineFieldName(event.target.value)
                                    }
                                    className="h-9 text-sm"
                                  />
                                ) : (
                                  <div className="font-medium">
                                    {field.name}
                                    {lockedFieldKeys.has(field.key) && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {t("settings.common.default")}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {lockedFieldKeys.has(field.key) &&
                                  defaultFieldDescriptions[field.key] && (
                                    <div className="text-xs text-muted-foreground">
                                      {defaultFieldDescriptions[field.key]}
                                    </div>
                                  )}
                              </td>
                              <td className="px-4 py-2">{field.order}</td>
                              <td className="px-4 py-2">
                                <Checkbox
                                  checked={field.isRequired}
                                  onChange={(event) =>
                                    updateOrderField(field.id, {
                                      isRequired: event.target.checked,
                                    })
                                  }
                                  label={
                                    field.isRequired
                                      ? t("settings.common.yes")
                                      : t("settings.common.no")
                                  }
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Checkbox
                                  checked={field.isActive}
                                  onChange={(event) =>
                                    updateOrderField(field.id, {
                                      isActive: event.target.checked,
                                    })
                                  }
                                  label={
                                    field.isActive
                                      ? t("settings.common.active")
                                      : t("settings.common.hidden")
                                  }
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Checkbox
                                  checked={field.showInTable}
                                  onChange={(event) =>
                                    updateOrderField(field.id, {
                                      showInTable: event.target.checked,
                                    })
                                  }
                                  label={
                                    field.showInTable
                                      ? t("settings.common.shown")
                                      : t("settings.common.hidden")
                                  }
                                />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex justify-end gap-2">
                                  {isInlineEditing ? (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          void handleSaveInlineField()
                                        }
                                        disabled={!inlineFieldName.trim()}
                                      >
                                        {t("settings.orderFields.saveField")}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={cancelInlineFieldEdit}
                                      >
                                        {t("settings.common.cancel")}
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          startInlineFieldEdit(field.id)
                                        }
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          if (
                                            !(await confirmRemove(
                                              t(
                                                "settings.orderFields.removeFieldConfirm",
                                                {
                                                  name: field.name,
                                                },
                                              ),
                                            ))
                                          ) {
                                            return;
                                          }
                                          removeOrderField(field.id);
                                        }}
                                        disabled={lockedFieldKeys.has(
                                          field.key,
                                        )}
                                      >
                                        <Trash2Icon className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                      <tr
                        className={`border-t border-border transition-all ${
                          fieldDropIndex === sortedFields.length &&
                          draggedFieldId
                            ? "h-4 bg-primary/10"
                            : "h-0"
                        }`}
                      />
                      {sortedFields.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            {t("settings.orderFields.addFirstField")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.orderInputs.title")}</CardTitle>
                <CardDescription>
                  {t("settings.orderInputs.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderInputFields.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {t("settings.orderInputs.empty")}
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={ensureDefaultOrderInputFields}
                      >
                        {t("settings.orderInputs.addDefaultFields")}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-[minmax(200px,1.2fr)_minmax(160px,0.6fr)_minmax(160px,0.6fr)_minmax(120px,0.4fr)_auto] lg:items-end">
                  <InputField
                    label={t("settings.orderInputs.label")}
                    value={orderFieldLabel}
                    onChange={(event) => setOrderFieldLabel(event.target.value)}
                    placeholder={t("settings.orderInputs.labelPlaceholder")}
                    className="h-10 text-sm"
                  />
                  <SelectField
                    label={t("settings.orderInputs.group")}
                    value={orderFieldGroup}
                    onValueChange={(value) =>
                      setOrderFieldGroup(value as OrderInputGroupKey)
                    }
                  >
                    <Select
                      value={orderFieldGroup}
                      onValueChange={(value) =>
                        setOrderFieldGroup(value as OrderInputGroupKey)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderInputGroupOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {optionLabel(
                              "orderInputGroup",
                              option.value,
                              option.label,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <SelectField
                    label={t("settings.orderInputs.type")}
                    value={orderFieldType}
                    onValueChange={(value) =>
                      setOrderFieldType(value as OrderInputFieldType)
                    }
                  >
                    <Select
                      value={orderFieldType}
                      onValueChange={(value) =>
                        setOrderFieldType(value as OrderInputFieldType)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderInputFieldTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {optionLabel(
                              "orderInputFieldType",
                              option.value,
                              option.label,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <InputField
                    label={t("settings.orderInputs.order")}
                    type="number"
                    value={orderFieldSortOrder}
                    onChange={(event) =>
                      setOrderFieldSortOrder(Number(event.target.value) || 0)
                    }
                    className="h-10 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveOrderField}>
                      {editingOrderFieldId
                        ? t("settings.orderInputs.saveField")
                        : t("settings.orderInputs.addField")}
                    </Button>
                    {editingOrderFieldId && (
                      <Button variant="outline" onClick={resetOrderFieldForm}>
                        {t("settings.common.cancel")}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <InputField
                    label={t("settings.orderInputs.unitOptional")}
                    value={orderFieldUnit}
                    onChange={(event) => setOrderFieldUnit(event.target.value)}
                    placeholder="pcs"
                    className="h-10 text-sm"
                  />
                  <TextAreaField
                    label={t("settings.orderInputs.selectOptions")}
                    value={orderFieldOptions}
                    onChange={(event) =>
                      setOrderFieldOptions(event.target.value)
                    }
                    disabled={orderFieldType !== "select"}
                    placeholder={t(
                      "settings.orderInputs.selectOptionsPlaceholder",
                    )}
                    className="min-h-20 disabled:opacity-50"
                  />
                </div>

                {orderFieldType === "table" && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {t("settings.orderInputs.tableColumns")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("settings.orderInputs.dragRows")}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addOrderFieldColumn}
                      >
                        {t("settings.orderInputs.addColumn")}
                      </Button>
                    </div>
                    {orderFieldColumns.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t("settings.orderInputs.addAtLeastOneColumn")}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {orderFieldColumns.map((column, index) => (
                          <div
                            key={index}
                            className={`group space-y-2 rounded-md border px-2 py-2 transition-colors ${
                              dragOverColumnIndex === index
                                ? "border-primary/50 bg-primary/5"
                                : "border-border hover:border-primary/40"
                            }`}
                            draggable
                            onDragStart={() => {
                              setDragColumnIndex(index);
                              setDragOverColumnIndex(index);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragOverColumnIndex(index);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (dragColumnIndex === null) {
                                return;
                              }
                              reorderOrderFieldColumns(dragColumnIndex, index);
                              setDragColumnIndex(null);
                              setDragOverColumnIndex(null);
                            }}
                            onDragEnd={() => {
                              setDragColumnIndex(null);
                              setDragOverColumnIndex(null);
                            }}
                          >
                            <div className="grid gap-2 md:grid-cols-[24px_1.4fr_1fr_0.9fr_0.7fr_0.5fr_auto] md:items-end">
                              <div
                                className="mb-2 select-none text-center text-xs text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 md:mb-0 md:cursor-grab"
                                title={t("settings.orderInputs.dragToReorder")}
                              >
                                ||
                              </div>
                              <InputField
                                label={t("settings.orderInputs.label")}
                                value={column.label}
                                onChange={(event) =>
                                  updateOrderFieldColumn(index, {
                                    label: event.target.value,
                                  })
                                }
                                placeholder={t(
                                  "settings.orderInputs.positionPlaceholder",
                                )}
                                className="h-9 text-sm"
                                labelClassName="text-xs font-medium"
                              />
                              <InputField
                                label={t("settings.orderInputs.aiKeyOptional")}
                                value={column.aiKey ?? ""}
                                onChange={(event) =>
                                  updateOrderFieldColumn(index, {
                                    aiKey: event.target.value,
                                  })
                                }
                                placeholder={t(
                                  "settings.orderInputs.aiKeyPlaceholder",
                                )}
                                className="h-9 text-sm"
                                labelClassName="text-xs font-medium"
                              />
                              <SelectField
                                label={t("settings.orderInputs.type")}
                                value={column.fieldType}
                                onValueChange={(value) =>
                                  updateOrderFieldColumn(index, {
                                    fieldType:
                                      value as OrderInputTableColumnType,
                                  })
                                }
                                labelClassName="text-xs font-medium"
                                className="space-y-1"
                              >
                                <Select
                                  value={column.fieldType}
                                  onValueChange={(value) =>
                                    updateOrderFieldColumn(index, {
                                      fieldType:
                                        value as OrderInputTableColumnType,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9 w-full rounded-md text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {orderInputColumnTypeOptions.map(
                                      (option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {optionLabel(
                                            "orderInputColumnType",
                                            option.value,
                                            option.label,
                                          )}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </SelectField>
                              <InputField
                                label={t("settings.orderInputs.unit")}
                                value={column.unit ?? ""}
                                onChange={(event) =>
                                  updateOrderFieldColumn(index, {
                                    unit: event.target.value,
                                  })
                                }
                                placeholder="mm"
                                className="h-9 text-sm"
                                labelClassName="text-xs font-medium"
                              />
                              <div className="space-y-1">
                                <div className="text-xs font-medium">
                                  {t("settings.common.required")}
                                </div>
                                <Checkbox
                                  checked={column.isRequired ?? false}
                                  onChange={(event) =>
                                    updateOrderFieldColumn(index, {
                                      isRequired: event.target.checked,
                                    })
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (
                                      !(await confirmRemove(
                                        t(
                                          "settings.orderInputs.removeColumnConfirm",
                                        ),
                                      ))
                                    ) {
                                      return;
                                    }
                                    removeOrderFieldColumn(index);
                                  }}
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            {column.fieldType === "select" && (
                              <div className="grid gap-2 md:grid-cols-[1fr_160px] md:items-end">
                                <TextAreaField
                                  label={t("settings.orderInputs.options")}
                                  value={(column.options ?? []).join("\n")}
                                  onChange={(event) =>
                                    updateOrderFieldColumn(index, {
                                      options: parseOrderFieldOptions(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                  placeholder={t(
                                    "settings.orderInputs.optionsPlaceholder",
                                  )}
                                  className="min-h-17.5 rounded-md px-2 py-2 text-sm"
                                  labelClassName="text-xs font-medium"
                                />
                                <label className="flex flex-col gap-1 text-xs font-medium">
                                  {t("settings.orderInputs.maxSelects")}
                                  <Input
                                    type="number"
                                    min={1}
                                    max={3}
                                    value={column.maxSelect ?? 1}
                                    onChange={(event) =>
                                      updateOrderFieldColumn(index, {
                                        maxSelect:
                                          Number(event.target.value) || 1,
                                      })
                                    }
                                    className="h-9 rounded-md bg-input-background px-2 text-sm"
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Checkbox
                    checked={orderFieldRequired}
                    onChange={(event) =>
                      setOrderFieldRequired(event.target.checked)
                    }
                    label={t("settings.common.required")}
                  />
                  <Checkbox
                    checked={orderFieldActive}
                    onChange={(event) =>
                      setOrderFieldActive(event.target.checked)
                    }
                    label={t("settings.common.active")}
                  />
                  <Checkbox
                    checked={orderFieldShowInProduction}
                    onChange={(event) =>
                      setOrderFieldShowInProduction(event.target.checked)
                    }
                    label={t("settings.orderInputs.showInProduction")}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {selectedOrderFieldIds.length > 0
                      ? t("settings.common.selectedCount", {
                          count: selectedOrderFieldIds.length,
                        })
                      : " "}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteSelectedOrderFields}
                    disabled={selectedOrderFieldIds.length === 0}
                  >
                    {t("settings.common.removeSelected")}
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-190 w-full table-fixed text-sm [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:wrap-break-word [&_td]:align-top">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderInputs.label")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderInputs.group")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderInputs.type")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderInputs.order")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.common.required")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.common.active")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("settings.orderInputs.production")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <span>{t("settings.common.actions")}</span>
                            <Checkbox
                              variant="box"
                              checked={
                                sortedOrderInputFields.length > 0 &&
                                selectedOrderFieldIds.length ===
                                  sortedOrderInputFields.length
                              }
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedOrderFieldIds(
                                    sortedOrderInputFields.map(
                                      (field) => field.id,
                                    ),
                                  );
                                } else {
                                  setSelectedOrderFieldIds([]);
                                }
                              }}
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOrderInputFields.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            {t("settings.orderInputs.noOrderInputs")}
                          </td>
                        </tr>
                      ) : (
                        sortedOrderInputFields.map((field) => (
                          <tr key={field.id} className="border-t border-border">
                            <td className="px-4 py-2">
                              <div className="font-medium">{field.label}</div>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {orderInputGroupOptions.find(
                                (option) => option.value === field.groupKey,
                              )?.label ?? field.groupKey}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {orderInputFieldTypeOptions.find(
                                (option) => option.value === field.fieldType,
                              )?.label ?? field.fieldType}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.sortOrder}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.isRequired
                                ? t("settings.common.yes")
                                : t("settings.common.no")}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.isActive
                                ? t("settings.common.yes")
                                : t("settings.common.no")}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.showInProduction
                                ? t("settings.common.yes")
                                : t("settings.common.no")}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditOrderField(field.id)}
                                >
                                  <PencilIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCopyOrderField(field.id)}
                                >
                                  <CopyIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleDeleteOrderField(field.id)
                                  }
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                                <Checkbox
                                  variant="box"
                                  checked={selectedOrderFieldIds.includes(
                                    field.id,
                                  )}
                                  onChange={(event) => {
                                    setSelectedOrderFieldIds((prev) => {
                                      if (event.target.checked) {
                                        return [...prev, field.id];
                                      }
                                      return prev.filter(
                                        (id) => id !== field.id,
                                      );
                                    });
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="min-w-0">
          <div className="min-w-0 space-y-6">
            {isSettingsDataLoading || isTenantSettingsLoading ? (
              <Card>
                <CardContent className="py-10">
                  <LoadingSpinner label={t("settings.operations.loading")} />
                </CardContent>
              </Card>
            ) : null}
            <div className="grid min-w-0 gap-6 lg:grid-cols-2 *:min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("settings.operations.workingHoursTitle")}
                  </CardTitle>
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
                          {optionLabel(
                            "weekday",
                            String(option.value),
                            option.label,
                          )}
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
                            handleWorkShiftChange(
                              index,
                              "start",
                              event.target.value,
                            )
                          }
                          placeholder="08:00"
                          className={`h-10 w-full text-sm ${
                            isValidWorkTime(shift.start)
                              ? ""
                              : "border-destructive"
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
                            handleWorkShiftChange(
                              index,
                              "end",
                              event.target.value,
                            )
                          }
                          placeholder="17:00"
                          className={`h-10 w-full text-sm ${
                            isValidWorkTime(shift.end)
                              ? ""
                              : "border-destructive"
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
                    <div className="text-xs text-destructive">
                      {workdayError}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSaveWorkHours}
                      disabled={isWorkdaySaving}
                    >
                      {isWorkdaySaving
                        ? t("settings.users.saving")
                        : t("settings.operations.saveHours")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("settings.operations.workStationsTitle")}
                  </CardTitle>
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
                      placeholder={t(
                        "settings.operations.stationNamePlaceholder",
                      )}
                      className="h-10 text-sm"
                    />
                    <InputField
                      label={t("settings.operations.description")}
                      value={stationDescription}
                      onChange={(event) =>
                        setStationDescription(event.target.value)
                      }
                      placeholder={t(
                        "settings.operations.descriptionPlaceholder",
                      )}
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
                      <Button onClick={handleSaveStation}>
                        {editingStationId
                          ? t("settings.operations.saveStation")
                          : t("settings.operations.addStation")}
                      </Button>
                      {editingStationId && (
                        <Button variant="outline" onClick={resetStationForm}>
                          {t("settings.common.cancel")}
                        </Button>
                      )}
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
                            selectedWorkStationIds.length ===
                              displayStations.length
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
                        onClick={handleDeleteSelectedWorkStations}
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
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
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
                              onClick={() => handleCopyWorkStation(station.id)}
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
                                      {
                                        name: station.name,
                                      },
                                    ),
                                  ))
                                ) {
                                  return;
                                }
                                removeWorkStation(station.id);
                              }}
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                            <Checkbox
                              variant="box"
                              checked={selectedWorkStationIds.includes(
                                station.id,
                              )}
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

              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.operations.qrLabelTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.operations.qrLabelDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        {t("settings.operations.labelSizes")}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        {qrLabelSizeOptions.map((option) => {
                          const checked = qrEnabledSizes.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                            >
                              <Checkbox
                                checked={checked}
                                onChange={(event) => {
                                  setQrEnabledSizes((prev) => {
                                    if (event.target.checked) {
                                      return [...prev, option.value];
                                    }
                                    return prev.filter(
                                      (value) => value !== option.value,
                                    );
                                  });
                                }}
                              />
                              {optionLabel(
                                "qrSize",
                                option.value,
                                option.label,
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        {t("settings.operations.defaultSize")}
                      </div>
                      <Select
                        value={qrDefaultSize}
                        onValueChange={setQrDefaultSize}
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {qrLabelSizeOptions
                            .filter((option) =>
                              qrEnabledSizes.includes(option.value),
                            )
                            .map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {optionLabel(
                                  "qrContentField",
                                  option.value,
                                  option.label,
                                )}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        {t("settings.operations.defaultPrintHint")}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {t("settings.operations.contentFields")}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {qrContentFieldOptions.map((option) => {
                        const checked = qrContentFields.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                          >
                            <Checkbox
                              checked={checked}
                              onChange={(event) => {
                                setQrContentFields((prev) => {
                                  if (event.target.checked) {
                                    return [...prev, option.value];
                                  }
                                  return prev.filter(
                                    (value) => value !== option.value,
                                  );
                                });
                              }}
                            />
                            {(
                              rules.orderStatusConfig as Record<
                                string,
                                { label?: string }
                              >
                            )[option.value]?.label ??
                              optionLabel(
                                "qrContentField",
                                option.value,
                                option.label,
                              )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSaveQrSettings}
                      disabled={qrSettingsState === "saving"}
                    >
                      {qrSettingsState === "saving"
                        ? t("settings.users.saving")
                        : t("settings.operations.saveQrSettings")}
                    </Button>
                    {qrSettingsState !== "idle" && qrSettingsMessage ? (
                      <span
                        className={`text-xs ${
                          qrSettingsState === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {qrSettingsMessage}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("settings.operations.notificationsTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("settings.operations.notificationsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {[
                      "Production planner",
                      "Admin",
                      "Owner",
                      "Warehouse",
                      "Engineering",
                      "Sales",
                    ].map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <Checkbox
                          checked={notificationRoles.includes(role)}
                          onChange={(event) => {
                            setNotificationRoles((prev) => {
                              if (event.target.checked) {
                                return [...new Set([...prev, role])];
                              }
                              return prev.filter((item) => item !== role);
                            });
                          }}
                        />
                        {role === "Owner" ? role : formatUserRoleLabel(role)}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSaveNotificationRoles}
                      disabled={notificationState === "saving"}
                    >
                      {notificationState === "saving"
                        ? t("settings.users.saving")
                        : t("settings.operations.saveNotificationRoles")}
                    </Button>
                    {notificationState !== "idle" && notificationMessage ? (
                      <span
                        className={`text-xs ${
                          notificationState === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {notificationMessage}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

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
                          stationDependenciesByStation.get(station.id) ??
                          new Set<string>();
                        const available = displayStations.filter(
                          (other) => other.id !== station.id,
                        );
                        return (
                          <div
                            key={station.id}
                            className="rounded-lg border border-border px-4 py-3"
                          >
                            <div className="text-sm font-medium">
                              {station.name}
                            </div>
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
                                          updateStationDependencies(
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
                  {operatorAssignmentsError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                      {operatorAssignmentsError}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-190 w-full text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left">
                            {t("settings.operations.user")}
                          </th>
                          {displayStations.map((station) => (
                            <th
                              key={station.id}
                              className="px-4 py-2 text-left"
                            >
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
                                label={t(
                                  "settings.operations.loadingAssignments",
                                )}
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
                            <tr
                              key={user.id}
                              className="border-t border-border"
                            >
                              <td className="px-4 py-2 font-medium">
                                {user.name}
                                <div className="text-xs text-muted-foreground">
                                  {user.role}
                                </div>
                              </td>
                              {displayStations.map((station) => {
                                const key = `${user.id}:${station.id}`;
                                const isAssigned =
                                  operatorAssignmentsByKey.has(key);
                                return (
                                  <td key={station.id} className="px-4 py-2">
                                    <label className="flex items-center gap-2">
                                      <Checkbox
                                        checked={isAssigned}
                                        onChange={() =>
                                          handleToggleOperatorAssignment(
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
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("settings.operations.stopReasonsTitle")}
                </CardTitle>
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
                    <Button onClick={handleSaveStopReason}>
                      {editingStopReasonId
                        ? t("settings.operations.saveReason")
                        : t("settings.operations.addReason")}
                    </Button>
                    {editingStopReasonId && (
                      <Button variant="outline" onClick={resetStopReasonForm}>
                        {t("settings.common.cancel")}
                      </Button>
                    )}
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
                        onClick={handleDeleteSelectedStopReasons}
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
                          onClick={() => handleCopyStopReason(reason.id)}
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
                            removeStopReason(reason.id);
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
          </div>
        </TabsContent>

        <TabsContent value="partners">
          <div className="space-y-6">
            {isSettingsDataLoading ? (
              <Card className="min-w-0">
                <CardContent className="py-10">
                  <LoadingSpinner label={t("settings.partners.loading")} />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.partners.title")}</CardTitle>
                <CardDescription>
                  {t("settings.partners.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 space-y-4">
                <div className="border-t border-border pt-4 pb-8">
                  <div className="text-sm font-medium">
                    {t("settings.partners.partnerGroups")}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                    <InputField
                      label={t("settings.partners.groupName")}
                      value={partnerGroupName}
                      onChange={(event) =>
                        setPartnerGroupName(event.target.value)
                      }
                      placeholder={t("settings.partners.groupNamePlaceholder")}
                      className="h-10 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleSavePartnerGroup}>
                        {editingPartnerGroupId
                          ? t("settings.partners.saveGroup")
                          : t("settings.partners.addGroup")}
                      </Button>
                      {editingPartnerGroupId && (
                        <Button
                          variant="outline"
                          onClick={resetPartnerGroupForm}
                        >
                          {t("settings.common.cancel")}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-muted-foreground">
                        {selectedPartnerGroupIds.length > 0
                          ? t("settings.common.selectedCount", {
                              count: selectedPartnerGroupIds.length,
                            })
                          : " "}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox
                            variant="box"
                            checked={
                              partnerGroups.length > 0 &&
                              selectedPartnerGroupIds.length ===
                                partnerGroups.length
                            }
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedPartnerGroupIds(
                                  partnerGroups.map((group) => group.id),
                                );
                              } else {
                                setSelectedPartnerGroupIds([]);
                              }
                            }}
                            disabled={partnerGroups.length === 0}
                          />
                          {t("settings.operations.selectAll")}
                        </label>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDeleteSelectedPartnerGroups}
                          disabled={selectedPartnerGroupIds.length === 0}
                        >
                          {t("settings.common.removeSelected")}
                        </Button>
                      </div>
                    </div>
                    {partnerGroups.map((group) => (
                      <div
                        key={group.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                      >
                        <div className="font-medium">{group.name}</div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={group.isActive}
                              onChange={(event) =>
                                updatePartnerGroup(group.id, {
                                  isActive: event.target.checked,
                                })
                              }
                            />
                            {t("settings.common.active")}
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditPartnerGroup(group.id)}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyPartnerGroup(group.id)}
                          >
                            <CopyIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (
                                !(await confirmRemove(
                                  t("settings.partners.removeGroupConfirm", {
                                    name: group.name,
                                  }),
                                ))
                              ) {
                                return;
                              }
                              removePartnerGroup(group.id);
                            }}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                          <Checkbox
                            variant="box"
                            checked={selectedPartnerGroupIds.includes(group.id)}
                            onChange={(event) => {
                              setSelectedPartnerGroupIds((prev) => {
                                if (event.target.checked) {
                                  return [...prev, group.id];
                                }
                                return prev.filter((id) => id !== group.id);
                              });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {partnerGroups.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        {t("settings.partners.noPartnerGroups")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border pt-4 grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_auto] lg:items-end">
                  <InputField
                    label={t("settings.partners.partnerName")}
                    value={partnerName}
                    onChange={(event) => setPartnerName(event.target.value)}
                    placeholder={t("settings.partners.partnerNamePlaceholder")}
                    className="h-10 text-sm"
                  />
                  <InputField
                    label="Email"
                    type="email"
                    value={partnerEmail}
                    onChange={(event) => setPartnerEmail(event.target.value)}
                    placeholder="partner@company.com"
                    className="h-10 text-sm"
                  />
                  <InputField
                    label={t("profile.phone")}
                    value={partnerPhone}
                    onChange={(event) => setPartnerPhone(event.target.value)}
                    placeholder="+371 2xxxxxxx"
                    className="h-10 text-sm"
                  />
                  <SelectField
                    label={t("settings.partners.group")}
                    value={partnerGroupId || "__none__"}
                    onValueChange={(value) =>
                      setPartnerGroupId(value === "__none__" ? "" : value)
                    }
                  >
                    <Select
                      value={partnerGroupId || "__none__"}
                      onValueChange={(value) =>
                        setPartnerGroupId(value === "__none__" ? "" : value)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t("settings.partners.noGroup")}
                        </SelectItem>
                        {partnerGroups
                          .filter((group) => group.isActive)
                          .map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <div className="flex gap-2">
                    <Button onClick={handleSavePartner}>
                      {editingPartnerId
                        ? t("settings.partners.savePartner")
                        : t("settings.partners.addPartner")}
                    </Button>
                    {editingPartnerId && (
                      <Button variant="outline" onClick={resetPartnerForm}>
                        {t("settings.common.cancel")}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground">
                      {selectedPartnerIds.length > 0
                        ? t("settings.common.selectedCount", {
                            count: selectedPartnerIds.length,
                          })
                        : " "}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          variant="box"
                          checked={
                            partners.length > 0 &&
                            selectedPartnerIds.length === partners.length
                          }
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedPartnerIds(
                                partners.map((partner) => partner.id),
                              );
                            } else {
                              setSelectedPartnerIds([]);
                            }
                          }}
                          disabled={partners.length === 0}
                        />
                        {t("settings.operations.selectAll")}
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDeleteSelectedPartners}
                        disabled={selectedPartnerIds.length === 0}
                      >
                        {t("settings.common.removeSelected")}
                      </Button>
                    </div>
                  </div>
                  {partners.map((partner) => (
                    <div
                      key={partner.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div>
                        <div className="font-medium">{partner.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {partner.groupId
                            ? (partnerGroups.find(
                                (group) => group.id === partner.groupId,
                              )?.name ?? t("settings.partners.group"))
                            : t("settings.partners.noGroup")}
                        </div>
                        {(partner.email || partner.phone) && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {partner.email ? `Email: ${partner.email}` : ""}
                            {partner.email && partner.phone ? " | " : ""}
                            {partner.phone ? `Phone: ${partner.phone}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={partner.isActive}
                            onChange={(event) =>
                              updatePartner(partner.id, {
                                isActive: event.target.checked,
                              })
                            }
                          />
                          {t("settings.common.active")}
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPartner(partner.id)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyPartner(partner.id)}
                        >
                          <CopyIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (
                              !(await confirmRemove(
                                t("settings.partners.removePartnerConfirm", {
                                  name: partner.name,
                                }),
                              ))
                            ) {
                              return;
                            }
                            removePartner(partner.id);
                          }}
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                        <Checkbox
                          variant="box"
                          checked={selectedPartnerIds.includes(partner.id)}
                          onChange={(event) => {
                            setSelectedPartnerIds((prev) => {
                              if (event.target.checked) {
                                return [...prev, partner.id];
                              }
                              return prev.filter((id) => id !== partner.id);
                            });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {partners.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      {t("settings.partners.noPartners")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("settings.partners.externalSchemaTitle")}
                </CardTitle>
                <CardDescription>
                  {t("settings.partners.externalSchemaDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {externalJobFields.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {t("settings.partners.noExternalFields")}
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  {t("settings.partners.externalFieldsHint")}
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={externalPricingEnabled}
                        onChange={(event) =>
                          setExternalPricingEnabled(event.target.checked)
                        }
                      />
                      {t("settings.partners.enablePriceReconciliation")}
                    </label>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveExternalPricingSettings}
                        disabled={externalPricingState === "saving"}
                      >
                        {externalPricingState === "saving"
                          ? t("settings.users.saving")
                          : t("settings.partners.savePricing")}
                      </Button>
                      {externalPricingState !== "idle" &&
                      externalPricingMessage ? (
                        <span
                          className={`text-xs ${
                            externalPricingState === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {externalPricingMessage}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(140px,0.6fr)_minmax(190px,0.7fr)_minmax(190px,0.7fr)_minmax(120px,0.4fr)_auto] lg:items-end">
                  <InputField
                    label="Label"
                    value={externalJobFieldLabel}
                    onChange={(event) =>
                      setExternalJobFieldLabel(event.target.value)
                    }
                    placeholder="Unit price"
                    className="h-10 text-sm"
                  />
                  <SelectField
                    label="Type"
                    value={externalJobFieldType}
                    onValueChange={(value) => {
                      const nextType = value as ExternalJobFieldType;
                      setExternalJobFieldType(nextType);
                      if (nextType !== "number") {
                        setExternalJobFieldRole("none");
                      }
                    }}
                  >
                    <Select
                      value={externalJobFieldType}
                      onValueChange={(value) => {
                        const nextType = value as ExternalJobFieldType;
                        setExternalJobFieldType(nextType);
                        if (nextType !== "number") {
                          setExternalJobFieldRole("none");
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {externalJobFieldTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {optionLabel(
                              "externalFieldType",
                              option.value,
                              option.label,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <SelectField
                    label="Scope"
                    value={externalJobFieldScope}
                    onValueChange={(value) =>
                      setExternalJobFieldScope(value as ExternalJobFieldScope)
                    }
                  >
                    <Select
                      value={externalJobFieldScope}
                      onValueChange={(value) =>
                        setExternalJobFieldScope(value as ExternalJobFieldScope)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {externalJobFieldScopeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {optionLabel(
                              "externalFieldScope",
                              option.value,
                              option.label,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <SelectField
                    label="Role"
                    value={externalJobFieldRole}
                    onValueChange={(value) =>
                      setExternalJobFieldRole(value as ExternalJobFieldRole)
                    }
                  >
                    <Select
                      value={externalJobFieldRole}
                      onValueChange={(value) =>
                        setExternalJobFieldRole(value as ExternalJobFieldRole)
                      }
                      disabled={externalJobFieldType !== "number"}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {externalJobFieldRoleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {optionLabel(
                              "externalFieldRole",
                              option.value,
                              option.label,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <InputField
                    label="Order"
                    type="number"
                    value={externalJobFieldSortOrder}
                    onChange={(event) =>
                      setExternalJobFieldSortOrder(
                        Number(event.target.value) || 0,
                      )
                    }
                    className="h-10 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveExternalJobField}>
                      {editingExternalJobFieldId ? "Save field" : "Add field"}
                    </Button>
                    {editingExternalJobFieldId && (
                      <Button
                        variant="outline"
                        onClick={resetExternalJobFieldForm}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <InputField
                    label="Unit (optional)"
                    value={externalJobFieldUnit}
                    onChange={(event) =>
                      setExternalJobFieldUnit(event.target.value)
                    }
                    placeholder="EUR"
                    className="h-10 text-sm"
                  />
                  <TextAreaField
                    label="Select options (comma, newline, or backslash separated)"
                    value={externalJobFieldOptions}
                    onChange={(event) =>
                      setExternalJobFieldOptions(event.target.value)
                    }
                    disabled={externalJobFieldType !== "select"}
                    placeholder="EUR, USD"
                    className="min-h-20 disabled:opacity-50"
                  />
                  <TextAreaField
                    label="AI aliases (comma, newline, or backslash separated)"
                    value={externalJobFieldAiAliases}
                    onChange={(event) =>
                      setExternalJobFieldAiAliases(event.target.value)
                    }
                    disabled={!externalJobFieldAiEnabled}
                    placeholder="invoice no, invoice nr, contract number"
                    className="min-h-20 disabled:opacity-50"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={externalJobFieldRequired}
                      onChange={(event) =>
                        setExternalJobFieldRequired(event.target.checked)
                      }
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={externalJobFieldActive}
                      onChange={(event) =>
                        setExternalJobFieldActive(event.target.checked)
                      }
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={externalJobFieldShowInTable}
                      onChange={(event) =>
                        setExternalJobFieldShowInTable(event.target.checked)
                      }
                    />
                    In table
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={externalJobFieldAiEnabled}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setExternalJobFieldAiEnabled(checked);
                        if (!checked) {
                          setExternalJobFieldAiMatchOnly(false);
                        }
                      }}
                    />
                    AI extract
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={externalJobFieldAiMatchOnly}
                      onChange={(event) =>
                        setExternalJobFieldAiMatchOnly(event.target.checked)
                      }
                      disabled={!externalJobFieldAiEnabled}
                    />
                    AI match only
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {selectedExternalJobFieldIds.length > 0
                      ? `${selectedExternalJobFieldIds.length} selected`
                      : " "}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveExternalTableColumns}
                      disabled={externalTableState === "saving"}
                    >
                      {externalTableState === "saving"
                        ? "Saving columns..."
                        : "Save table columns"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDeleteSelectedExternalJobFields}
                      disabled={selectedExternalJobFieldIds.length === 0}
                    >
                      {t("settings.common.removeSelected")}
                    </Button>
                  </div>
                </div>
                {externalTableState !== "idle" && externalTableMessage ? (
                  <div
                    className={`text-xs ${
                      externalTableState === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {externalTableMessage}
                  </div>
                ) : null}
                <DataTable
                  mode="custom"
                  columns={externalSchemaTableColumns}
                  stickyFirstColumn
                  wrapperClassName="overflow-x-auto overflow-y-hidden rounded-lg border border-border md:overflow-x-visible"
                  tableClassName="w-full table-auto [&_th]:whitespace-normal [&_th]:wrap-break-word [&_td]:whitespace-normal [&_td]:wrap-break-word [&_td]:align-top [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-xs [&_td]:text-sm md:[&_th]:px-4 md:[&_td]:px-4"
                  customBody={
                    <>
                      {externalTableColumns.length === 0 ? (
                        <tr>
                          <td
                            colSpan={12}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            {t("settings.partners.noExternalTableColumns")}
                          </td>
                        </tr>
                      ) : (
                        externalTableColumns.map((column, fullIndex) => {
                          const fieldId = column.id.startsWith("field.")
                            ? column.id.slice("field.".length)
                            : null;
                          const field = fieldId
                            ? externalJobFieldById[fieldId]
                            : null;
                          const catalogEntry =
                            externalTableColumnCatalogById[column.id];
                          const defaultLabel =
                            catalogEntry?.label ?? field?.label ?? column.id;

                          return (
                            <Fragment key={`table-column-${column.id}`}>
                              <tr
                                className={`border-t border-border transition-all ${
                                  externalTableDropIndex === fullIndex
                                    ? "h-4 bg-primary/10"
                                    : "h-0"
                                }`}
                              ></tr>
                              <tr
                                className={`border-t border-border ${
                                  dragExternalTableColumnId === column.id
                                    ? "bg-primary/5"
                                    : "bg-background"
                                }`}
                                draggable
                                onDragStart={() => {
                                  setDragExternalTableColumnId(column.id);
                                  setExternalTableDropIndex(fullIndex);
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  const rect =
                                    event.currentTarget.getBoundingClientRect();
                                  const before =
                                    event.clientY < rect.top + rect.height / 2;
                                  setExternalTableDropIndex(
                                    before ? fullIndex : fullIndex + 1,
                                  );
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (
                                    !dragExternalTableColumnId ||
                                    externalTableDropIndex === null
                                  ) {
                                    return;
                                  }
                                  setExternalTableColumns((prev) =>
                                    reorderExternalTableColumns(
                                      prev,
                                      dragExternalTableColumnId,
                                      externalTableDropIndex,
                                    ),
                                  );
                                  setDragExternalTableColumnId(null);
                                  setExternalTableDropIndex(null);
                                }}
                                onDragEnd={() => {
                                  setDragExternalTableColumnId(null);
                                  setExternalTableDropIndex(null);
                                }}
                              >
                                <td
                                  className={`sticky left-0 z-10 min-w-25 px-3 py-2 md:min-w-35 md:px-4 ${
                                    dragExternalTableColumnId === column.id
                                      ? "bg-primary/5"
                                      : "bg-background"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="cursor-grab text-muted-foreground"
                                      aria-hidden
                                    >
                                      ::
                                    </span>
                                    <div className="min-w-25 flex-1 md:min-w-30">
                                      <Input
                                        value={column.label ?? ""}
                                        onChange={(event) =>
                                          setExternalTableColumns((prev) =>
                                            prev.map((item) =>
                                              item.id === column.id
                                                ? {
                                                    ...item,
                                                    label: event.target.value,
                                                  }
                                                : item,
                                            ),
                                          )
                                        }
                                        placeholder={defaultLabel}
                                        className="h-8 w-full text-sm"
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="min-w-30 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? (externalJobFieldTypeOptions.find(
                                        (option) =>
                                          option.value === field.fieldType,
                                      )?.label ?? field.fieldType)
                                    : "System"}
                                </td>
                                <td className="min-w-32.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? (externalJobFieldScopeOptions.find(
                                        (option) =>
                                          option.value ===
                                          (field.scope ?? "manual"),
                                      )?.label ?? "Manual entry")
                                    : "External table"}
                                </td>
                                <td className="min-w-30 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? (externalJobFieldRoleOptions.find(
                                        (option) =>
                                          option.value ===
                                          (field.fieldRole ?? "none"),
                                      )?.label ?? "None")
                                    : "--"}
                                </td>
                                <td className="min-w-17.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field ? field.unit || "--" : "--"}
                                </td>
                                <td className="min-w-17.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {fullIndex}
                                </td>
                                <td className="min-w-22.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? field.isRequired
                                      ? "Yes"
                                      : "No"
                                    : "--"}
                                </td>
                                <td className="min-w-20 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? field.isActive
                                      ? "Yes"
                                      : "No"
                                    : "--"}
                                </td>
                                <td className="min-w-22.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  <Checkbox
                                    checked={column.visible}
                                    onChange={(event) =>
                                      setExternalTableColumns((prev) =>
                                        prev.map((item) =>
                                          item.id === column.id
                                            ? {
                                                ...item,
                                                visible: event.target.checked,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="min-w-17.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? field.aiEnabled
                                      ? "Yes"
                                      : "No"
                                    : "--"}
                                </td>
                                <td className="min-w-27.5 px-3 py-2 text-sm md:min-w-0 md:px-4">
                                  {field
                                    ? field.aiMatchOnly
                                      ? "Yes"
                                      : "No"
                                    : "--"}
                                </td>
                                <td className="min-w-72.5 px-3 py-2 text-right md:min-w-0 md:px-4">
                                  {field ? (
                                    <div className="flex flex-nowrap items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0"
                                        aria-label="Edit field"
                                        title="Edit"
                                        onClick={() =>
                                          handleEditExternalJobField(field.id)
                                        }
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0"
                                        aria-label="Copy field"
                                        title="Copy"
                                        onClick={() =>
                                          handleCopyExternalJobField(field.id)
                                        }
                                      >
                                        <CopyIcon className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        aria-label="Remove field"
                                        title="Remove"
                                        onClick={() =>
                                          handleDeleteExternalJobField(field.id)
                                        }
                                      >
                                        <Trash2Icon className="h-4 w-4" />
                                      </Button>
                                      <Checkbox
                                        variant="box"
                                        checked={selectedExternalJobFieldIds.includes(
                                          field.id,
                                        )}
                                        onChange={(event) => {
                                          setSelectedExternalJobFieldIds(
                                            (prev) => {
                                              if (event.target.checked) {
                                                return [...prev, field.id];
                                              }
                                              return prev.filter(
                                                (id) => id !== field.id,
                                              );
                                            },
                                          );
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {defaultLabel}
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {fullIndex === externalTableColumns.length - 1 ? (
                                <tr
                                  className={`border-t border-border transition-all ${
                                    externalTableDropIndex === fullIndex + 1
                                      ? "h-4 bg-primary/10"
                                      : "h-0"
                                  }`}
                                >
                                  <td colSpan={12} className="p-0" />
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })
                      )}
                    </>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.users.title")}</CardTitle>
              <CardDescription>
                {t("settings.users.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isUsersLoading || isInvitesLoading || rolePermissionsLoading ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <LoadingSpinner label={t("settings.users.loading")} />
                </div>
              ) : null}
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-sm font-medium">
                  {t("settings.users.inviteUser")}
                </div>
                <div className="mt-3 grid gap-3 items-center md:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(140px,0.5fr)_auto] md:items-end">
                  <InputField
                    label={t("settings.users.email")}
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder={t("settings.users.emailPlaceholder")}
                    className="h-10 w-full text-sm"
                    disabled={!canManageRolePermissions}
                  />
                  <InputField
                    label={t("settings.users.fullName")}
                    value={inviteFullName}
                    onChange={(event) => setInviteFullName(event.target.value)}
                    placeholder={t("settings.users.fullNamePlaceholder")}
                    className="h-10 w-full text-sm"
                    disabled={!canManageRolePermissions}
                  />
                  <SelectField
                    label={t("settings.users.role")}
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as UserRole)}
                  >
                    <Select
                      value={inviteRole}
                      onValueChange={(value) =>
                        setInviteRole(value as UserRole)
                      }
                      disabled={!canManageRolePermissions}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoleOptions.map((roleOption) => (
                          <SelectItem key={roleOption} value={roleOption}>
                            {formatUserRoleLabel(roleOption)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <Button
                    onClick={handleInviteUser}
                    disabled={
                      !canManageRolePermissions || inviteState === "sending"
                    }
                  >
                    {inviteState === "sending"
                      ? t("settings.users.sending")
                      : t("settings.users.sendInvite")}
                  </Button>
                </div>
                {inviteMessage && (
                  <p
                    className={`mt-2 text-xs ${
                      inviteState === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {inviteMessage}
                  </p>
                )}
              </div>
              {!canManageRolePermissions && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t("settings.users.adminOwnerOnly")}
                </div>
              )}
              {process.env.NODE_ENV !== "production" &&
                !canManageRolePermissions && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={devRoleOverride}
                      onChange={(event) =>
                        setDevRoleOverride(event.target.checked)
                      }
                    />
                    {t("settings.users.devOverride")}
                  </label>
                )}
              {usersError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {usersError}
                </div>
              )}
              <DataTable
                columns={usersAccessColumns}
                rows={isUsersLoading ? [] : users}
                getRowId={(user) => user.id}
                wrapperClassName="overflow-x-auto overflow-y-hidden rounded-lg border border-border"
                tableClassName="w-full [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-xs [&_td]:text-sm [&_th]:whitespace-normal [&_th]:wrap-break-word [&_td]:whitespace-normal md:[&_th]:px-4 md:[&_td]:px-4"
                emptyState={
                  isUsersLoading ? (
                    <LoadingSpinner
                      className="justify-center"
                      label={t("settings.users.loadingUsers")}
                    />
                  ) : (
                    t("settings.users.noUsers")
                  )
                }
                renderCell={(user, column) => {
                  if (column.id === "name") {
                    return <span className="font-medium">{user.name}</span>;
                  }
                  if (column.id === "role") {
                    return (
                      <Select
                        value={user.role}
                        onValueChange={(value) =>
                          handleUpdateUserRole(user.id, value as UserRole)
                        }
                        disabled={
                          !canManageRolePermissions &&
                          !(devRoleOverride && user.id === currentUser.id)
                        }
                      >
                        <SelectTrigger className="h-9 w-40 rounded-md text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            ...assignableRoleOptions,
                            ...(user.role === "Admin"
                              ? (["Admin"] as UserRole[])
                              : []),
                          ].map((roleOption) => (
                            <SelectItem key={roleOption} value={roleOption}>
                              {roleOption === "Admin"
                                ? t("settings.users.adminLegacy")
                                : formatUserRoleLabel(roleOption)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }
                  if (column.id === "owner") {
                    return (
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={user.isOwner}
                          onChange={(event) =>
                            handleUpdateUserOwner(user.id, event.target.checked)
                          }
                          disabled={user.isOwner || !canManageRolePermissions}
                        />
                        {t("settings.users.owner")}
                      </label>
                    );
                  }
                  if (column.id === "admin") {
                    return (
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={user.isOwner || user.isAdmin}
                          onChange={(event) =>
                            handleUpdateUserAdmin(user.id, event.target.checked)
                          }
                          disabled={user.isOwner || !canManageRolePermissions}
                        />
                        {t("settings.users.admin")}
                      </label>
                    );
                  }
                  if (column.id === "actions") {
                    const canRemove =
                      canManageRolePermissions &&
                      user.id !== currentUser.id &&
                      !user.isOwner;
                    return (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">
                          {updatingUserId === user.id
                            ? t("settings.users.saving")
                            : ""}
                        </span>
                        <Tooltip content={t("settings.users.deactivateHint")}>
                          <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </Tooltip>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={
                            !canRemove || deactivatingUserId === user.id
                          }
                          onClick={() => void handleDeactivateUser(user.id)}
                        >
                          {deactivatingUserId === user.id
                            ? t("settings.users.deactivating")
                            : t("settings.users.deactivate")}
                        </Button>
                        <Tooltip content={t("settings.users.removeHint")}>
                          <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </Tooltip>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={
                            !canRemove ||
                            removingUserId === user.id ||
                            deactivatingUserId === user.id
                          }
                          onClick={() =>
                            void handleRemoveUserFromWorkspace(user.id)
                          }
                        >
                          {removingUserId === user.id
                            ? t("settings.users.removing")
                            : t("settings.users.remove")}
                        </Button>
                      </div>
                    );
                  }
                  return "--";
                }}
              />
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t("settings.users.invites")}
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-180 w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Full name
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Role
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Status
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {isInvitesLoading ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            <LoadingSpinner
                              className="justify-center"
                              label={t("settings.users.loadingInvites")}
                            />
                          </td>
                        </tr>
                      ) : invites.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            {t("settings.users.noInvites")}
                          </td>
                        </tr>
                      ) : (
                        invites.map((invite) => (
                          <tr
                            key={invite.id}
                            className="border-t border-border"
                          >
                            <td className="px-4 py-2">{invite.email}</td>
                            <td className="px-4 py-2">
                              {invite.fullName ?? "--"}
                            </td>
                            <td className="px-4 py-2">{invite.role}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {invite.acceptedAt
                                ? t("settings.users.accepted")
                                : t("settings.users.pending")}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    void handleResendInvite(invite.email)
                                  }
                                  disabled={
                                    invite.acceptedAt !== null ||
                                    !canManageRolePermissions ||
                                    resendingInviteEmail === invite.email
                                  }
                                >
                                  {resendingInviteEmail === invite.email ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                      {t("settings.users.resending")}
                                    </span>
                                  ) : (
                                    t("settings.users.resend")
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancelInvite(invite.id)}
                                  disabled={
                                    invite.acceptedAt !== null ||
                                    !canManageRolePermissions
                                  }
                                >
                                  {t("settings.common.cancel")}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {inviteListMessage ? (
                  <p
                    className={`text-xs ${
                      inviteListState === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {inviteListMessage}
                  </p>
                ) : null}
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {t("settings.users.rolePermissions")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("settings.users.rolePermissionsHint")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveRolePermissions}
                    disabled={
                      !canManageRolePermissions ||
                      permissionState === "saving" ||
                      !hasPermissionChanges
                    }
                  >
                    {permissionState === "saving"
                      ? t("settings.users.saving")
                      : t("settings.users.saveRbac")}
                  </Button>
                </div>
                {rolePermissionsLoading ? (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
                    <LoadingSpinner label={t("settings.users.loadingRbac")} />
                  </div>
                ) : null}
                {rolePermissionsError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {rolePermissionsError}
                  </div>
                ) : null}
                {permissionMessage ? (
                  <div
                    className={`rounded-md border px-3 py-2 text-xs ${
                      permissionState === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
                    }`}
                  >
                    {permissionMessage}
                  </div>
                ) : null}
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="min-w-max w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          {t("settings.users.permission")}
                        </th>
                        {editablePermissionRoles.map((role) => (
                          <th
                            key={`perm-head-${role}`}
                            className="px-3 py-2 text-center font-medium whitespace-nowrap"
                          >
                            {role}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {permissionDefinitions.map((definition) => (
                        <tr
                          key={definition.key}
                          className="border-t border-border align-top"
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium">
                              {definition.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {definition.description}
                            </div>
                          </td>
                          {editablePermissionRoles.map((role) => {
                            const allowed =
                              permissionDrafts[definition.key]?.includes(
                                role,
                              ) ??
                              defaultPermissionRoles[definition.key].includes(
                                role,
                              );
                            return (
                              <td
                                key={`${definition.key}-${role}`}
                                className="px-3 py-2 text-center"
                              >
                                <Checkbox
                                  checked={allowed}
                                  onChange={() =>
                                    togglePermissionRole(definition.key, role)
                                  }
                                  disabled={!canManageRolePermissions}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.workflow.rulesTitle")}</CardTitle>
              <CardDescription>
                {t("settings.workflow.rulesDescription")}
              </CardDescription>
              {saveError ? (
                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {saveError}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-6">
              {!isLoadedFromDb ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <LoadingSpinner label={t("settings.workflow.syncing")} />
                </div>
              ) : null}
              <div className="grid gap-6">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">
                    {t("settings.workflow.coreRules")}
                  </div>
                  <div className="mt-3 grid gap-4 lg:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium">
                      {t("settings.workflow.minAttachmentsEngineering")}
                      <Input
                        type="number"
                        min={0}
                        value={rules.minAttachmentsForEngineering}
                        onChange={(event) =>
                          setRules({
                            minAttachmentsForEngineering:
                              Number(event.target.value) || 0,
                          })
                        }
                        className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      {t("settings.workflow.minAttachmentsProduction")}
                      <Input
                        type="number"
                        min={0}
                        value={rules.minAttachmentsForProduction}
                        onChange={(event) =>
                          setRules({
                            minAttachmentsForProduction:
                              Number(event.target.value) || 0,
                          })
                        }
                        className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      {t("settings.workflow.dueSoonThresholdDays")}
                      <Input
                        type="number"
                        min={0}
                        value={rules.dueSoonDays}
                        onChange={(event) =>
                          setRules({
                            dueSoonDays: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          })
                        }
                        className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={rules.requireCommentForEngineering}
                        onChange={(event) =>
                          setRules({
                            requireCommentForEngineering: event.target.checked,
                          })
                        }
                      />
                      {t("settings.workflow.requireCommentEngineering")}
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={rules.requireCommentForProduction}
                        onChange={(event) =>
                          setRules({
                            requireCommentForProduction: event.target.checked,
                          })
                        }
                      />
                      {t("settings.workflow.requireCommentProduction")}
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={rules.requireOrderInputsForEngineering}
                        onChange={(event) =>
                          setRules({
                            requireOrderInputsForEngineering:
                              event.target.checked,
                          })
                        }
                      />
                      {t("settings.workflow.requireOrderInputsEngineering")}
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={rules.requireOrderInputsForProduction}
                        onChange={(event) =>
                          setRules({
                            requireOrderInputsForProduction:
                              event.target.checked,
                          })
                        }
                      />
                      {t("settings.workflow.requireOrderInputsProduction")}
                    </label>
                  </div>
                  <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={rules.dueIndicatorEnabled}
                        onChange={(event) =>
                          setRules({
                            dueIndicatorEnabled: event.target.checked,
                          })
                        }
                      />
                      {t("settings.workflow.enableDueDateIndicators")}
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {workflowStatusOptions.map((option) => {
                        const isChecked = rules.dueIndicatorStatuses.includes(
                          option.value,
                        );
                        return (
                          <label
                            key={option.value}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              checked={isChecked}
                              disabled={!rules.dueIndicatorEnabled}
                              onChange={(event) => {
                                setRules({
                                  dueIndicatorStatuses: event.target.checked
                                    ? [
                                        ...rules.dueIndicatorStatuses,
                                        option.value,
                                      ]
                                    : rules.dueIndicatorStatuses.filter(
                                        (status) => status !== option.value,
                                      ),
                                });
                              }}
                            />
                            {optionLabel(
                              "workflowStatus",
                              option.value,
                              option.label,
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">
                    {t("settings.workflow.productionCompletionTitle")}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.workflow.productionCompletionDescription")}
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_1fr] lg:items-start">
                    <label className="space-y-2 text-sm font-medium">
                      {t("settings.workflow.productionCompletionMode")}
                      <Select
                        value={rules.productionCompletionConfig.mode}
                        onValueChange={(value) => {
                          const mode = value as ProductionCompletionMode;
                          setRules({
                            productionCompletionConfig: {
                              ...rules.productionCompletionConfig,
                              mode,
                              completionStationIds:
                                mode === "all_items_done"
                                  ? []
                                  : rules.productionCompletionConfig
                                      .completionStationIds,
                            },
                          });
                        }}
                      >
                        <SelectTrigger className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_items_done">
                            {t(
                              "settings.workflow.productionCompletionModeAllItems",
                            )}
                          </SelectItem>
                          <SelectItem value="completion_stations_done">
                            {t(
                              "settings.workflow.productionCompletionModeStations",
                            )}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    {rules.productionCompletionConfig.mode ===
                    "completion_stations_done" ? (
                      <div className="rounded-lg border border-border bg-background/60 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t(
                            "settings.workflow.productionCompletionStationsTitle",
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-sm">
                          {displayStations.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {t(
                                "settings.workflow.productionCompletionNoStations",
                              )}
                            </span>
                          ) : (
                            displayStations.map((station) => {
                              const isChecked =
                                rules.productionCompletionConfig.completionStationIds.includes(
                                  station.id,
                                );
                              return (
                                <label
                                  key={station.id}
                                  className="flex items-center gap-2"
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onChange={(event) => {
                                      const nextIds = event.target.checked
                                        ? [
                                            ...rules.productionCompletionConfig
                                              .completionStationIds,
                                            station.id,
                                          ]
                                        : rules.productionCompletionConfig.completionStationIds.filter(
                                            (id) => id !== station.id,
                                          );
                                      setRules({
                                        productionCompletionConfig: {
                                          ...rules.productionCompletionConfig,
                                          completionStationIds: nextIds,
                                        },
                                      });
                                    }}
                                  />
                                  {station.name}
                                </label>
                              );
                            })
                          )}
                        </div>
                        {rules.productionCompletionConfig.completionStationIds
                          .length === 0 ? (
                          <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {t(
                              "settings.workflow.productionCompletionSelectAtLeastOne",
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-sm font-semibold">
                      {t("settings.workflow.orderStatusConfiguration")}
                    </div>
                    <div className="mt-2 space-y-2">
                      {workflowStatusOptions.map((option) => {
                        const config = orderStatusConfigDrafts[option.value];
                        const previewLabel =
                          config?.label?.trim() ||
                          optionLabel(
                            "workflowStatus",
                            option.value,
                            option.label,
                          );
                        return (
                          <div
                            key={option.value}
                            className="rounded-lg border border-border bg-background/50 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">
                                {optionLabel(
                                  "workflowStatus",
                                  option.value,
                                  option.label,
                                )}
                              </div>
                              <span
                                className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getStatusBadgeColorClass(config?.color)}`}
                              >
                                {previewLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={
                                  config?.label ??
                                  optionLabel(
                                    "workflowStatus",
                                    option.value,
                                    option.label,
                                  )
                                }
                                onChange={(event) =>
                                  setOrderStatusConfigDrafts((prev) => ({
                                    ...prev,
                                    [option.value]: {
                                      ...prev[option.value],
                                      label: event.target.value,
                                    },
                                  }))
                                }
                                className="h-9 min-w-45 flex-1 rounded-lg bg-input-background px-3 text-sm"
                              />
                              <Select
                                value={config?.color ?? "slate"}
                                onValueChange={(value) =>
                                  setOrderStatusConfigDrafts((prev) => ({
                                    ...prev,
                                    [option.value]: {
                                      ...prev[option.value],
                                      color: value as WorkflowStatusColor,
                                    },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-9 w-35 rounded-lg border border-border bg-input-background px-3 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusColorOptions.map((colorOption) => (
                                    <SelectItem
                                      key={colorOption.value}
                                      value={colorOption.value}
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        <span
                                          className={`inline-block h-2.5 w-2.5 rounded-full ${colorOption.swatchClass}`}
                                        />
                                        {optionLabel(
                                          "statusColor",
                                          colorOption.value,
                                          colorOption.label,
                                        )}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <label className="flex min-w-27.5 items-center gap-2 text-sm">
                                {requiredActiveOrderStatuses.includes(
                                  option.value,
                                ) ? (
                                  <span
                                    className="text-xs text-muted-foreground"
                                    title="Required for workflow transitions"
                                  >
                                    {t("settings.common.required")}
                                  </span>
                                ) : null}
                                <Checkbox
                                  checked={config?.isActive ?? true}
                                  disabled={requiredActiveOrderStatuses.includes(
                                    option.value,
                                  )}
                                  onChange={(event) =>
                                    setOrderStatusConfigDrafts((prev) => ({
                                      ...prev,
                                      [option.value]: {
                                        ...prev[option.value],
                                        isActive: event.target.checked,
                                      },
                                    }))
                                  }
                                />
                                <span>{t("settings.common.active")}</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setOrderStatusConfigDrafts(rules.orderStatusConfig)
                        }
                        disabled={!hasStatusLabelChanges}
                      >
                        {t("settings.workflow.reset")}
                      </Button>
                      <Button
                        onClick={handleSaveStatusLabels}
                        disabled={
                          !hasStatusLabelChanges ||
                          statusLabelState === "saving"
                        }
                      >
                        {statusLabelState === "saving"
                          ? t("settings.users.saving")
                          : t("settings.workflow.saveOrderStatuses")}
                      </Button>
                      {statusLabelState !== "idle" && statusLabelMessage && (
                        <span
                          className={`text-xs ${
                            statusLabelState === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {statusLabelMessage}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-sm font-semibold">
                      {t("settings.workflow.externalJobStatusConfiguration")}
                    </div>
                    <div className="mt-2 space-y-2">
                      {externalJobStatusOptions.map((option) => {
                        const config =
                          externalJobStatusConfigDrafts[option.value];
                        const previewLabel =
                          config?.label?.trim() ||
                          optionLabel(
                            "externalJobStatus",
                            option.value,
                            option.label,
                          );
                        return (
                          <div
                            key={option.value}
                            className="rounded-lg border border-border bg-background/50 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">
                                {optionLabel(
                                  "externalJobStatus",
                                  option.value,
                                  option.label,
                                )}
                              </div>
                              <span
                                className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getStatusBadgeColorClass(config?.color)}`}
                              >
                                {previewLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={
                                  config?.label ??
                                  optionLabel(
                                    "externalJobStatus",
                                    option.value,
                                    option.label,
                                  )
                                }
                                onChange={(event) =>
                                  setExternalJobStatusConfigDrafts((prev) => ({
                                    ...prev,
                                    [option.value]: {
                                      ...prev[option.value],
                                      label: event.target.value,
                                    },
                                  }))
                                }
                                className="h-9 min-w-45 flex-1 rounded-lg bg-input-background px-3 text-sm"
                              />
                              <Select
                                value={config?.color ?? "slate"}
                                onValueChange={(value) =>
                                  setExternalJobStatusConfigDrafts((prev) => ({
                                    ...prev,
                                    [option.value]: {
                                      ...prev[option.value],
                                      color: value as WorkflowStatusColor,
                                    },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-9 w-35 rounded-lg border border-border bg-input-background px-3 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusColorOptions.map((colorOption) => (
                                    <SelectItem
                                      key={colorOption.value}
                                      value={colorOption.value}
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        <span
                                          className={`inline-block h-2.5 w-2.5 rounded-full ${colorOption.swatchClass}`}
                                        />
                                        {optionLabel(
                                          "statusColor",
                                          colorOption.value,
                                          colorOption.label,
                                        )}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <label className="flex min-w-27.5 items-center gap-2 text-sm">
                                {requiredActiveExternalStatuses.includes(
                                  option.value,
                                ) ? (
                                  <span
                                    className="text-xs text-muted-foreground"
                                    title="Required for external job lifecycle"
                                  >
                                    {t("settings.common.required")}
                                  </span>
                                ) : null}
                                <Checkbox
                                  checked={config?.isActive ?? true}
                                  disabled={requiredActiveExternalStatuses.includes(
                                    option.value,
                                  )}
                                  onChange={(event) =>
                                    setExternalJobStatusConfigDrafts(
                                      (prev) => ({
                                        ...prev,
                                        [option.value]: {
                                          ...prev[option.value],
                                          isActive: event.target.checked,
                                        },
                                      }),
                                    )
                                  }
                                />
                                <span>{t("settings.common.active")}</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setExternalJobStatusConfigDrafts(
                            rules.externalJobStatusConfig,
                          )
                        }
                        disabled={!hasExternalJobStatusLabelChanges}
                      >
                        {t("settings.workflow.reset")}
                      </Button>
                      <Button
                        onClick={handleSaveExternalJobStatusLabels}
                        disabled={
                          !hasExternalJobStatusLabelChanges ||
                          externalJobStatusLabelState === "saving"
                        }
                      >
                        {externalJobStatusLabelState === "saving"
                          ? t("settings.users.saving")
                          : t("settings.workflow.saveExternalStatuses")}
                      </Button>
                      {externalJobStatusLabelState !== "idle" &&
                        externalJobStatusLabelMessage && (
                          <span
                            className={`text-xs ${
                              externalJobStatusLabelState === "error"
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {externalJobStatusLabelMessage}
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-sm font-semibold">
                      {t("settings.workflow.assignmentLabels")}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("settings.workflow.assignmentLabelsDescription")}
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm font-medium">
                        {t("settings.workflow.engineerRoleLabel")}
                        <Input
                          value={assignmentLabelDrafts.engineer}
                          onChange={(event) =>
                            setAssignmentLabelDrafts((prev) => ({
                              ...prev,
                              engineer: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                        />
                      </label>
                      <label className="space-y-2 text-sm font-medium">
                        {t("settings.workflow.managerRoleLabel")}
                        <Input
                          value={assignmentLabelDrafts.manager}
                          onChange={(event) =>
                            setAssignmentLabelDrafts((prev) => ({
                              ...prev,
                              manager: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setAssignmentLabelDrafts({
                            engineer:
                              rules.assignmentLabels?.engineer ?? "Engineer",
                            manager:
                              rules.assignmentLabels?.manager ?? "Manager",
                          })
                        }
                        disabled={!hasAssignmentLabelChanges}
                      >
                        {t("settings.workflow.reset")}
                      </Button>
                      <Button
                        onClick={handleSaveAssignmentLabels}
                        disabled={
                          !hasAssignmentLabelChanges ||
                          assignmentLabelState === "saving"
                        }
                      >
                        {assignmentLabelState === "saving"
                          ? t("settings.users.saving")
                          : t("settings.workflow.saveAssignmentRoleLabels")}
                      </Button>
                      {assignmentLabelState !== "idle" &&
                        assignmentLabelMessage && (
                          <span
                            className={`text-xs ${
                              assignmentLabelState === "error"
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {assignmentLabelMessage}
                          </span>
                        )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">
                    {t("settings.workflow.attachments")}
                  </div>
                  <div className="mt-3 grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        {t("settings.workflow.attachmentCategories")}
                      </div>
                      <div className="grid gap-3">
                        {attachmentCategoryDrafts.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center gap-3"
                          >
                            <Input
                              value={category.label}
                              onChange={(event) =>
                                setAttachmentCategoryDrafts((prev) =>
                                  prev.map((item) =>
                                    item.id === category.id
                                      ? {
                                          ...item,
                                          label: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                            />
                            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                              <Checkbox
                                checked={Boolean(category.aiParseEnabled)}
                                onChange={(event) =>
                                  setAttachmentCategoryDrafts((prev) =>
                                    prev.map((item) =>
                                      item.id === category.id
                                        ? {
                                            ...item,
                                            aiParseEnabled:
                                              event.target.checked,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              {t("settings.workflow.useForAiParsing")}
                            </label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveAttachmentCategory(category.id)
                              }
                              disabled={attachmentCategoryDrafts.length <= 1}
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={newAttachmentCategoryLabel}
                          onChange={(event) =>
                            setNewAttachmentCategoryLabel(event.target.value)
                          }
                          placeholder={t(
                            "settings.workflow.addCategoryPlaceholder",
                          )}
                          className="h-10 min-w-50 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                        />
                        <Button onClick={handleAddAttachmentCategory}>
                          {t("settings.workflow.addCategory")}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        {t("settings.workflow.defaultCategoryByRole")}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {attachmentRoles.map((role) => (
                          <SelectField
                            key={role}
                            label={formatUserRoleLabel(role)}
                            value={
                              attachmentDefaultDrafts[role] ??
                              attachmentCategoryDrafts[0]?.id ??
                              ""
                            }
                            onValueChange={(value) =>
                              setAttachmentDefaultDrafts((prev) => ({
                                ...prev,
                                [role]: value,
                              }))
                            }
                          >
                            <Select
                              value={
                                attachmentDefaultDrafts[role] ??
                                attachmentCategoryDrafts[0]?.id ??
                                ""
                              }
                              onValueChange={(value) =>
                                setAttachmentDefaultDrafts((prev) => ({
                                  ...prev,
                                  [role]: value,
                                }))
                              }
                            >
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {attachmentCategoryDrafts.map((category) => (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    {category.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </SelectField>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.workflow.newUploadsHint")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.workflow.aiParsingHint")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAttachmentCategoryDrafts(rules.attachmentCategories);
                        setAttachmentDefaultDrafts(
                          rules.attachmentCategoryDefaults,
                        );
                      }}
                      disabled={!hasAttachmentCategoryChanges}
                    >
                      {t("settings.workflow.reset")}
                    </Button>
                    <Button
                      onClick={handleSaveAttachmentCategories}
                      disabled={
                        !hasAttachmentCategoryChanges ||
                        attachmentCategoryState === "saving"
                      }
                    >
                      {attachmentCategoryState === "saving"
                        ? t("settings.users.saving")
                        : t("settings.workflow.saveAttachmentCategories")}
                    </Button>
                    {attachmentCategoryState !== "idle" &&
                      attachmentCategoryMessage && (
                        <span
                          className={`text-xs ${
                            attachmentCategoryState === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {attachmentCategoryMessage}
                        </span>
                      )}
                  </div>
                </div>

                {isStationOrderSaving ? (
                  <div className="text-xs text-muted-foreground">
                    {t("settings.workflow.savingStationOrder")}
                  </div>
                ) : null}

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">
                    {t("settings.workflow.checklistItems")}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                    <div className="space-y-2">
                      <Input
                        value={newChecklistLabel}
                        onChange={(event) =>
                          setNewChecklistLabel(event.target.value)
                        }
                        placeholder={t(
                          "settings.workflow.checklistItemPlaceholder",
                        )}
                        className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                      <Button
                        onClick={() => {
                          addChecklistItem(
                            newChecklistLabel,
                            newChecklistRequired,
                          );
                          setNewChecklistLabel("");
                        }}
                      >
                        {t("settings.workflow.addItem")}
                      </Button>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={newChecklistRequired.includes(
                              "ready_for_engineering",
                            )}
                            onChange={(event) => {
                              setNewChecklistRequired((prev) => {
                                const next = new Set(prev);
                                if (event.target.checked) {
                                  next.add("ready_for_engineering");
                                } else {
                                  next.delete("ready_for_engineering");
                                }
                                return Array.from(next);
                              });
                            }}
                          />
                          {t("settings.workflow.requiredForEngineering")}
                        </label>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={
                              newChecklistRequired.includes(
                                "ready_for_production",
                              ) ||
                              newChecklistRequired.includes("in_production")
                            }
                            onChange={(event) => {
                              setNewChecklistRequired((prev) => {
                                const next = new Set(prev);
                                if (event.target.checked) {
                                  next.add("ready_for_production");
                                } else {
                                  next.delete("ready_for_production");
                                }
                                return Array.from(next);
                              });
                            }}
                          />
                          {t("settings.workflow.requiredForProduction")}
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {rules.checklistItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                      >
                        <div className="font-medium">{item.label}</div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={item.requiredFor.includes(
                                "ready_for_engineering",
                              )}
                              onChange={(event) => {
                                const next = new Set(item.requiredFor);
                                if (event.target.checked) {
                                  next.add("ready_for_engineering");
                                } else {
                                  next.delete("ready_for_engineering");
                                }
                                updateChecklistItem(item.id, {
                                  requiredFor: Array.from(next),
                                });
                              }}
                            />
                            {t("settings.workflow.engineeringShort")}
                          </label>
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={
                                item.requiredFor.includes(
                                  "ready_for_production",
                                ) || item.requiredFor.includes("in_production")
                              }
                              onChange={(event) => {
                                const next = new Set(item.requiredFor);
                                if (event.target.checked) {
                                  next.add("ready_for_production");
                                } else {
                                  next.delete("ready_for_production");
                                }
                                updateChecklistItem(item.id, {
                                  requiredFor: Array.from(next),
                                });
                              }}
                            />
                            {t("settings.workflow.productionShort")}
                          </label>
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={item.isActive}
                              onChange={(event) =>
                                updateChecklistItem(item.id, {
                                  isActive: event.target.checked,
                                })
                              }
                            />
                            {t("settings.common.active")}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (
                                !(await confirmRemove(
                                  t(
                                    "settings.workflow.removeChecklistConfirm",
                                    {
                                      label: item.label,
                                    },
                                  ),
                                ))
                              ) {
                                return;
                              }
                              removeChecklistItem(item.id);
                            }}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {rules.checklistItems.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        {t("settings.workflow.noChecklistItems")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-1">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-sm font-semibold">
                      {t("settings.workflow.returnReasons")}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Input
                        value={newReturnReason}
                        onChange={(event) =>
                          setNewReturnReason(event.target.value)
                        }
                        placeholder={t(
                          "settings.workflow.addReasonPlaceholder",
                        )}
                        className="h-10 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                      <Button
                        onClick={() => {
                          addReturnReason(newReturnReason);
                          setNewReturnReason("");
                        }}
                      >
                        {t("settings.workflow.addReason")}
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {rules.returnReasons.map((reason) => (
                        <div
                          key={reason}
                          className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm"
                        >
                          <span>{reason}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (
                                !(await confirmRemove(
                                  t("settings.workflow.removeReasonConfirm", {
                                    reason,
                                  }),
                                ))
                              ) {
                                return;
                              }
                              removeReturnReason(reason);
                            }}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {rules.returnReasons.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                          {t("settings.workflow.noReturnReasons")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="space-y-4">
            {isTenantProfileLoading ? (
              <Card>
                <CardContent className="py-10">
                  <LoadingSpinner label={t("settings.integrations.loading")} />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>
                  {t("settings.integrations.outboundTitle")}
                </CardTitle>
                <CardDescription>
                  {t("settings.integrations.outboundDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    {t("settings.integrations.fromName")}
                    <Input
                      value={outboundFromName}
                      onChange={(event) =>
                        setOutboundFromName(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder={
                        companyName ||
                        t("settings.integrations.companyPlaceholder")
                      }
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    {t("settings.integrations.fromEmail")}
                    <Input
                      type="email"
                      value={outboundFromEmail}
                      onChange={(event) =>
                        setOutboundFromEmail(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder={t(
                        "settings.integrations.fromEmailPlaceholder",
                      )}
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    {t("settings.integrations.replyTo")}
                    <Input
                      type="email"
                      value={outboundReplyToEmail}
                      onChange={(event) =>
                        setOutboundReplyToEmail(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder={t(
                        "settings.integrations.replyToPlaceholder",
                      )}
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <div className="space-y-2 text-sm font-medium">
                    {t("settings.integrations.senderMode")}
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox
                        checked={outboundUseUserSender}
                        onChange={(event) =>
                          setOutboundUseUserSender(event.target.checked)
                        }
                        disabled={!currentUser.isAdmin}
                      />
                      {t("settings.integrations.useEngineerSender")}
                    </label>
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox
                        checked={outboundSenderVerified}
                        onChange={(event) =>
                          setOutboundSenderVerified(event.target.checked)
                        }
                        disabled={!currentUser.isAdmin}
                      />
                      {t("settings.integrations.domainVerified")}
                    </label>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="text-sm font-semibold">
                    {t("settings.integrations.templateTitle")}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.integrations.placeholders")}
                    {
                      " {{order_number}}, {{customer_name}}, {{external_order_number}}, {{due_date}}, {{comment_block}}, {{attachments_block}}, {{comment_line}}, {{attachments_line}}, {{secure_form_link}}, {{expires_at}}, {{partner_name}}, {{sender_name}}, {{sender_email}}, {{tenant_name}}"
                    }
                    .
                  </p>
                  <InputField
                    label={t("settings.integrations.subjectTemplate")}
                    value={externalRequestEmailSubjectTemplate}
                    onChange={(event) =>
                      setExternalRequestEmailSubjectTemplate(event.target.value)
                    }
                    className="h-11 text-sm"
                    disabled={!currentUser.isAdmin}
                  />
                  <TextAreaField
                    label={t("settings.integrations.htmlTemplate")}
                    value={externalRequestEmailHtmlTemplate}
                    onChange={(event) =>
                      setExternalRequestEmailHtmlTemplate(event.target.value)
                    }
                    rows={8}
                    className="text-sm"
                    disabled={!currentUser.isAdmin}
                  />
                  <TextAreaField
                    label={t("settings.integrations.textTemplate")}
                    value={externalRequestEmailTextTemplate}
                    onChange={(event) =>
                      setExternalRequestEmailTextTemplate(event.target.value)
                    }
                    rows={8}
                    className="text-sm"
                    disabled={!currentUser.isAdmin}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setExternalRequestEmailSubjectTemplate(
                          defaultExternalRequestEmailSubjectTemplate,
                        );
                        setExternalRequestEmailHtmlTemplate(
                          defaultExternalRequestEmailHtmlTemplate,
                        );
                        setExternalRequestEmailTextTemplate(
                          defaultExternalRequestEmailTextTemplate,
                        );
                      }}
                      disabled={!currentUser.isAdmin}
                    >
                      {t("settings.integrations.resetDefault")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.integrations.domainHint")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleSaveOutboundEmail}
                    disabled={
                      !currentUser.isAdmin || outboundState === "saving"
                    }
                  >
                    {outboundState === "saving"
                      ? t("settings.users.saving")
                      : t("settings.integrations.saveOutbound")}
                  </Button>
                  {outboundMessage ? (
                    <span
                      className={`text-xs ${
                        outboundState === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {outboundMessage}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.section.integrations")}</CardTitle>
                <CardDescription>
                  {t("settings.integrations.comingSoonDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                  >
                    <div className="font-medium">{integration.name}</div>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {integration.status === "Coming soon"
                        ? t("settings.integrations.comingSoon")
                        : integration.status}
                    </span>
                  </div>
                ))}
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {t("settings.integrations.expectedFlow")}
                </div>
                <Button variant="outline" className="w-full">
                  {t("settings.integrations.requestIntegration")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <BottomSheet
        open={isSecurityPromptOpen}
        onClose={closeSecurityPrompt}
        ariaLabel={t("settings.security.ariaLabel")}
        title={t("settings.security.title")}
        closeButtonLabel={t("settings.security.close")}
        enableSwipeToClose
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.security.description")}
          </p>
          <label className="space-y-2 text-sm font-medium">
            {t("settings.security.password")}
            <Input
              type="password"
              value={securityPassword}
              onChange={(event) => {
                setSecurityPassword(event.target.value);
                if (securityState === "error") {
                  setSecurityState("idle");
                  setSecurityMessage("");
                }
              }}
              className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              autoComplete="current-password"
            />
          </label>
          {securityMessage ? (
            <p className="text-xs text-destructive">{securityMessage}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={closeSecurityPrompt}>
              {t("settings.common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmSecurityVerification}
              disabled={securityState === "verifying"}
            >
              {securityState === "verifying"
                ? t("settings.security.verifying")
                : t("settings.security.confirm")}
            </Button>
          </div>
        </div>
      </BottomSheet>
      {isSecurityPromptOpen ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {t("settings.security.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.security.description")}
            </p>
            <label className="mt-4 block space-y-2 text-sm font-medium">
              {t("settings.security.password")}
              <Input
                type="password"
                value={securityPassword}
                onChange={(event) => {
                  setSecurityPassword(event.target.value);
                  if (securityState === "error") {
                    setSecurityState("idle");
                    setSecurityMessage("");
                  }
                }}
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                autoComplete="current-password"
              />
            </label>
            {securityMessage ? (
              <p className="mt-2 text-xs text-destructive">{securityMessage}</p>
            ) : null}
            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeSecurityPrompt}>
                {t("settings.common.cancel")}
              </Button>
              <Button
                onClick={handleConfirmSecurityVerification}
                disabled={securityState === "verifying"}
              >
                {securityState === "verifying"
                  ? t("settings.security.verifying")
                  : t("settings.security.confirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
