"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FactoryIcon,
  GitBranchIcon,
  NetworkIcon,
  PanelRightIcon,
  PuzzleIcon,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { useHierarchy } from "./HierarchyContext";
import { useSettingsData } from "@/hooks/useSettingsData";
import {
  normalizeUserRole,
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
import { supabase, supabaseTenantLogoBucket } from "@/lib/supabaseClient";
import { uploadTenantLogo } from "@/lib/uploadTenantLogo";
import { getStatusBadgeColorClass } from "@/lib/domain/statusBadgeColor";
import type { WorkStation } from "@/types/workstation";
import type {
  OrderInputFieldType,
  OrderInputGroupKey,
  OrderInputTableColumn,
  OrderInputTableColumnType,
} from "@/types/orderInputs";
import {
  useWorkflowRules,
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
  ExternalJobFieldScope,
  ExternalJobFieldType,
  ExternalJobStatus,
  OrderStatus,
} from "@/types/orders";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function getStoragePathFromUrl(url: string, bucket: string) {
  if (!url) {
    return null;
  }
  if (!url.startsWith("http")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) {
      return null;
    }
    return parsed.pathname.slice(idx + marker.length);
  } catch {
    return null;
  }
}

const integrations = [
  { id: "int-1", name: "Horizon", status: "Coming soon" },
  { id: "int-2", name: "Odoo", status: "Coming soon" },
  { id: "int-3", name: "SAP Business One", status: "Coming soon" },
  { id: "int-4", name: "QuickBooks", status: "Coming soon" },
  { id: "int-5", name: "Custom API", status: "Coming soon" },
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

type AttachmentRole = UserRole;

const lockedLevelKeys = new Set([
  "contract",
  "category",
  "product",
  "manager",
  "engineer",
]);

const defaultLevelDescriptions: Record<string, string> = {
  contract: "Customer or project contract identifier.",
  category: "High-level product category or group.",
  product: "Specific product or item type.",
  manager: "Sales/lead owner responsible for the order.",
  engineer: "Assigned engineer or designer handling the order.",
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
  { value: "structure", label: "Structure", icon: NetworkIcon },
  { value: "operations", label: "Production", icon: FactoryIcon },
  { value: "partners", label: "Partners", icon: GitBranchIcon },
  { value: "users", label: "Users", icon: UsersIcon },
  { value: "workflow", label: "Workflow", icon: WorkflowIcon },
  { value: "integrations", label: "Integrations", icon: PuzzleIcon },
] as const;

type SettingsSectionValue = (typeof settingsSections)[number]["value"];

const settingsSectionSubtitles: Record<SettingsSectionValue, string> = {
  structure: "Define hierarchy, order fields, and system structure.",
  operations: "Configure production hours, stations, and operation defaults.",
  partners: "Manage external partners, groups, and field mappings.",
  users: "Control user access, roles, and account permissions.",
  workflow: "Set status flow rules, requirements, and automations.",
  integrations: "Connect accounting, email, and external services.",
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const {
    permissions: rolePermissions,
    loading: rolePermissionsLoading,
    error: rolePermissionsError,
    hasPermission,
    savePermissionRoles,
  } = useRbac();
  const { confirm, dialog } = useConfirmDialog();
  const {
    levels,
    nodes,
    addLevel,
    updateLevel,
    removeLevel,
    addNode,
    updateNode,
    removeNode,
  } = useHierarchy();

  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => a.order - b.order),
    [levels],
  );
  const selectableLevels = useMemo(
    () =>
      sortedLevels.filter(
        (level) => level.key !== "engineer" && level.key !== "manager",
      ),
    [sortedLevels],
  );
  const [levelName, setLevelName] = useState("");
  const [levelOrder, setLevelOrder] = useState<number>(sortedLevels.length + 1);
  const [levelRequired, setLevelRequired] = useState(false);
  const [levelActive, setLevelActive] = useState(true);
  const [levelShowInTable, setLevelShowInTable] = useState(true);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);

  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    selectableLevels[0]?.id ?? "",
  );
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeCode, setNodeCode] = useState("");
  const [nodeParentId, setNodeParentId] = useState<string>("none");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
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

  const [stationName, setStationName] = useState("");
  const [stationDescription, setStationDescription] = useState("");
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
  const [externalJobFieldUnit, setExternalJobFieldUnit] = useState("");
  const [externalJobFieldOptions, setExternalJobFieldOptions] = useState("");
  const [externalJobFieldRequired, setExternalJobFieldRequired] =
    useState(false);
  const [externalJobFieldActive, setExternalJobFieldActive] = useState(true);
  const [externalJobFieldSortOrder, setExternalJobFieldSortOrder] = useState(0);
  const [editingExternalJobFieldId, setEditingExternalJobFieldId] = useState<
    string | null
  >(null);
  const [selectedExternalJobFieldIds, setSelectedExternalJobFieldIds] =
    useState<string[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [bulkNodeInput, setBulkNodeInput] = useState("");
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
    "Production manager",
    "Admin",
    "Owner",
  ]);
  const [notificationState, setNotificationState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notificationMessage, setNotificationMessage] = useState("");
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
            "workday_start, workday_end, workdays, work_shifts, qr_enabled_sizes, qr_default_size, qr_content_fields, notification_roles",
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
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyRegistrationNo, setCompanyRegistrationNo] = useState("");
  const [companyVatNo, setCompanyVatNo] = useState("");
  const [companyBillingEmail, setCompanyBillingEmail] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(
    null,
  );
  const [companyLogoState, setCompanyLogoState] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [companyLogoMessage, setCompanyLogoMessage] = useState("");
  const [companyState, setCompanyState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [companyMessage, setCompanyMessage] = useState("");
  const [outboundFromName, setOutboundFromName] = useState("");
  const [outboundFromEmail, setOutboundFromEmail] = useState("");
  const [outboundReplyToEmail, setOutboundReplyToEmail] = useState("");
  const [outboundUseUserSender, setOutboundUseUserSender] = useState(true);
  const [outboundSenderVerified, setOutboundSenderVerified] = useState(false);
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
    "Production manager",
    "Production worker",
    "Dealer",
    "Production",
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

  const maxLogoBytes = 2 * 1024 * 1024;
  const hasAssignmentLabelChanges =
    assignmentLabelDrafts.engineer.trim() !==
      (rules.assignmentLabels?.engineer ?? "Engineer") ||
    assignmentLabelDrafts.manager.trim() !==
      (rules.assignmentLabels?.manager ?? "Manager");
  const hasAttachmentCategoryChanges = useMemo(() => {
    const normalize = (items: { id: string; label: string }[]) =>
      items
        .map((item) => `${item.id}:${item.label}`)
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
        (role) =>
          !inactiveRoleOptions.has(role) && role !== "Production worker",
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
        label: (current?.label ?? "").trim() || fallback.label || option.label,
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
        label: (current?.label ?? "").trim() || fallback.label || option.label,
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
            "name, legal_name, registration_no, vat_no, billing_email, address, logo_url, outbound_from_name, outbound_from_email, outbound_reply_to_email, outbound_use_user_sender, outbound_sender_verified",
          )
          .eq("id", currentUser.tenantId)
          .maybeSingle();
        if (!isMounted || error || !data) {
          return;
        }
        setCompanyName(data.name ?? "");
        setCompanyLegalName(data.legal_name ?? "");
        setCompanyRegistrationNo(data.registration_no ?? "");
        setCompanyVatNo(data.vat_no ?? "");
        setCompanyBillingEmail(data.billing_email ?? "");
        setCompanyAddress(data.address ?? "");
        setCompanyLogoUrl(data.logo_url ?? "");
        setOutboundFromName(data.outbound_from_name ?? "");
        setOutboundFromEmail(data.outbound_from_email ?? "");
        setOutboundReplyToEmail(data.outbound_reply_to_email ?? "");
        setOutboundUseUserSender(data.outbound_use_user_sender ?? true);
        setOutboundSenderVerified(data.outbound_sender_verified ?? false);
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
    return () => {
      if (companyLogoPreview) {
        URL.revokeObjectURL(companyLogoPreview);
      }
    };
  }, [companyLogoPreview]);

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

  async function handleSaveCompany() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setCompanyState("saving");
    setCompanyMessage("");
    const { error } = await supabase
      .from("tenants")
      .update({
        name: companyName.trim(),
        legal_name: companyLegalName.trim() || null,
        registration_no: companyRegistrationNo.trim() || null,
        vat_no: companyVatNo.trim() || null,
        billing_email: companyBillingEmail.trim() || null,
        address: companyAddress.trim() || null,
        logo_url: companyLogoUrl.trim() || null,
      })
      .eq("id", currentUser.tenantId);
    if (error) {
      setCompanyState("error");
      setCompanyMessage(error.message);
      return;
    }
    setCompanyState("saved");
    setCompanyMessage("Company details saved.");
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
    const response = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: trimmed, mode: "invite" }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
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

  async function handleUploadCompanyLogo() {
    if (!companyLogoFile || !currentUser.tenantId) {
      return;
    }
    setCompanyLogoState("uploading");
    setCompanyLogoMessage("");
    const result = await uploadTenantLogo(
      companyLogoFile,
      currentUser.tenantId,
    );
    if (!result.url || result.error) {
      setCompanyLogoState("error");
      const rawMessage = result.error ?? "Upload failed.";
      if (rawMessage.toLowerCase().includes("bucket")) {
        setCompanyLogoMessage(
          `Bucket not found. Create a "${process.env.NEXT_PUBLIC_SUPABASE_TENANT_BUCKET || "tenant-logos"}" bucket in Supabase Storage.`,
        );
      } else {
        setCompanyLogoMessage(rawMessage);
      }
      return;
    }
    setCompanyLogoState("uploaded");
    setCompanyLogoMessage("Logo uploaded.");
    setCompanyLogoUrl(result.url);
    setCompanyLogoFile(null);
    if (companyLogoPreview) {
      URL.revokeObjectURL(companyLogoPreview);
      setCompanyLogoPreview(null);
    }
    if (!supabase) {
      return;
    }
    await supabase
      .from("tenants")
      .update({ logo_url: result.url })
      .eq("id", currentUser.tenantId);
  }

  async function handleDeleteCompanyLogo() {
    if (!supabase || !currentUser.tenantId || !companyLogoUrl) {
      return;
    }
    setCompanyLogoState("uploading");
    setCompanyLogoMessage("");
    const storagePath = getStoragePathFromUrl(
      companyLogoUrl,
      supabaseTenantLogoBucket,
    );
    if (storagePath) {
      await supabase.storage
        .from(supabaseTenantLogoBucket)
        .remove([storagePath]);
    }
    const { error } = await supabase
      .from("tenants")
      .update({ logo_url: null })
      .eq("id", currentUser.tenantId);
    if (error) {
      setCompanyLogoState("error");
      setCompanyLogoMessage(error.message);
      return;
    }
    setCompanyLogoUrl("");
    setCompanyLogoFile(null);
    if (companyLogoPreview) {
      URL.revokeObjectURL(companyLogoPreview);
      setCompanyLogoPreview(null);
    }
    setCompanyLogoState("uploaded");
    setCompanyLogoMessage("Logo removed.");
  }

  async function handleResendInvite(email: string) {
    const response = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, mode: "invite" }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setInviteMessage(data.error ?? "Failed to resend invite.");
      return;
    }
    setInviteMessage("Invite sent.");
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
      { id: nextId, label: trimmed },
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
    if (!(await confirmRemove("Remove this attachment category?"))) {
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
    if (!selectedLevelId && selectableLevels[0]?.id) {
      setSelectedLevelId(selectableLevels[0].id);
      return;
    }
    if (
      selectedLevelId &&
      !levels.some((level) => level.id === selectedLevelId)
    ) {
      setSelectedLevelId(selectableLevels[0]?.id ?? "");
    }
  }, [levels, selectableLevels, selectedLevelId]);

  useEffect(() => {
    setNodeParentId("none");
  }, [selectedLevelId]);

  useEffect(() => {
    setLevelOrder(sortedLevels.length + 1);
  }, [sortedLevels.length]);

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
        title: "Transfer ownership?",
        description:
          "This will move Owner access to the selected user and remove Owner from the current one.",
        confirmLabel: "Transfer owner",
        cancelLabel: "Cancel",
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
    setPermissionMessage("Role permissions saved.");
  }

  const selectedLevel = levels.find((level) => level.id === selectedLevelId);
  const selectedLevelOrder = selectedLevel?.order ?? 0;
  const parentLevel = useMemo(
    () =>
      selectableLevels
        .filter((level) => level.order < selectedLevelOrder && level.isActive)
        .at(-1),
    [selectableLevels, selectedLevelOrder],
  );

  const parentNodes = parentLevel
    ? nodes.filter((node) => node.levelId === parentLevel.id)
    : [];
  const currentLevelNodes = nodes.filter(
    (node) => node.levelId === selectedLevelId,
  );

  function resetLevelForm() {
    setLevelName("");
    setLevelRequired(false);
    setLevelActive(true);
    setLevelShowInTable(true);
    setEditingLevelId(null);
  }

  function handleSaveLevel() {
    const trimmedName = levelName.trim();
    if (!trimmedName) {
      return;
    }
    const existingKey = editingLevelId
      ? levels.find((level) => level.id === editingLevelId)?.key
      : undefined;
    const normalizedKey = existingKey || slugify(trimmedName);
    if (editingLevelId) {
      updateLevel(editingLevelId, {
        name: trimmedName,
        key: normalizedKey,
        order: levelOrder,
        isRequired: levelRequired,
        isActive: levelActive,
        showInTable: levelShowInTable,
      });
      resetLevelForm();
      return;
    }

    void addLevel({
      name: trimmedName,
      key: normalizedKey,
      order: levelOrder,
      isRequired: levelRequired,
      isActive: levelActive,
      showInTable: levelShowInTable,
    });
    resetLevelForm();
  }

  function handleEditLevel(levelId: string) {
    const level = levels.find((item) => item.id === levelId);
    if (!level) {
      return;
    }
    setEditingLevelId(levelId);
    setLevelName(level.name);
    setLevelOrder(level.order);
    setLevelRequired(level.isRequired);
    setLevelActive(level.isActive);
    setLevelShowInTable(level.showInTable);
  }

  function resetNodeForm() {
    setNodeLabel("");
    setNodeCode("");
    setNodeParentId("none");
    setEditingNodeId(null);
  }

  function handleSaveNode() {
    if (!selectedLevel) {
      return;
    }
    const trimmedLabel = nodeLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const parentIdValue = nodeParentId === "none" ? null : nodeParentId;
    if (editingNodeId) {
      updateNode(editingNodeId, {
        label: trimmedLabel,
        code: nodeCode.trim() || undefined,
        parentId: parentIdValue,
      });
      resetNodeForm();
      return;
    }
    void addNode({
      levelId: selectedLevel.id,
      label: trimmedLabel,
      code: nodeCode.trim() || undefined,
      parentId: parentIdValue,
    });
    resetNodeForm();
  }

  function handleEditNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    setEditingNodeId(nodeId);
    setNodeLabel(node.label);
    setNodeCode(node.code ?? "");
    setNodeParentId(node.parentId ?? "none");
  }

  async function handleBulkAddNodes() {
    if (!selectedLevel) {
      return;
    }
    const parentIdValue = nodeParentId === "none" ? null : nodeParentId;
    const lines = bulkNodeInput.split(/\r?\n/).map((line) => line.trim());
    const entries = lines.filter(Boolean);
    if (entries.length === 0) {
      return;
    }
    for (const entry of entries) {
      const parts = entry.split(/[|\t;]+/).map((part) => part.trim());
      const label = parts[0];
      if (!label) {
        continue;
      }
      const code = parts[1] || undefined;
      await addNode({
        levelId: selectedLevel.id,
        label,
        code,
        parentId: parentIdValue,
      });
    }
    setBulkNodeInput("");
  }

  async function handleCopyNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const label = `${node.label} copy`;
    await addNode({
      levelId: node.levelId,
      label,
      code: undefined,
      parentId: node.parentId ?? null,
    });
  }

  async function handleDeleteSelectedNodes() {
    if (selectedNodeIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        `Remove ${selectedNodeIds.length} selected item(s) from ${selectedLevel?.name ?? "list"}?`,
      ))
    ) {
      return;
    }
    const ids = [...selectedNodeIds];
    for (const id of ids) {
      await removeNode(id);
    }
    setSelectedNodeIds([]);
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
      unit: target.unit,
      options: target.options,
      isRequired: target.isRequired,
      isActive: target.isActive,
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
    });
  }

  async function handleDeleteSelectedWorkStations() {
    if (selectedWorkStationIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        `Remove ${selectedWorkStationIds.length} selected workstation(s)?`,
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
        `Remove ${selectedStopReasonIds.length} selected reason(s)?`,
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
        `Remove ${selectedPartnerIds.length} selected partner(s)?`,
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
        `Remove ${selectedPartnerGroupIds.length} selected group(s)?`,
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
      : ["Production manager", "Admin", "Owner"];
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
    setExternalJobFieldUnit("");
    setExternalJobFieldOptions("");
    setExternalJobFieldRequired(false);
    setExternalJobFieldActive(true);
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
    const valid = new Set(currentLevelNodes.map((node) => node.id));
    const next = selectedNodeIds.filter((id) => valid.has(id));
    if (next.length !== selectedNodeIds.length) {
      setSelectedNodeIds(next);
    }
  }, [currentLevelNodes, selectedNodeIds]);

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
    if (editingExternalJobFieldId) {
      await updateExternalJobField(editingExternalJobFieldId, {
        label: trimmedLabel,
        fieldType: externalJobFieldType,
        scope: externalJobFieldScope,
        unit: externalJobFieldUnit.trim() || undefined,
        options,
        isRequired: externalJobFieldRequired,
        isActive: externalJobFieldActive,
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
      unit: externalJobFieldUnit.trim() || undefined,
      options,
      isRequired: externalJobFieldRequired,
      isActive: externalJobFieldActive,
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
    setExternalJobFieldUnit(target.unit ?? "");
    setExternalJobFieldOptions((target.options ?? []).join(", "));
    setExternalJobFieldRequired(target.isRequired);
    setExternalJobFieldActive(target.isActive);
    setExternalJobFieldSortOrder(target.sortOrder);
  }

  async function handleDeleteOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    const label = target?.label ?? "this field";
    if (!(await confirmRemove(`Remove "${label}"?`))) {
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
        `Remove ${selectedOrderFieldIds.length} selected field(s)?`,
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
    const label = target?.label ?? "this field";
    if (!(await confirmRemove(`Remove "${label}"?`))) {
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
        `Remove ${selectedExternalJobFieldIds.length} selected field(s)?`,
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
      });
      resetStationForm();
      return;
    }
    await addWorkStation({
      name: trimmedName,
      description: stationDescription.trim() || undefined,
      isActive: true,
      sortOrder: displayStations.length,
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

  const [activeTab, setActiveTab] = useState("structure");
  const [isMobileSectionsOpen, setIsMobileSectionsOpen] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab && settingsSections.some((section) => section.value === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

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

  const activeSectionLabel =
    settingsSections.find((section) => section.value === activeTab)?.label ??
    "Settings";
  const activeSectionSubtitle =
    settingsSectionSubtitles[
      (settingsSections.find((section) => section.value === activeTab)?.value ??
        "structure") as SettingsSectionValue
    ];

  return (
    <section className="space-y-0 pt-16 md:space-y-4 md:pt-0">
      <div className="fixed bottom-[calc(6.75rem+env(safe-area-inset-bottom))] right-4 z-40 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg"
          onClick={() => setIsMobileSectionsOpen(true)}
          aria-label="Open settings sections"
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
        onValueChange={setActiveTab}
        className="space-y-0 md:space-y-4"
      >
        <DesktopPageHeader
          sticky
          title={activeSectionLabel}
          subtitle={activeSectionSubtitle}
          className="md:z-20"
          actions={
            <TabsList className="justify-start overflow-x-auto flex-nowrap">
              {settingsSections.map((section) => (
                <TabsTrigger
                  key={section.value}
                  value={section.value}
                  className="gap-2"
                >
                  <section.icon className="h-4 w-4" />
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        />

        {
          <>
            <BottomSheet
              id="settings-sections-drawer"
              open={isMobileSectionsOpen}
              onClose={() => setIsMobileSectionsOpen(false)}
              ariaLabel="Settings sections"
              closeButtonLabel="Close settings sections"
              title="Settings sections"
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
                          setActiveTab(section.value);
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
                          {section.label}
                        </span>
                        {isActive ? (
                          <span className="text-xs">Active</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </BottomSheet>
          </>
        }

        <TabsContent value="structure">
          <div className="space-y-6">
            {isSettingsDataLoading ? (
              <Card className="min-w-0">
                <CardContent className="py-10">
                  <LoadingSpinner label="Loading structure settings..." />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>Hierarchy Levels</CardTitle>
                <CardDescription>
                  Define the order of fields users select when creating orders.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(200px,1.2fr)_minmax(120px,0.5fr)_minmax(240px,1fr)_auto] lg:items-end">
                  <InputField
                    label="Level name"
                    value={levelName}
                    onChange={(event) => {
                      setLevelName(event.target.value);
                    }}
                    placeholder="Contract"
                    className="h-10 text-sm"
                  />
                  <InputField
                    label="Order"
                    type="number"
                    min={1}
                    value={levelOrder}
                    onChange={(event) =>
                      setLevelOrder(Number(event.target.value) || 1)
                    }
                    className="h-10 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <Checkbox
                      checked={levelRequired}
                      onChange={(event) => setLevelRequired(event.target.checked)}
                      label="Required"
                    />
                    <Checkbox
                      checked={levelActive}
                      onChange={(event) => setLevelActive(event.target.checked)}
                      label="Active"
                    />
                    <Checkbox
                      checked={levelShowInTable}
                      onChange={(event) =>
                        setLevelShowInTable(event.target.checked)
                      }
                      label="Show in table"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveLevel}>
                      {editingLevelId ? "Save level" : "Add level"}
                    </Button>
                    {editingLevelId && (
                      <Button variant="outline" onClick={resetLevelForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Default meanings (do not repurpose): Contract, Product
                  category, Product, Sales management, Engineering. You can
                  rename the labels, but keep their meaning.
                </p>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Level
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Order
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Required
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Active
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          In table
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLevels.map((level) => (
                        <tr key={level.id} className="border-t border-border">
                          <td className="px-4 py-2">
                            <div className="font-medium">
                              {level.name}
                              {lockedLevelKeys.has(level.key) && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  Default
                                </span>
                              )}
                            </div>
                            {lockedLevelKeys.has(level.key) &&
                              defaultLevelDescriptions[level.key] && (
                                <div className="text-xs text-muted-foreground">
                                  {defaultLevelDescriptions[level.key]}
                                </div>
                              )}
                          </td>
                          <td className="px-4 py-2">{level.order}</td>
                          <td className="px-4 py-2">
                            <Checkbox
                              checked={level.isRequired}
                              onChange={(event) =>
                                updateLevel(level.id, {
                                  isRequired: event.target.checked,
                                })
                              }
                              label={level.isRequired ? "Yes" : "No"}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Checkbox
                              checked={level.isActive}
                              onChange={(event) =>
                                updateLevel(level.id, {
                                  isActive: event.target.checked,
                                })
                              }
                              label={level.isActive ? "Active" : "Hidden"}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Checkbox
                              checked={level.showInTable}
                              onChange={(event) =>
                                updateLevel(level.id, {
                                  showInTable: event.target.checked,
                                })
                              }
                              label={level.showInTable ? "Shown" : "Hidden"}
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditLevel(level.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (
                                    !(await confirmRemove(
                                      `Remove level "${level.name}"?`,
                                    ))
                                  ) {
                                    return;
                                  }
                                  removeLevel(level.id);
                                }}
                                disabled={lockedLevelKeys.has(level.key)}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sortedLevels.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            Add your first hierarchy level.
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
                <CardTitle>Reference Lists</CardTitle>
                <CardDescription>
                  Maintain the selectable values for each hierarchy level.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <SelectField label="Level" value={selectedLevelId} onValueChange={setSelectedLevelId}>
                    <Select
                      value={selectedLevelId}
                      onValueChange={setSelectedLevelId}
                    >
                      <SelectTrigger className="h-10 min-w-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableLevels.map((level) => (
                          <SelectItem key={level.id} value={level.id}>
                            {level.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  {parentLevel && (
                    <SelectField
                      label={`Parent (${parentLevel.name})`}
                      value={nodeParentId}
                      onValueChange={setNodeParentId}
                    >
                      <Select
                        value={nodeParentId}
                        onValueChange={setNodeParentId}
                      >
                        <SelectTrigger className="h-10 min-w-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No parent</SelectItem>
                          {parentNodes.map((node) => (
                            <SelectItem key={node.id} value={node.id}>
                              {node.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SelectField>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.6fr)_auto] lg:items-end">
                  <InputField
                    label="Label"
                    value={nodeLabel}
                    onChange={(event) => setNodeLabel(event.target.value)}
                    placeholder="Enter label"
                    className="h-10 text-sm"
                  />
                  <InputField
                    label="Code (optional)"
                    value={nodeCode}
                    onChange={(event) => setNodeCode(event.target.value)}
                    placeholder="Optional code"
                    className="h-10 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveNode}>
                      {editingNodeId ? "Save item" : "Add item"}
                    </Button>
                    {editingNodeId && (
                      <Button variant="outline" onClick={resetNodeForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                  <TextAreaField
                    label="Bulk add (one per line)"
                    value={bulkNodeInput}
                    onChange={(event) => setBulkNodeInput(event.target.value)}
                    placeholder="PE 40 Durvis\nPE 40 Vitrina\nPE 40 Logs"
                    className="min-h-30"
                    description={
                      <>
                        Optional code: use &quot;Label | Code&quot; or
                        &quot;Label;Code&quot;.
                      </>
                    }
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleBulkAddNodes}>Add list</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {selectedNodeIds.length > 0
                      ? `${selectedNodeIds.length} selected`
                      : " "}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteSelectedNodes}
                    disabled={selectedNodeIds.length === 0}
                  >
                    Remove selected
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Code
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Parent
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <span>Actions</span>
                            <Checkbox
                              variant="box"
                              checked={
                                currentLevelNodes.length > 0 &&
                                selectedNodeIds.length === currentLevelNodes.length
                              }
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedNodeIds(
                                    currentLevelNodes.map((node) => node.id),
                                  );
                                } else {
                                  setSelectedNodeIds([]);
                                }
                              }}
                              disabled={currentLevelNodes.length === 0}
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentLevelNodes.map((node) => (
                        <tr key={node.id} className="border-t border-border">
                          <td className="px-4 py-2 font-medium">
                            {node.label}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {node.code ?? "--"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {node.parentId
                              ? (nodes.find((item) => item.id === node.parentId)
                                  ?.label ?? "--")
                              : "--"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditNode(node.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyNode(node.id)}
                              >
                                Copy
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (
                                    !(await confirmRemove(
                                      `Remove "${node.label}" from ${selectedLevel?.name ?? "list"}?`,
                                    ))
                                  ) {
                                    return;
                                  }
                                  removeNode(node.id);
                                }}
                              >
                                Remove
                              </Button>
                              <Checkbox
                                variant="box"
                                checked={selectedNodeIds.includes(node.id)}
                                onChange={(event) => {
                                  setSelectedNodeIds((prev) => {
                                    if (event.target.checked) {
                                      return [...prev, node.id];
                                    }
                                    return prev.filter((id) => id !== node.id);
                                  });
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {currentLevelNodes.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            Add items for this level.
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
                <CardTitle>Order inputs</CardTitle>
                <CardDescription>
                  Configure the additional fields shown in the order view.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderInputFields.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    No order inputs yet. Add defaults to get started.
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={ensureDefaultOrderInputFields}
                      >
                        Add default fields
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-[minmax(200px,1.2fr)_minmax(160px,0.6fr)_minmax(160px,0.6fr)_minmax(120px,0.4fr)_auto] lg:items-end">
                  <InputField
                    label="Label"
                    value={orderFieldLabel}
                    onChange={(event) => setOrderFieldLabel(event.target.value)}
                    placeholder="Construction count"
                    className="h-10 text-sm"
                  />
                  <SelectField
                    label="Group"
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
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <SelectField
                    label="Type"
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
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <InputField
                    label="Order"
                    type="number"
                    value={orderFieldSortOrder}
                    onChange={(event) =>
                      setOrderFieldSortOrder(Number(event.target.value) || 0)
                    }
                    className="h-10 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveOrderField}>
                      {editingOrderFieldId ? "Save field" : "Add field"}
                    </Button>
                    {editingOrderFieldId && (
                      <Button variant="outline" onClick={resetOrderFieldForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <InputField
                    label="Unit (optional)"
                    value={orderFieldUnit}
                    onChange={(event) => setOrderFieldUnit(event.target.value)}
                    placeholder="pcs"
                    className="h-10 text-sm"
                  />
                  <TextAreaField
                    label='Select options (comma, newline, or "\\\\" separated)'
                    value={orderFieldOptions}
                    onChange={(event) => setOrderFieldOptions(event.target.value)}
                    disabled={orderFieldType !== "select"}
                    placeholder="Dealer, Private, Partner"
                    className="min-h-20 disabled:opacity-50"
                  />
                </div>

                {orderFieldType === "table" && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">Table columns</div>
                      <div className="text-xs text-muted-foreground">
                        Drag rows to reorder columns
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addOrderFieldColumn}
                      >
                        Add column
                      </Button>
                    </div>
                    {orderFieldColumns.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Add at least one column for this table field.
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
                                title="Drag to reorder"
                              >
                                ||
                              </div>
                              <InputField
                                label="Label"
                                value={column.label}
                                onChange={(event) =>
                                  updateOrderFieldColumn(index, {
                                    label: event.target.value,
                                  })
                                }
                                placeholder="Position"
                                className="h-9 text-sm"
                                labelClassName="text-xs font-medium"
                              />
                              <InputField
                                label="AI key (optional)"
                                value={column.aiKey ?? ""}
                                onChange={(event) =>
                                  updateOrderFieldColumn(index, {
                                    aiKey: event.target.value,
                                  })
                                }
                                placeholder="construction"
                                className="h-9 text-sm"
                                labelClassName="text-xs font-medium"
                              />
                              <SelectField
                                label="Type"
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
                                          {option.label}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </SelectField>
                              <InputField
                                label="Unit"
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
                                <div className="text-xs font-medium">Required</div>
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
                                        "Remove this column?",
                                      ))
                                    ) {
                                      return;
                                    }
                                    removeOrderFieldColumn(index);
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                            {column.fieldType === "select" && (
                              <div className="grid gap-2 md:grid-cols-[1fr_160px] md:items-end">
                                <TextAreaField
                                  label='Options (comma, newline, or "\\\\" separated)'
                                  value={(column.options ?? []).join("\n")}
                                  onChange={(event) =>
                                    updateOrderFieldColumn(index, {
                                      options: parseOrderFieldOptions(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                  placeholder="Type A, Type B"
                                  className="min-h-17.5 rounded-md px-2 py-2 text-sm"
                                  labelClassName="text-xs font-medium"
                                />
                                <label className="flex flex-col gap-1 text-xs font-medium">
                                  Max selects (1-3)
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
                                    className="h-9 rounded-md border border-border bg-input-background px-2 text-sm"
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
                    label="Required"
                  />
                  <Checkbox
                    checked={orderFieldActive}
                    onChange={(event) =>
                      setOrderFieldActive(event.target.checked)
                    }
                    label="Active"
                  />
                  <Checkbox
                    checked={orderFieldShowInProduction}
                    onChange={(event) =>
                      setOrderFieldShowInProduction(event.target.checked)
                    }
                    label="Show in production"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {selectedOrderFieldIds.length > 0
                      ? `${selectedOrderFieldIds.length} selected`
                      : " "}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteSelectedOrderFields}
                    disabled={selectedOrderFieldIds.length === 0}
                  >
                    Remove selected
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Group
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Order
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Required
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Active
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Production
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <span>Actions</span>
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
                            No order inputs configured.
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
                              {field.isRequired ? "Yes" : "No"}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.isActive ? "Yes" : "No"}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.showInProduction ? "Yes" : "No"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditOrderField(field.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCopyOrderField(field.id)}
                                >
                                  Copy
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleDeleteOrderField(field.id)
                                  }
                                >
                                  Remove
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

        <TabsContent value="operations" className="min-w-0 overflow-x-hidden">
          <div className="min-w-0 space-y-6 overflow-x-hidden">
            {isSettingsDataLoading || isTenantSettingsLoading ? (
              <Card>
                <CardContent className="py-10">
                  <LoadingSpinner label="Loading production settings..." />
                </CardContent>
              </Card>
            ) : null}
            <div className="grid min-w-0 gap-6 lg:grid-cols-2 *:min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Working hours</CardTitle>
                  <CardDescription>
                    Define workdays and shifts used for production timing and
                    start/stop duration calculations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Workdays</label>
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
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Shifts</label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddShift}
                      >
                        Add shift
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
                          Remove
                        </Button>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground">
                      Overnight shift is supported, for example 22:00 to 06:00.
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
                      {isWorkdaySaving ? "Saving..." : "Save hours"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Work Stations</CardTitle>
                  <CardDescription>
                    Manage the list of production stations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(240px,1.2fr)_auto] lg:items-end">
                    <InputField
                      label="Station name"
                      value={stationName}
                      onChange={(event) => setStationName(event.target.value)}
                      placeholder="Cutting"
                      className="h-10 text-sm"
                    />
                    <InputField
                      label="Description"
                      value={stationDescription}
                      onChange={(event) =>
                        setStationDescription(event.target.value)
                      }
                      placeholder="Sawing and prep"
                      className="h-10 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleSaveStation}>
                        {editingStationId ? "Save station" : "Add station"}
                      </Button>
                      {editingStationId && (
                        <Button variant="outline" onClick={resetStationForm}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm text-muted-foreground">
                      {selectedWorkStationIds.length > 0
                        ? `${selectedWorkStationIds.length} selected`
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
                        Select all
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDeleteSelectedWorkStations}
                        disabled={selectedWorkStationIds.length === 0}
                      >
                        Remove selected
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {displayStations.map((station, index) => (
                      <div
                        key={station.id}
                        className="flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-lg border border-border px-4 py-3"
                        draggable
                        onDragStart={() => setDragStationId(station.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleStationDrop(station.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full h-6 w-6 flex justify-center items-center border border-border text-xs text-muted-foreground">
                              {index + 1}
                            </span>
                            <span className="font-medium wrap-break-word">
                              {station.name}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground wrap-break-word">
                            {station.description ?? "No description"}
                          </div>
                        </div>
                        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              
                              checked={station.isActive}
                              onChange={(event) =>
                                updateWorkStation(station.id, {
                                  isActive: event.target.checked,
                                })
                              }
                             />
                            Active
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditStation(station.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyWorkStation(station.id)}
                          >
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (
                                !(await confirmRemove(
                                  `Remove workstation "${station.name}"?`,
                                ))
                              ) {
                                return;
                              }
                              removeWorkStation(station.id);
                            }}
                          >
                            Remove
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
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>QR label settings</CardTitle>
                  <CardDescription>
                    Configure the default QR label layout for production.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Label sizes</div>
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
                              {option.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Default size</div>
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
                                {option.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        Used as the default print format in Production.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Content fields</div>
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
                            )[option.value]?.label ?? option.label}
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
                        ? "Saving..."
                        : "Save QR settings"}
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
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>
                    Choose who receives system notifications about blocked and
                    resumed work.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {[
                      "Production manager",
                      "Admin",
                      "Owner",
                      "Production",
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
                        {role}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSaveNotificationRoles}
                      disabled={notificationState === "saving"}
                    >
                      {notificationState === "saving"
                        ? "Saving..."
                        : "Save notification roles"}
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
                  <CardTitle>Station dependencies</CardTitle>
                  <CardDescription>
                    Define which stations must finish before another can start.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {displayStations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      Add work stations to configure dependencies.
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
                                No other stations available.
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
                  <CardTitle>Operator station assignments</CardTitle>
                  <CardDescription>
                    Assign users to one or more stations for the operator view.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {operatorAssignmentsError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                      {operatorAssignmentsError}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left">User</th>
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
                                label="Loading assignments..."
                              />
                            </td>
                          </tr>
                        ) : users.length === 0 ? (
                          <tr>
                            <td
                              colSpan={Math.max(1, displayStations.length + 1)}
                              className="px-4 py-6 text-center text-muted-foreground"
                            >
                              No users found.
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
                                        Assigned
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
                <CardTitle>Stop Reasons</CardTitle>
                <CardDescription>
                  Reasons appear when a station pauses a task.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
                  <InputField
                    label="Reason"
                    value={stopReasonLabel}
                    onChange={(event) => setStopReasonLabel(event.target.value)}
                    placeholder="Missing material"
                    className="h-10 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveStopReason}>
                      {editingStopReasonId ? "Save reason" : "Add reason"}
                    </Button>
                    {editingStopReasonId && (
                      <Button variant="outline" onClick={resetStopReasonForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm text-muted-foreground">
                      {selectedStopReasonIds.length > 0
                        ? `${selectedStopReasonIds.length} selected`
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
                        Select all
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDeleteSelectedStopReasons}
                        disabled={selectedStopReasonIds.length === 0}
                      >
                        Remove selected
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
                          Active
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditStopReason(reason.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyStopReason(reason.id)}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (
                              !(await confirmRemove(
                                `Remove reason "${reason.label}"?`,
                              ))
                            ) {
                              return;
                            }
                            removeStopReason(reason.id);
                          }}
                        >
                          Remove
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
                  <LoadingSpinner label="Loading partner settings..." />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>Partners</CardTitle>
                <CardDescription>
                  Maintain external suppliers for outsourced steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 space-y-4">
                <div className="border-t border-border pt-4 pb-8">
                  <div className="text-sm font-medium">Partner groups</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                    <InputField
                      label="Group name"
                      value={partnerGroupName}
                      onChange={(event) =>
                        setPartnerGroupName(event.target.value)
                      }
                      placeholder="Glass"
                      className="h-10 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleSavePartnerGroup}>
                        {editingPartnerGroupId ? "Save group" : "Add group"}
                      </Button>
                      {editingPartnerGroupId && (
                        <Button
                          variant="outline"
                          onClick={resetPartnerGroupForm}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-muted-foreground">
                        {selectedPartnerGroupIds.length > 0
                          ? `${selectedPartnerGroupIds.length} selected`
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
                          Select all
                        </label>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDeleteSelectedPartnerGroups}
                          disabled={selectedPartnerGroupIds.length === 0}
                        >
                          Remove selected
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
                            Active
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditPartnerGroup(group.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyPartnerGroup(group.id)}
                          >
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (
                                !(await confirmRemove(
                                  `Remove group "${group.name}"?`,
                                ))
                              ) {
                                return;
                              }
                              removePartnerGroup(group.id);
                            }}
                          >
                            Remove
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
                        No partner groups yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border pt-4 grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_auto] lg:items-end">
                  <InputField
                    label="Partner name"
                    value={partnerName}
                    onChange={(event) => setPartnerName(event.target.value)}
                    placeholder="Baltic Glass"
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
                    label="Phone"
                    value={partnerPhone}
                    onChange={(event) => setPartnerPhone(event.target.value)}
                    placeholder="+371 2xxxxxxx"
                    className="h-10 text-sm"
                  />
                  <SelectField
                    label="Group"
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
                        <SelectItem value="__none__">No group</SelectItem>
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
                      {editingPartnerId ? "Save partner" : "Add partner"}
                    </Button>
                    {editingPartnerId && (
                      <Button variant="outline" onClick={resetPartnerForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground">
                      {selectedPartnerIds.length > 0
                        ? `${selectedPartnerIds.length} selected`
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
                        Select all
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDeleteSelectedPartners}
                        disabled={selectedPartnerIds.length === 0}
                      >
                        Remove selected
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
                              )?.name ?? "Group")
                            : "No group"}
                        </div>
                        {(partner.email || partner.phone) && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {partner.email ? `Email: ${partner.email}` : ""}
                            {partner.email && partner.phone ? " • " : ""}
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
                          Active
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPartner(partner.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyPartner(partner.id)}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (
                              !(await confirmRemove(
                                `Remove partner "${partner.name}"?`,
                              ))
                            ) {
                              return;
                            }
                            removePartner(partner.id);
                          }}
                        >
                          Remove
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
                      No partners yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>External job schema</CardTitle>
                <CardDescription>
                  Configure the fields captured for outsourced jobs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {externalJobFields.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    No external job fields yet. Add your first field to start.
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  Add or edit the fields shown on external job forms.
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(140px,0.6fr)_minmax(190px,0.7fr)_minmax(120px,0.4fr)_auto] lg:items-end">
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
                    onValueChange={(value) =>
                      setExternalJobFieldType(value as ExternalJobFieldType)
                    }
                  >
                    <Select
                      value={externalJobFieldType}
                      onValueChange={(value) =>
                        setExternalJobFieldType(value as ExternalJobFieldType)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {externalJobFieldTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                            {option.label}
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

                <div className="grid gap-3 md:grid-cols-2">
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
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {selectedExternalJobFieldIds.length > 0
                      ? `${selectedExternalJobFieldIds.length} selected`
                      : " "}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteSelectedExternalJobFields}
                    disabled={selectedExternalJobFieldIds.length === 0}
                  >
                    Remove selected
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Scope
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Unit
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Order
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Required
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Active
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <span>Actions</span>
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
                                    sortedExternalJobFields.map(
                                      (field) => field.id,
                                    ),
                                  );
                                } else {
                                  setSelectedExternalJobFieldIds([]);
                                }
                              }}
                             />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedExternalJobFields.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            No external job fields configured.
                          </td>
                        </tr>
                      ) : (
                        sortedExternalJobFields.map((field) => (
                          <tr key={field.id} className="border-t border-border">
                            <td className="px-4 py-2">
                              <div className="font-medium">{field.label}</div>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {externalJobFieldTypeOptions.find(
                                (option) => option.value === field.fieldType,
                              )?.label ?? field.fieldType}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {externalJobFieldScopeOptions.find(
                                (option) =>
                                  option.value === (field.scope ?? "manual"),
                              )?.label ?? "Manual entry"}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.unit || "--"}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.sortOrder}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.isRequired ? "Yes" : "No"}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {field.isActive ? "Yes" : "No"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleEditExternalJobField(field.id)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleCopyExternalJobField(field.id)
                                  }
                                >
                                  Copy
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleDeleteExternalJobField(field.id)
                                  }
                                >
                                  Remove
                                </Button>
                                <Checkbox
                                  variant="box"
                                  
                                  checked={selectedExternalJobFieldIds.includes(
                                    field.id,
                                  )}
                                  onChange={(event) => {
                                    setSelectedExternalJobFieldIds((prev) => {
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

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Access</CardTitle>
              <CardDescription>
                Manage who can access this workspace and their role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isUsersLoading || isInvitesLoading || rolePermissionsLoading ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <LoadingSpinner label="Loading user access settings..." />
                </div>
              ) : null}
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-sm font-medium">Invite user</div>
                <div className="mt-3 grid gap-3 items-center md:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(140px,0.5fr)_auto] md:items-end">
                  <InputField
                    label="Email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="user@company.com"
                    className="h-10 w-full text-sm"
                    disabled={!canManageRolePermissions}
                  />
                  <InputField
                    label="Full name"
                    value={inviteFullName}
                    onChange={(event) =>
                      setInviteFullName(event.target.value)
                    }
                    placeholder="Full name"
                    className="h-10 w-full text-sm"
                    disabled={!canManageRolePermissions}
                  />
                  <SelectField
                    label="Role"
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
                            {roleOption}
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
                    {inviteState === "sending" ? "Sending..." : "Send invite"}
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
                  Only Admin and Owner can update user roles or admin access.
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
                    Dev override: allow changing your own role
                  </label>
                )}
              {usersError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {usersError}
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Name</th>
                      <th className="px-4 py-2 text-left font-medium">Role</th>
                      <th className="px-4 py-2 text-left font-medium">Owner</th>
                      <th className="px-4 py-2 text-left font-medium">Admin</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isUsersLoading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          <LoadingSpinner
                            className="justify-center"
                            label="Loading users..."
                          />
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="border-t border-border">
                          <td className="px-4 py-2 font-medium">{user.name}</td>
                          <td className="px-4 py-2">
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
                                  <SelectItem
                                    key={roleOption}
                                    value={roleOption}
                                  >
                                    {roleOption === "Admin"
                                      ? "Admin (legacy)"
                                      : roleOption}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-xs text-foreground">
                              <Checkbox
                                
                                checked={user.isOwner}
                                onChange={(event) =>
                                  handleUpdateUserOwner(
                                    user.id,
                                    event.target.checked,
                                  )
                                }
                                disabled={
                                  user.isOwner || !canManageRolePermissions
                                }
                               />
                              Owner
                            </label>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-xs text-foreground">
                              <Checkbox
                                
                                checked={user.isOwner || user.isAdmin}
                                onChange={(event) =>
                                  handleUpdateUserAdmin(
                                    user.id,
                                    event.target.checked,
                                  )
                                }
                                disabled={
                                  user.isOwner || !canManageRolePermissions
                                }
                               />
                              Admin
                            </label>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                            {updatingUserId === user.id ? "Saving..." : ""}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Role permissions</div>
                    <div className="text-xs text-muted-foreground">
                      RBAC rules saved in database and used across UI + server.
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
                    {permissionState === "saving" ? "Saving..." : "Save RBAC"}
                  </Button>
                </div>
                {rolePermissionsLoading ? (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
                    <LoadingSpinner label="Loading RBAC..." />
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
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Permission
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
              <div className="space-y-2">
                <div className="text-sm font-medium">Invites</div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
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
                              label="Loading invites..."
                            />
                          </td>
                        </tr>
                      ) : invites.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            No invites yet.
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
                              {invite.acceptedAt ? "Accepted" : "Pending"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleResendInvite(invite.email)
                                  }
                                  disabled={
                                    invite.acceptedAt !== null ||
                                    !canManageRolePermissions
                                  }
                                >
                                  Resend
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
                                  Cancel
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
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
              <CardTitle>Workflow Rules</CardTitle>
              <CardDescription>
                Define what must be complete before moving orders forward.
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
                  <LoadingSpinner label="Syncing workflow rules..." />
                </div>
              ) : null}
              <div className="grid gap-6">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">Core rules</div>
                  <div className="mt-3 grid gap-4 lg:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium">
                      Min attachments for engineering
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
                      Min attachments for production
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
                      Due soon threshold (days)
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
                      Require comment before engineering
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
                      Require comment before production
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
                      Require order inputs before engineering
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
                      Require order inputs before production
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
                      Enable due date indicators
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
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-sm font-semibold">
                      Order status configuration
                    </div>
                    <div className="mt-2 space-y-2">
                      {workflowStatusOptions.map((option) => {
                        const config = orderStatusConfigDrafts[option.value];
                        const previewLabel =
                          config?.label?.trim() || option.label;
                        return (
                          <div
                            key={option.value}
                            className="rounded-lg border border-border bg-background/50 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">
                                {option.label}
                              </div>
                              <span
                                className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getStatusBadgeColorClass(config?.color)}`}
                              >
                                {previewLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={config?.label ?? option.label}
                                onChange={(event) =>
                                  setOrderStatusConfigDrafts((prev) => ({
                                    ...prev,
                                    [option.value]: {
                                      ...prev[option.value],
                                      label: event.target.value,
                                    },
                                  }))
                                }
                                className="h-9 min-w-45 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
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
                                        {colorOption.label}
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
                                    Required
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
                                <span>Active</span>
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
                        Reset
                      </Button>
                      <Button
                        onClick={handleSaveStatusLabels}
                        disabled={
                          !hasStatusLabelChanges ||
                          statusLabelState === "saving"
                        }
                      >
                        {statusLabelState === "saving"
                          ? "Saving..."
                          : "Save order statuses"}
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
                      External job status configuration
                    </div>
                    <div className="mt-2 space-y-2">
                      {externalJobStatusOptions.map((option) => {
                        const config =
                          externalJobStatusConfigDrafts[option.value];
                        const previewLabel =
                          config?.label?.trim() || option.label;
                        return (
                          <div
                            key={option.value}
                            className="rounded-lg border border-border bg-background/50 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">
                                {option.label}
                              </div>
                              <span
                                className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getStatusBadgeColorClass(config?.color)}`}
                              >
                                {previewLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={config?.label ?? option.label}
                                onChange={(event) =>
                                  setExternalJobStatusConfigDrafts((prev) => ({
                                    ...prev,
                                    [option.value]: {
                                      ...prev[option.value],
                                      label: event.target.value,
                                    },
                                  }))
                                }
                                className="h-9 min-w-45 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
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
                                        {colorOption.label}
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
                                    Required
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
                                <span>Active</span>
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
                        Reset
                      </Button>
                      <Button
                        onClick={handleSaveExternalJobStatusLabels}
                        disabled={
                          !hasExternalJobStatusLabelChanges ||
                          externalJobStatusLabelState === "saving"
                        }
                      >
                        {externalJobStatusLabelState === "saving"
                          ? "Saving..."
                          : "Save external statuses"}
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
                      Assignment labels
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm font-medium">
                        Engineer
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
                        Manager
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
                        Reset
                      </Button>
                      <Button
                        onClick={handleSaveAssignmentLabels}
                        disabled={
                          !hasAssignmentLabelChanges ||
                          assignmentLabelState === "saving"
                        }
                      >
                        {assignmentLabelState === "saving"
                          ? "Saving..."
                          : "Save assignment labels"}
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
                  <div className="text-sm font-semibold">Attachments</div>
                  <div className="mt-3 grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        Attachment categories
                      </div>
                      <div className="grid gap-3">
                        {attachmentCategoryDrafts.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center gap-2"
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveAttachmentCategory(category.id)
                              }
                              disabled={attachmentCategoryDrafts.length <= 1}
                            >
                              Remove
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
                          placeholder="Add category"
                          className="h-10 min-w-50 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                        />
                        <Button onClick={handleAddAttachmentCategory}>
                          Add category
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        Default category by role
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {attachmentRoles.map((role) => (
                          <SelectField
                            key={role}
                            label={role}
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
                        New uploads will default to the selected category for
                        each role.
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
                      Reset
                    </Button>
                    <Button
                      onClick={handleSaveAttachmentCategories}
                      disabled={
                        !hasAttachmentCategoryChanges ||
                        attachmentCategoryState === "saving"
                      }
                    >
                      {attachmentCategoryState === "saving"
                        ? "Saving..."
                        : "Save attachment categories"}
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
                    Saving station order...
                  </div>
                ) : null}

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">Checklist items</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                    <div className="space-y-2">
                      <Input
                        value={newChecklistLabel}
                        onChange={(event) =>
                          setNewChecklistLabel(event.target.value)
                        }
                        placeholder="Checklist item"
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
                        Add item
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
                          Required for engineering
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
                          Required for production
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
                            Eng.
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
                            Prod.
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
                            Active
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (
                                !(await confirmRemove(
                                  `Remove checklist item "${item.label}"?`,
                                ))
                              ) {
                                return;
                              }
                              removeChecklistItem(item.id);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                    {rules.checklistItems.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        No checklist items yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-1">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-sm font-semibold">Return reasons</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Input
                        value={newReturnReason}
                        onChange={(event) =>
                          setNewReturnReason(event.target.value)
                        }
                        placeholder="Add reason"
                        className="h-10 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                      <Button
                        onClick={() => {
                          addReturnReason(newReturnReason);
                          setNewReturnReason("");
                        }}
                      >
                        Add reason
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
                                  `Remove reason "${reason}"?`,
                                ))
                              ) {
                                return;
                              }
                              removeReturnReason(reason);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      {rules.returnReasons.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                          No return reasons yet.
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
                  <LoadingSpinner label="Loading integration settings..." />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>Outbound Email Sender</CardTitle>
                <CardDescription>
                  Configure tenant sender identity for partner emails.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    From name
                    <Input
                      value={outboundFromName}
                      onChange={(event) =>
                        setOutboundFromName(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder={companyName || "Company"}
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    From email (tenant domain)
                    <Input
                      type="email"
                      value={outboundFromEmail}
                      onChange={(event) =>
                        setOutboundFromEmail(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder="orders@your-company.com"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Default reply-to
                    <Input
                      type="email"
                      value={outboundReplyToEmail}
                      onChange={(event) =>
                        setOutboundReplyToEmail(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder="engineering@your-company.com"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <div className="space-y-2 text-sm font-medium">
                    Sender mode
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox
                        
                        checked={outboundUseUserSender}
                        onChange={(event) =>
                          setOutboundUseUserSender(event.target.checked)
                        }
                        disabled={!currentUser.isAdmin}
                       />
                      Use engineer email as sender when domain matches
                    </label>
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox
                        
                        checked={outboundSenderVerified}
                        onChange={(event) =>
                          setOutboundSenderVerified(event.target.checked)
                        }
                        disabled={!currentUser.isAdmin}
                       />
                      Domain is verified in Resend
                    </label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Until tenant domain is verified, emails fallback to global
                  sender. Reply-to still points to engineer when available.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleSaveOutboundEmail}
                    disabled={
                      !currentUser.isAdmin || outboundState === "saving"
                    }
                  >
                    {outboundState === "saving"
                      ? "Saving..."
                      : "Save outbound email"}
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
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  Orders can sync from accounting tools to PWS - coming soon.
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
                      {integration.status}
                    </span>
                  </div>
                ))}
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Expected flow: accounting order to PWS to production stations.
                </div>
                <Button variant="outline" className="w-full">
                  Request integration
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <BottomSheet
        open={isSecurityPromptOpen}
        onClose={closeSecurityPrompt}
        ariaLabel="Security verification"
        title="Confirm your password"
        closeButtonLabel="Close verification"
        enableSwipeToClose
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            Re-enter your password to confirm Owner/Admin permission changes.
          </p>
          <label className="space-y-2 text-sm font-medium">
            Password
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
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSecurityVerification}
              disabled={securityState === "verifying"}
            >
              {securityState === "verifying" ? "Verifying..." : "Confirm"}
            </Button>
          </div>
        </div>
      </BottomSheet>
      {isSecurityPromptOpen ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Confirm your password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Re-enter your password to confirm Owner/Admin permission changes.
            </p>
            <label className="mt-4 block space-y-2 text-sm font-medium">
              Password
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
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSecurityVerification}
                disabled={securityState === "verifying"}
              >
                {securityState === "verifying" ? "Verifying..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
