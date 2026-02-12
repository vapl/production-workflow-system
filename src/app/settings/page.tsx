"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useHierarchy } from "./HierarchyContext";
import { useSettingsData } from "@/hooks/useSettingsData";
import { useCurrentUser, type UserRole } from "@/contexts/UserContext";
import { supabase, supabaseTenantLogoBucket } from "@/lib/supabaseClient";
import { uploadTenantLogo } from "@/lib/uploadTenantLogo";
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
} from "@/contexts/WorkflowContext";
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

const userRoleOptions: UserRole[] = ["Sales", "Engineering", "Production"];

function normalizeUserRole(value?: string | null): UserRole {
  return userRoleOptions.includes(value as UserRole)
    ? (value as UserRole)
    : "Sales";
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
];

type AttachmentRole = UserRole | "Admin";

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

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
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
  const sortedExternalJobFields = useMemo(
    () => {
      const uniqueById = Array.from(
        new Map(externalJobFields.map((field) => [field.id, field])).values(),
      );
      return uniqueById.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.label.localeCompare(b.label);
      });
    },
    [externalJobFields],
  );

  const [stationName, setStationName] = useState("");
  const [stationDescription, setStationDescription] = useState("");
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [dragStationId, setDragStationId] = useState<string | null>(null);
  const [isStationOrderSaving, setIsStationOrderSaving] = useState(false);
  const [workdayStart, setWorkdayStart] = useState("08:00");
  const [workdayEnd, setWorkdayEnd] = useState("17:00");
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
    { id: string; name: string; role: UserRole; isAdmin: boolean }[]
  >([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
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
    "Production",
    "Admin",
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
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadWorkHours = async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select(
          "workday_start, workday_end, qr_enabled_sizes, qr_default_size, qr_content_fields, notification_roles",
        )
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      if (data.workday_start) {
        setWorkdayStart(data.workday_start);
      }
      if (data.workday_end) {
        setWorkdayEnd(data.workday_end);
      }
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
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistRequired, setNewChecklistRequired] = useState<
    WorkflowTargetStatus[]
  >(["ready_for_engineering"]);
  const [newReturnReason, setNewReturnReason] = useState("");
  const [statusLabelDrafts, setStatusLabelDrafts] = useState<
    Record<OrderStatus, string>
  >(rules.statusLabels);
  const [externalJobStatusLabelDrafts, setExternalJobStatusLabelDrafts] =
    useState<Record<ExternalJobStatus, string>>(rules.externalJobStatusLabels);
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
    "Sales",
    "Engineering",
    "Production",
    "Admin",
  ];
  const hasStatusLabelChanges = useMemo(() => {
    const keys = new Set([
      ...Object.keys(rules.statusLabels),
      ...Object.keys(statusLabelDrafts),
    ]);
    for (const key of keys) {
      if (
        (rules.statusLabels as Record<string, string>)[key] !==
        (statusLabelDrafts as Record<string, string>)[key]
      ) {
        return true;
      }
    }
    return false;
  }, [rules.statusLabels, statusLabelDrafts]);
  const hasExternalJobStatusLabelChanges = useMemo(() => {
    const keys = new Set([
      ...Object.keys(rules.externalJobStatusLabels),
      ...Object.keys(externalJobStatusLabelDrafts),
    ]);
    for (const key of keys) {
      if (
        (rules.externalJobStatusLabels as Record<string, string>)[key] !==
        (externalJobStatusLabelDrafts as Record<string, string>)[key]
      ) {
        return true;
      }
    }
    return false;
  }, [rules.externalJobStatusLabels, externalJobStatusLabelDrafts]);

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

  useEffect(() => {
    setStatusLabelDrafts(rules.statusLabels);
  }, [rules.statusLabels]);
  useEffect(() => {
    setExternalJobStatusLabelDrafts(rules.externalJobStatusLabels);
  }, [rules.externalJobStatusLabels]);
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
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(
          "name, legal_name, registration_no, vat_no, billing_email, address, logo_url, outbound_from_name, outbound_from_email, outbound_reply_to_email, outbound_use_user_sender, outbound_sender_verified",
        )
        .eq("id", currentUser.tenantId)
        .maybeSingle();
      if (error || !data) {
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
    };
    fetchCompany();
  }, [currentUser.tenantId]);

  useEffect(() => {
    return () => {
      if (companyLogoPreview) {
        URL.revokeObjectURL(companyLogoPreview);
      }
    };
  }, [companyLogoPreview]);

  useEffect(() => {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const fetchInvites = async () => {
      setIsInvitesLoading(true);
      const { data, error } = await supabase
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
    setRules({ statusLabels: statusLabelDrafts });
    if (!supabase || !currentUser.tenantId) {
      setStatusLabelState("saved");
      setStatusLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert(
      {
        tenant_id: currentUser.tenantId,
        status_labels: statusLabelDrafts,
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
    setRules({ externalJobStatusLabels: externalJobStatusLabelDrafts });
    if (!supabase || !currentUser.tenantId) {
      setExternalJobStatusLabelState("saved");
      setExternalJobStatusLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert(
      {
        tenant_id: currentUser.tenantId,
        external_job_status_labels: externalJobStatusLabelDrafts,
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
    if (!supabase) {
      setUsers([
        {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          isAdmin: currentUser.isAdmin,
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
      const query = supabase
        .from("profiles")
        .select("id, full_name, role, tenant_id, is_admin")
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
    currentUser.tenantId,
  ]);

  useEffect(() => {
    if (!supabase || !currentUser.isAuthenticated) {
      setOperatorAssignments([]);
      return;
    }
    let isMounted = true;
    const fetchAssignments = async () => {
      setIsAssignmentsLoading(true);
      setOperatorAssignmentsError(null);
      const { data, error } = await supabase
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

  async function handleUpdateUserAdmin(userId: string, isAdmin: boolean) {
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, isAdmin } : user)),
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
      prev.map((user) => (user.id === userId ? { ...user, isAdmin } : user)),
    );
    setUpdatingUserId(null);
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
      setOutboundMessage(error.message ?? "Failed to save outbound email settings.");
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
    const isValidTime = (value: string) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
    if (!isValidTime(workdayStart) || !isValidTime(workdayEnd)) {
      setWorkdayError("Use 24h format HH:MM (e.g., 08:00).");
      return;
    }
    if (workdayStart >= workdayEnd) {
      setWorkdayError("Workday start must be earlier than end.");
      return;
    }
    setWorkdayError(null);
    setIsWorkdaySaving(true);
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      workday_start: workdayStart,
      workday_end: workdayEnd,
    });
    if (error) {
      setWorkdayError(error.message);
    }
    setIsWorkdaySaving(false);
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
      : ["Production", "Admin"];
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
      { key: "", label: "", fieldType: "text", maxSelect: 1 },
    ]);
  }

  function removeOrderFieldColumn(index: number) {
    setOrderFieldColumns((prev) => prev.filter((_, idx) => idx !== index));
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

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <section className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <div className="sticky top-16 z-20 border-b border-border bg-background/90 pb-2 pt-2 backdrop-blur">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="structure">Structure</TabsTrigger>
            <TabsTrigger value="operations">Production</TabsTrigger>
            <TabsTrigger value="partners">Partners</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="structure">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Hierarchy Levels</CardTitle>
                <CardDescription>
                  Define the order of fields users select when creating orders.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(200px,1.2fr)_minmax(120px,0.5fr)_minmax(240px,1fr)_auto] lg:items-end">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Level name</label>
                    <input
                      value={levelName}
                      onChange={(event) => {
                        setLevelName(event.target.value);
                      }}
                      placeholder="Contract"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Order</label>
                    <input
                      type="number"
                      min={1}
                      value={levelOrder}
                      onChange={(event) =>
                        setLevelOrder(Number(event.target.value) || 1)
                      }
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelRequired}
                        onChange={(event) =>
                          setLevelRequired(event.target.checked)
                        }
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelActive}
                        onChange={(event) =>
                          setLevelActive(event.target.checked)
                        }
                      />
                      Active
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelShowInTable}
                        onChange={(event) =>
                          setLevelShowInTable(event.target.checked)
                        }
                      />
                      Show in table
                    </label>
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
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={level.isRequired}
                                onChange={(event) =>
                                  updateLevel(level.id, {
                                    isRequired: event.target.checked,
                                  })
                                }
                              />
                              {level.isRequired ? "Yes" : "No"}
                            </label>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={level.isActive}
                                onChange={(event) =>
                                  updateLevel(level.id, {
                                    isActive: event.target.checked,
                                  })
                                }
                              />
                              {level.isActive ? "Active" : "Hidden"}
                            </label>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={level.showInTable}
                                onChange={(event) =>
                                  updateLevel(level.id, {
                                    showInTable: event.target.checked,
                                  })
                                }
                              />
                              {level.showInTable ? "Shown" : "Hidden"}
                            </label>
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Level</label>
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
                  </div>
                  {parentLevel && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">
                        Parent ({parentLevel.name})
                      </label>
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
                    </div>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.6fr)_auto] lg:items-end">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Label</label>
                    <input
                      value={nodeLabel}
                      onChange={(event) => setNodeLabel(event.target.value)}
                      placeholder="Enter label"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">
                      Code (optional)
                    </label>
                    <input
                      value={nodeCode}
                      onChange={(event) => setNodeCode(event.target.value)}
                      placeholder="Optional code"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">
                      Bulk add (one per line)
                    </label>
                    <textarea
                      value={bulkNodeInput}
                      onChange={(event) => setBulkNodeInput(event.target.value)}
                      placeholder="PE 40 Durvis\nPE 40 Vitrina\nPE 40 Logs"
                      className="min-h-[120px] rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
                    />
                    <div className="text-xs text-muted-foreground">
                      Optional code: use "Label | Code" or "Label;Code".
                    </div>
                  </div>
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
                            <input
                              type="checkbox"
                              checked={
                                currentLevelNodes.length > 0 &&
                                selectedNodeIds.length ===
                                  currentLevelNodes.length
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
                              <input
                                type="checkbox"
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Label</label>
                    <input
                      value={orderFieldLabel}
                      onChange={(event) =>
                        setOrderFieldLabel(event.target.value)
                      }
                      placeholder="Construction count"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Group</label>
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Type</label>
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Order</label>
                    <input
                      type="number"
                      value={orderFieldSortOrder}
                      onChange={(event) =>
                        setOrderFieldSortOrder(Number(event.target.value) || 0)
                      }
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
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
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Unit (optional)
                    <input
                      value={orderFieldUnit}
                      onChange={(event) =>
                        setOrderFieldUnit(event.target.value)
                      }
                      placeholder="pcs"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Select options (comma, newline, or "\" separated)
                    <textarea
                      value={orderFieldOptions}
                      onChange={(event) =>
                        setOrderFieldOptions(event.target.value)
                      }
                      disabled={orderFieldType !== "select"}
                      placeholder="Dealer, Private, Partner"
                      className="min-h-[80px] rounded-lg border border-border bg-input-background px-3 py-2 text-sm disabled:opacity-50"
                    />
                  </label>
                </div>

                {orderFieldType === "table" && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">Table columns</div>
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
                          <div key={index} className="space-y-2">
                            <div className="grid gap-2 md:grid-cols-[1.4fr_0.9fr_0.7fr_0.5fr_auto] md:items-end">
                              <label className="flex flex-col gap-1 text-xs font-medium">
                                Label
                                <input
                                  value={column.label}
                                  onChange={(event) =>
                                    updateOrderFieldColumn(index, {
                                      label: event.target.value,
                                    })
                                  }
                                  placeholder="Position"
                                  className="h-9 rounded-md border border-border bg-input-background px-2 text-sm"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs font-medium">
                                Type
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
                              </label>
                              <label className="flex flex-col gap-1 text-xs font-medium">
                                Unit
                                <input
                                  value={column.unit ?? ""}
                                  onChange={(event) =>
                                    updateOrderFieldColumn(index, {
                                      unit: event.target.value,
                                    })
                                  }
                                  placeholder="mm"
                                  className="h-9 rounded-md border border-border bg-input-background px-2 text-sm"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs font-medium">
                                Required
                                <input
                                  type="checkbox"
                                  checked={column.isRequired ?? false}
                                  onChange={(event) =>
                                    updateOrderFieldColumn(index, {
                                      isRequired: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4"
                                />
                              </label>
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
                            {column.fieldType === "select" && (
                              <div className="grid gap-2 md:grid-cols-[1fr_160px] md:items-end">
                                <label className="flex flex-col gap-1 text-xs font-medium">
                                  Options (comma, newline, or \"\\\" separated)
                                  <textarea
                                    value={(column.options ?? []).join("\n")}
                                    onChange={(event) =>
                                      updateOrderFieldColumn(index, {
                                        options: parseOrderFieldOptions(
                                          event.target.value,
                                        ),
                                      })
                                    }
                                    placeholder="Type A, Type B"
                                    className="min-h-[70px] rounded-md border border-border bg-input-background px-2 py-2 text-sm"
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs font-medium">
                                  Max selects (1-3)
                                  <input
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
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={orderFieldRequired}
                      onChange={(event) =>
                        setOrderFieldRequired(event.target.checked)
                      }
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={orderFieldActive}
                      onChange={(event) =>
                        setOrderFieldActive(event.target.checked)
                      }
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={orderFieldShowInProduction}
                      onChange={(event) =>
                        setOrderFieldShowInProduction(event.target.checked)
                      }
                    />
                    Show in production
                  </label>
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
                            <input
                              type="checkbox"
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
                                <input
                                  type="checkbox"
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

        <TabsContent value="operations">
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Working hours</CardTitle>
                  <CardDescription>
                    Define the daily work window used for production timing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">
                        Workday start
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                        value={workdayStart}
                        onChange={(event) =>
                          setWorkdayStart(event.target.value)
                        }
                        placeholder="08:00"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Workday end</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                        value={workdayEnd}
                        onChange={(event) => setWorkdayEnd(event.target.value)}
                        placeholder="17:00"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
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
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">
                        Station name
                      </label>
                      <input
                        value={stationName}
                        onChange={(event) => setStationName(event.target.value)}
                        placeholder="Cutting"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Description</label>
                      <input
                        value={stationDescription}
                        onChange={(event) =>
                          setStationDescription(event.target.value)
                        }
                        placeholder="Sawing and prep"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
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

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground">
                      {selectedWorkStationIds.length > 0
                        ? `${selectedWorkStationIds.length} selected`
                        : " "}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
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
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                        draggable
                        onDragStart={() => setDragStationId(station.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleStationDrop(station.id)}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full h-6 w-6 flex justify-center items-center border border-border text-xs text-muted-foreground">
                              {index + 1}
                            </span>
                            <span className="font-medium">{station.name}</span>
                          </div>
                          <div className="text-sm text-muted-foreground text-wrap">
                            {station.description ?? "No description"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
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
                          <input
                            type="checkbox"
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
                              <input
                                type="checkbox"
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
                            <input
                              type="checkbox"
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
                            {option.label}
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
                    Choose who receives system notifications about blocked work.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {["Sales", "Engineering", "Production", "Admin"].map(
                      (role) => (
                        <label
                          key={role}
                          className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <input
                            type="checkbox"
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
                      ),
                    )}
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
                                      <input
                                        type="checkbox"
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
                              Loading assignments...
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
                                      <input
                                        type="checkbox"
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Reason</label>
                    <input
                      value={stopReasonLabel}
                      onChange={(event) =>
                        setStopReasonLabel(event.target.value)
                      }
                      placeholder="Missing material"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground">
                      {selectedStopReasonIds.length > 0
                        ? `${selectedStopReasonIds.length} selected`
                        : " "}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
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
                          <input
                            type="checkbox"
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
                        <input
                          type="checkbox"
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
            <Card>
              <CardHeader>
                <CardTitle>Partners</CardTitle>
                <CardDescription>
                  Maintain external suppliers for outsourced steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-t border-border pt-4 pb-8">
                  <div className="text-sm font-medium">Partner groups</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Group name</label>
                      <input
                        value={partnerGroupName}
                        onChange={(event) =>
                          setPartnerGroupName(event.target.value)
                        }
                        placeholder="Glass"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
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
                          <input
                            type="checkbox"
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
                            <input
                              type="checkbox"
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
                          <input
                            type="checkbox"
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Partner name</label>
                    <input
                      value={partnerName}
                      onChange={(event) => setPartnerName(event.target.value)}
                      placeholder="Baltic Glass"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Email</label>
                    <input
                      type="email"
                      value={partnerEmail}
                      onChange={(event) => setPartnerEmail(event.target.value)}
                      placeholder="partner@company.com"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Phone</label>
                    <input
                      value={partnerPhone}
                      onChange={(event) => setPartnerPhone(event.target.value)}
                      placeholder="+371 2xxxxxxx"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Group</label>
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
                  </div>
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
                        <input
                          type="checkbox"
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
                          <input
                            type="checkbox"
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
                        <input
                          type="checkbox"
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Label</label>
                    <input
                      value={externalJobFieldLabel}
                      onChange={(event) =>
                        setExternalJobFieldLabel(event.target.value)
                      }
                      placeholder="Unit price"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Type</label>
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Scope</label>
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Order</label>
                    <input
                      type="number"
                      value={externalJobFieldSortOrder}
                      onChange={(event) =>
                        setExternalJobFieldSortOrder(
                          Number(event.target.value) || 0,
                        )
                      }
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
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
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Unit (optional)
                    <input
                      value={externalJobFieldUnit}
                      onChange={(event) =>
                        setExternalJobFieldUnit(event.target.value)
                      }
                      placeholder="EUR"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Select options (comma, newline, or backslash separated)
                    <textarea
                      value={externalJobFieldOptions}
                      onChange={(event) =>
                        setExternalJobFieldOptions(event.target.value)
                      }
                      disabled={externalJobFieldType !== "select"}
                      placeholder="EUR, USD"
                      className="min-h-[80px] rounded-lg border border-border bg-input-background px-3 py-2 text-sm disabled:opacity-50"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={externalJobFieldRequired}
                      onChange={(event) =>
                        setExternalJobFieldRequired(event.target.checked)
                      }
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
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
                            <input
                              type="checkbox"
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
                                <input
                                  type="checkbox"
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
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-sm font-medium">Invite user</div>
                <div className="mt-3 grid gap-3 items-center md:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(140px,0.5fr)_auto] md:items-end">
                  <label className="space-y-2 text-sm font-medium">
                    Email
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="user@company.com"
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Full name
                    <input
                      value={inviteFullName}
                      onChange={(event) =>
                        setInviteFullName(event.target.value)
                      }
                      placeholder="Full name"
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Role
                    <Select
                      value={inviteRole}
                      onValueChange={(value) =>
                        setInviteRole(value as UserRole)
                      }
                      disabled={!currentUser.isAdmin}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {userRoleOptions.map((roleOption) => (
                          <SelectItem key={roleOption} value={roleOption}>
                            {roleOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <Button
                    onClick={handleInviteUser}
                    disabled={!currentUser.isAdmin || inviteState === "sending"}
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
              {!currentUser.isAdmin && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Only admins can update user roles or admin access.
                </div>
              )}
              {process.env.NODE_ENV !== "production" &&
                !currentUser.isAdmin && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
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
                          colSpan={4}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          Loading users...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
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
                                !currentUser.isAdmin &&
                                !(devRoleOverride && user.id === currentUser.id)
                              }
                            >
                              <SelectTrigger className="h-9 w-[160px] rounded-md text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {userRoleOptions.map((roleOption) => (
                                  <SelectItem
                                    key={roleOption}
                                    value={roleOption}
                                  >
                                    {roleOption}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={user.isAdmin}
                                onChange={(event) =>
                                  handleUpdateUserAdmin(
                                    user.id,
                                    event.target.checked,
                                  )
                                }
                                disabled={!currentUser.isAdmin}
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
                            Loading invites...
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
                                    !currentUser.isAdmin
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
                                    !currentUser.isAdmin
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
                <div className="text-xs text-muted-foreground">
                  Syncing workflow rules...
                </div>
              ) : null}
              <div className="grid gap-6">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold">Core rules</div>
                  <div className="mt-3 grid gap-4 lg:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium">
                      Min attachments for engineering
                      <input
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
                      <input
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
                      <input
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
                      <input
                        type="checkbox"
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
                      <input
                        type="checkbox"
                        checked={rules.requireCommentForProduction}
                        onChange={(event) =>
                          setRules({
                            requireCommentForProduction: event.target.checked,
                          })
                        }
                      />
                      Require comment before production
                    </label>
                  </div>
                  <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
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
                            <input
                              type="checkbox"
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
                    <div className="text-sm font-semibold">Status labels</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {workflowStatusOptions.map((option) => (
                        <label
                          key={option.value}
                          className="space-y-2 text-sm font-medium"
                        >
                          {option.label}
                          <input
                            value={
                              statusLabelDrafts[option.value] ?? option.label
                            }
                            onChange={(event) =>
                              setStatusLabelDrafts({
                                ...statusLabelDrafts,
                                [option.value]: event.target.value,
                              })
                            }
                            className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setStatusLabelDrafts(rules.statusLabels)}
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
                          : "Save status labels"}
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
                      External job status labels
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {externalJobStatusOptions.map((option) => (
                        <label
                          key={option.value}
                          className="space-y-2 text-sm font-medium"
                        >
                          {option.label}
                          <input
                            value={
                              externalJobStatusLabelDrafts[option.value] ??
                              option.label
                            }
                            onChange={(event) =>
                              setExternalJobStatusLabelDrafts((prev) => ({
                                ...prev,
                                [option.value]: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setExternalJobStatusLabelDrafts(
                            rules.externalJobStatusLabels,
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
                          : "Save external status labels"}
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
                        <input
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
                        <input
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
                            <input
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
                        <input
                          value={newAttachmentCategoryLabel}
                          onChange={(event) =>
                            setNewAttachmentCategoryLabel(event.target.value)
                          }
                          placeholder="Add category"
                          className="h-10 min-w-[200px] flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
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
                          <label
                            key={role}
                            className="space-y-2 text-sm font-medium"
                          >
                            {role}
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
                          </label>
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
                      <input
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
                          <input
                            type="checkbox"
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
                          <input
                            type="checkbox"
                            checked={newChecklistRequired.includes(
                              "ready_for_production",
                              "in_production",
                            )}
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
                            <input
                              type="checkbox"
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
                            <input
                              type="checkbox"
                              checked={item.requiredFor.includes(
                                "ready_for_production",
                                "in_production",
                              )}
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
                            <input
                              type="checkbox"
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
                      <input
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
                    <input
                      value={outboundFromName}
                      onChange={(event) => setOutboundFromName(event.target.value)}
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder={companyName || "Company"}
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    From email (tenant domain)
                    <input
                      type="email"
                      value={outboundFromEmail}
                      onChange={(event) => setOutboundFromEmail(event.target.value)}
                      className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      placeholder="orders@your-company.com"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Default reply-to
                    <input
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
                      <input
                        type="checkbox"
                        checked={outboundUseUserSender}
                        onChange={(event) =>
                          setOutboundUseUserSender(event.target.checked)
                        }
                        disabled={!currentUser.isAdmin}
                      />
                      Use engineer email as sender when domain matches
                    </label>
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <input
                        type="checkbox"
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
                    disabled={!currentUser.isAdmin || outboundState === "saving"}
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
      {dialog}
    </section>
  );
}
