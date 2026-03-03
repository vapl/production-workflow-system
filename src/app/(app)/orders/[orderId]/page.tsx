"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FileField } from "@/components/ui/FileField";
import { Input } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { DetailTabsBar } from "@/components/layout/DetailTabsBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatDate,
  formatDateTime,
  formatOrderStatus,
} from "@/lib/domain/formatters";
import type {
  ExternalJob,
  ExternalJobAttachment,
  ExternalJobField,
  ExternalJobStatus,
  Order,
  OrderAttachment,
  OrderComment,
  OrderStatus,
} from "@/types/orders";
import type {
  OrderInputField,
  OrderInputTableColumn,
} from "@/types/orderInputs";
import type { OrderItem } from "@/types/orderItems";
import type {
  OrderItemBomLine,
  OrderItemBomLineType,
} from "@/types/orderItemBomLines";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import JSZip from "jszip";
import { useOrders } from "@/app/(app)/orders/OrdersContext";
import { useOrderFieldSettings } from "@/app/(app)/settings/OrderFieldSettingsContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { uploadOrderAttachment } from "@/lib/uploadOrderAttachment";
import { uploadExternalJobAttachment } from "@/lib/uploadExternalJobAttachment";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { usePartners } from "@/hooks/usePartners";
import { useNotifications } from "@/components/ui/Notifications";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { useRbac } from "@/contexts/RbacContext";
import { useI18n } from "@/lib/i18n/useI18n";
import { isOrderProductionComplete } from "@/lib/domain/productionCompletion";
import { ORDER_CORE_FIELD_KEYS } from "@/lib/domain/orderCoreFields";
import {
  cloneOrderInputTableRow,
  ensureOrderInputTableRow,
  ensureOrderInputTableRows,
  getOrderInputTableRowId,
  isOrderInputTableRowEmpty,
} from "@/lib/domain/orderInputTableRows";
import {
  getOrderInputTableRowAttachmentIds,
  attachOrderInputTableRowDocuments,
  buildOrderItemDocumentsFromTableField,
  isMissingOrderItemDocumentsSchema,
} from "@/lib/domain/orderItemDocumentsBridge";
import {
  buildOrderItemsFromTableField,
  buildTableRowsFromOrderItems,
  isMissingOrderItemsSchema,
  mapOrderItemRow,
} from "@/lib/domain/orderItemsBridge";
import {
  getOrderFieldLabel,
  getOrderPriorityLabel,
  getOrderStatusLabel,
} from "@/lib/domain/orderFieldPresentation";
import { useAssignmentLabels } from "@/hooks/useAssignmentLabels";
import {
  canEditOrderInlineField,
  canEditOrderInputs as canEditOrderInputsByRole,
} from "@/lib/domain/orderPermissions";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const defaultAttachmentCategories = [
  { id: "order_documents", label: "Order documents" },
  { id: "technical_docs", label: "Technical documentation" },
  { id: "photos", label: "Site photos" },
  { id: "other", label: "Other" },
];
const EMPTY_ATTACHMENTS: OrderAttachment[] = [];

type HistoryFilter = "all" | "status" | "comment" | "file";
type ConstructionDetailTarget = {
  fieldId: string;
  rowId: string;
};
type OrderItemBomLineDraft = {
  componentName: string;
  componentCode: string;
  componentType: OrderItemBomLineType;
  qty: string;
  unit: string;
  length: string;
  width: string;
  height: string;
  notes: string;
};

type OrderItemBomLineRow = {
  id: string;
  order_item_id: string;
  line_no: number | null;
  component_code?: string | null;
  component_name: string;
  component_type: OrderItemBomLineType;
  qty: number | null;
  unit: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  attributes?: Record<string, unknown> | null;
  source_kind?: "manual" | "import" | "cad" | null;
  sort_order: number | null;
  created_at?: string;
  updated_at?: string;
};

const DEFAULT_BOM_DRAFT: OrderItemBomLineDraft = {
  componentName: "",
  componentCode: "",
  componentType: "other",
  qty: "1",
  unit: "pcs",
  length: "",
  width: "",
  height: "",
  notes: "",
};

const BOM_COMPONENT_TYPE_OPTIONS: Array<{
  value: OrderItemBomLineType;
  label: string;
}> = [
  { value: "profile", label: "Profile" },
  { value: "glass", label: "Glass" },
  { value: "panel", label: "Panel" },
  { value: "hardware", label: "Hardware" },
  { value: "gasket", label: "Gasket" },
  { value: "accessory", label: "Accessory" },
  { value: "sheet", label: "Sheet" },
  { value: "edge_band", label: "Edge band" },
  { value: "fitting", label: "Fitting" },
  { value: "other", label: "Other" },
];

function mapOrderItemBomLineRow(row: OrderItemBomLineRow): OrderItemBomLine {
  return {
    id: row.id,
    orderItemId: row.order_item_id,
    lineNo: row.line_no ?? 0,
    componentCode: row.component_code ?? null,
    componentName: row.component_name,
    componentType: row.component_type ?? "other",
    qty: Number(row.qty ?? 1),
    unit: row.unit ?? "pcs",
    length: row.length ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    attributes: row.attributes ?? {},
    sourceKind: row.source_kind ?? "manual",
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatDuration(totalMinutes?: number | null) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getDaysFromToday(dateValue?: string | null) {
  if (!dateValue) {
    return null;
  }
  const due = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const today = new Date();
  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.round((due.getTime() - current.getTime()) / 86400000);
}

function parseMoneyValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^0-9.-]+/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getInitials(value?: string | null) {
  if (!value) return "?";
  const parts = value
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function isEmptyExternalFieldValue(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

function parseExternalJobStatus(value: unknown): ExternalJobStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  switch (value) {
    case "requested":
    case "ordered":
    case "in_progress":
    case "delivered":
    case "approved":
    case "cancelled":
      return value;
    default:
      return null;
  }
}

function uniqueExternalJobsById(items: ExternalJob[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function normalizeExternalFieldToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeArchiveName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getExternalFieldSemantic(field: ExternalJobField) {
  const key = normalizeExternalFieldToken(field.key);
  const label = normalizeExternalFieldToken(field.label);
  const tokens = new Set([key, label]);
  if (
    tokens.has("external_order_number") ||
    tokens.has("external_order_no") ||
    tokens.has("order_number") ||
    tokens.has("ext_order")
  ) {
    return "external_order";
  }
  if (tokens.has("due_date") || tokens.has("due")) {
    return "due_date";
  }
  if (
    tokens.has("unit_price") ||
    tokens.has("price") ||
    tokens.has("sum_without_vat") ||
    tokens.has("amount_ex_vat")
  ) {
    return "unit_price";
  }
  return "other";
}

export default function OrderDetailPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useParams<{ orderId?: string }>();
  const normalizeId = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

  const decodedOrderId = params?.orderId
    ? normalizeId(decodeURIComponent(params.orderId))
    : "";

  const {
    orders,
    isLoading: isOrdersLoading,
    refreshOrders,
    updateOrder,
    addOrderAttachment,
    removeOrderAttachment,
    addOrderComment,
    removeOrderComment,
    addExternalJob,
    updateExternalJob,
    removeExternalJob,
    addExternalJobAttachment,
    removeExternalJobAttachment,
  } = useOrders();
  const { orderFields } = useOrderFieldSettings();
  const {
    role,
    isAdmin,
    isOwner,
    name,
    id: userId,
    tenantId,
  } = useCurrentUser();
  const { hasPermission } = useRbac();
  const { confirm, dialog } = useConfirmDialog();
  const { rules } = useWorkflowRules();
  const { activePartners, activeGroups } = usePartners();
  const { notify } = useNotifications();
  const { subscription, hasCapability } = useTenantSubscription();

  const confirmRemove = useCallback(
    async (title: string, description?: string) =>
      confirm({
        title,
        description,
        confirmLabel: t("orders.detail.delete"),
      }),
    [confirm, t],
  );
  const { engineer: engineerLabel, manager: managerLabel } =
    useAssignmentLabels();
  const attachmentCategories = useMemo(() => {
    return rules.attachmentCategories && rules.attachmentCategories.length > 0
      ? rules.attachmentCategories
      : defaultAttachmentCategories;
  }, [rules.attachmentCategories]);
  const attachmentCategoryLabels = useMemo(
    () =>
      attachmentCategories.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.label;
        return acc;
      }, {}),
    [attachmentCategories],
  );
  const roleDefaultAttachmentCategory =
    rules.attachmentCategoryDefaults?.[role];
  const adminDefaultAttachmentCategory = isAdmin
    ? rules.attachmentCategoryDefaults?.Admin
    : undefined;
  const defaultAttachmentCategory =
    roleDefaultAttachmentCategory ??
    adminDefaultAttachmentCategory ??
    attachmentCategories[0]?.id ??
    "order_documents";
  const storagePublicPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${supabaseBucket}/`
    : "";
  const statusLabel = (status: OrderStatus) =>
    getOrderStatusLabel(
      status,
      t,
      rules.statusLabels?.[status] ?? formatOrderStatus(status),
    );
  const activeLevels = useMemo(
    () =>
      orderFields
        .filter(
          (level) =>
            level.isActive &&
            !ORDER_CORE_FIELD_KEYS.has(level.key) &&
            level.key !== "engineer" &&
            level.key !== "manager",
        )
        .sort((a, b) => a.order - b.order)
        .map((level) => ({
          ...level,
          name: getOrderFieldLabel(level.key, t, level.name),
        })),
    [orderFields, t],
  );
  const summaryMetadataFields = useMemo(
    () =>
      orderFields
        .filter(
          (field) =>
            field.isActive &&
            (field.key === "delivery_address" ||
              field.key === "customer_phone"),
        )
        .sort((a, b) => a.order - b.order)
        .map((field) => ({
          ...field,
          name: getOrderFieldLabel(field.key, t, field.name),
        })),
    [orderFields, t],
  );
  const deliveryAddressField = summaryMetadataFields.find(
    (field) => field.key === "delivery_address",
  );
  const customerPhoneField = summaryMetadataFields.find(
    (field) => field.key === "customer_phone",
  );
  const order = useMemo(
    () =>
      orders.find(
        (item) =>
          normalizeId(item.id) === decodedOrderId ||
          normalizeId(item.orderNumber) === decodedOrderId,
      ),
    [decodedOrderId, orders],
  );

  const [orderState, setOrderState] = useState(order);
  const [productionDisplayStatus, setProductionDisplayStatus] =
    useState<OrderStatus | null>(null);
  const [productionCompletionProgress, setProductionCompletionProgress] =
    useState<{ done: number; total: number; mode: "all" | "stations" } | null>(
      null,
    );
  const [inlineEditingField, setInlineEditingField] = useState<string | null>(
    null,
  );
  const [inlineDraftValue, setInlineDraftValue] = useState("");
  const [isSavingInlineField, setIsSavingInlineField] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentCategory, setAttachmentCategory] = useState<string>(
    defaultAttachmentCategory,
  );
  const [isAttachmentCategoryManual, setIsAttachmentCategoryManual] =
    useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [commentMessage, setCommentMessage] = useState("");
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [showNotFound, setShowNotFound] = useState(false);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {},
  );
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [externalPartnerId, setExternalPartnerId] = useState("");
  const [externalPartnerGroupId, setExternalPartnerGroupId] = useState("");
  const [externalRequestMode, setExternalRequestMode] = useState<
    "manual" | "partner_portal"
  >("manual");
  const [externalPortalComment, setExternalPortalComment] = useState("");
  const [externalPortalFiles, setExternalPortalFiles] = useState<File[]>([]);
  const [externalError, setExternalError] = useState("");
  const [externalJobFiles, setExternalJobFiles] = useState<
    Record<string, File[]>
  >({});
  const [externalJobUpload, setExternalJobUpload] = useState<
    Record<string, { isUploading: boolean; error?: string }>
  >({});
  const [sendingToPartnerJobId, setSendingToPartnerJobId] = useState<
    string | null
  >(null);
  const [orderInputFields, setOrderInputFields] = useState<OrderInputField[]>(
    [],
  );
  const [externalJobFields, setExternalJobFields] = useState<
    ExternalJobField[]
  >([]);
  const [externalJobFieldValues, setExternalJobFieldValues] = useState<
    Record<string, unknown>
  >({});
  const [externalJobValuesByJobId, setExternalJobValuesByJobId] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [orderInputValues, setOrderInputValues] = useState<
    Record<string, unknown>
  >({});
  const [orderInputInitialValues, setOrderInputInitialValues] = useState<
    Record<string, unknown>
  >({});
  const [constructionRowsByFieldId, setConstructionRowsByFieldId] = useState<
    Record<string, Array<Record<string, unknown>>>
  >({});
  const [
    constructionInitialRowsByFieldId,
    setConstructionInitialRowsByFieldId,
  ] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [tableRowSelections, setTableRowSelections] = useState<
    Record<string, number[]>
  >({});
  const [activeConstructionDetail, setActiveConstructionDetail] =
    useState<ConstructionDetailTarget | null>(null);
  const [orderItemsByRowKey, setOrderItemsByRowKey] = useState<
    Record<string, OrderItem>
  >({});
  const [orderItemDocumentIdsByRowKey, setOrderItemDocumentIdsByRowKey] =
    useState<Record<string, string[]>>({});
  const [bomLinesByOrderItemId, setBomLinesByOrderItemId] = useState<
    Record<string, OrderItemBomLine[]>
  >({});
  const [bomDraftsByOrderItemId, setBomDraftsByOrderItemId] = useState<
    Record<string, OrderItemBomLineDraft>
  >({});
  const [savingBomForItemId, setSavingBomForItemId] = useState<string | null>(
    null,
  );
  const [deletingBomLineId, setDeletingBomLineId] = useState<string | null>(
    null,
  );
  const [orderInputError, setOrderInputError] = useState("");
  const [isSavingOrderInputs, setIsSavingOrderInputs] = useState(false);
  const [tableImportAttachmentIds, setTableImportAttachmentIds] = useState<
    Record<string, string>
  >({});
  const [tableImportNotices, setTableImportNotices] = useState<
    Record<string, string>
  >({});
  const [isParsingTableFieldId, setIsParsingTableFieldId] = useState<
    string | null
  >(null);
  const getConstructionRows = useCallback(
    (fieldId: string) =>
      ensureOrderInputTableRows(constructionRowsByFieldId[fieldId]),
    [constructionRowsByFieldId],
  );
  const getFieldCurrentValue = useCallback(
    (field: OrderInputField) =>
      field.fieldType === "table"
        ? getConstructionRows(field.id)
        : orderInputValues[field.id],
    [getConstructionRows, orderInputValues],
  );
  const [expandedExternalHistory, setExpandedExternalHistory] = useState<
    Record<string, boolean>
  >({});
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<
    Record<string, string>
  >({});
  const [signedExternalAttachmentUrls, setSignedExternalAttachmentUrls] =
    useState<Record<string, string>>({});
  const [downloadingAttachmentGroup, setDownloadingAttachmentGroup] = useState<
    string | null
  >(null);
  const [deletingAttachmentGroup, setDeletingAttachmentGroup] = useState<
    string | null
  >(null);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>(
    [],
  );
  const [showStickyMobileBadge, setShowStickyMobileBadge] = useState(false);
  const [showDesktopStickyShadow, setShowDesktopStickyShadow] = useState(false);
  const [hideMobileFloatingControls, setHideMobileFloatingControls] =
    useState(false);
  const [isMobileSectionsOpen, setIsMobileSectionsOpen] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth < 768) {
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollYRef.current;

        setShowStickyMobileBadge(currentScrollY > 180);
        setShowDesktopStickyShadow(false);
        if (currentScrollY <= 40) {
          setHideMobileFloatingControls(false);
        } else if (scrollDelta > 8) {
          setHideMobileFloatingControls(true);
        } else if (scrollDelta < -8) {
          setHideMobileFloatingControls(false);
        }
        lastScrollYRef.current = currentScrollY;
        return;
      }

      setShowStickyMobileBadge(false);
      setHideMobileFloatingControls(false);
      setShowDesktopStickyShadow(window.scrollY > 0);
      lastScrollYRef.current = window.scrollY;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const canTakeOrder =
    role === "Engineering" &&
    !orderState?.assignedEngineerId &&
    orderState?.status === "ready_for_engineering";
  const isAssignedToCurrentEngineer =
    role === "Engineering" && orderState?.assignedEngineerId === userId;
  const isAssignedToAnotherEngineer =
    role === "Engineering" &&
    Boolean(orderState?.assignedEngineerId) &&
    orderState?.assignedEngineerId !== userId;
  const canReturnToQueue =
    isAssignedToCurrentEngineer &&
    (orderState?.status === "in_engineering" ||
      orderState?.status === "engineering_blocked" ||
      orderState?.status === "ready_for_engineering");
  const canSendToEngineering =
    role === "Sales" && orderState?.status === "draft";
  const canStartEngineering =
    role === "Engineering" &&
    orderState?.status === "ready_for_engineering" &&
    !isAssignedToAnotherEngineer;
  const canSendToProduction =
    role === "Engineering" &&
    orderState?.status === "in_engineering" &&
    !isAssignedToAnotherEngineer;
  const canSendBack =
    (role === "Sales" &&
      (orderState?.status === "ready_for_engineering" ||
        orderState?.status === "in_engineering" ||
        orderState?.status === "engineering_blocked")) ||
    (role === "Engineering" &&
      !isAssignedToAnotherEngineer &&
      (orderState?.status === "in_engineering" ||
        orderState?.status === "engineering_blocked" ||
        orderState?.status === "ready_for_production"));
  const returnTargetStatus =
    role === "Engineering"
      ? orderState?.status === "ready_for_production"
        ? "in_engineering"
        : orderState?.status === "in_engineering" ||
            orderState?.status === "engineering_blocked"
          ? "ready_for_engineering"
          : "draft"
      : "draft";
  const canSendExternalJobToPartner = hasCapability(
    "externalJobs.sendToPartner",
  );
  const canUseAiOrderInputImport = hasCapability("orderInputs.aiPdfImport");
  const canEditInlineField = (fieldId: string) =>
    orderState
      ? canEditOrderInlineField(
          { role, isAdmin, isOwner },
          orderState.status,
          fieldId as
            | "customerName"
            | "dueDate"
            | "quantity"
            | "priority"
            | "assignedEngineer"
            | "assignedManager"
            | "deliveryAddress"
            | "customerPhone"
            | `orderField:${string}`,
        )
      : false;

  const activeChecklistItems = rules.checklistItems.filter(
    (item) => item.isActive,
  );
  const requiredForEngineering = activeChecklistItems.filter((item) =>
    item.requiredFor.includes("ready_for_engineering"),
  );
  const requiredForProduction = activeChecklistItems.filter((item) =>
    item.requiredFor.includes("ready_for_production"),
  );
  const checklistDoneCount = activeChecklistItems.filter(
    (item) => checklistState[item.id],
  ).length;
  const statusHistory = orderState?.statusHistory ?? [];
  const historyEvents = useMemo(() => {
    const statusEvents = (orderState?.statusHistory ?? []).map((entry) => ({
      id: `status-${entry.id}`,
      type: "status" as const,
      createdAt: entry.changedAt,
      actor: entry.changedBy,
      actorRole: entry.changedByRole,
      label: entry.status,
      meta: entry.status,
    }));
    const commentEvents = (orderState?.comments ?? []).map((comment) => ({
      id: `comment-${comment.id}`,
      type: "comment" as const,
      createdAt: comment.createdAt,
      actor: comment.author,
      actorRole: comment.authorRole,
      label: comment.message,
      meta: null,
    }));
    const fileEvents = (orderState?.attachments ?? []).map((attachment) => ({
      id: `file-${attachment.id}`,
      type: "file" as const,
      createdAt: attachment.createdAt,
      actor: attachment.addedBy,
      actorRole: attachment.addedByRole,
      label: attachment.name,
      meta: formatFileSize(attachment.size),
    }));
    return [...statusEvents, ...commentEvents, ...fileEvents].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orderState?.statusHistory, orderState?.comments, orderState?.attachments]);
  const visibleHistoryEvents = useMemo(() => {
    const filtered =
      historyFilter === "all"
        ? historyEvents
        : historyEvents.filter((event) => event.type === historyFilter);
    return showAllHistory ? filtered : filtered.slice(0, 8);
  }, [historyEvents, historyFilter, showAllHistory]);
  const engineeringTiming = useMemo(() => {
    if (!orderState) {
      return null;
    }
    const timeline = [...(orderState.statusHistory ?? [])].sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );
    let activeStartAt: string | null = null;
    let firstStartedAt: string | null = null;
    let lastCompletedAt: string | null = null;
    let totalMs = 0;
    let completedCycles = 0;
    timeline.forEach((entry) => {
      if (entry.status === "in_engineering") {
        if (!activeStartAt) {
          activeStartAt = entry.changedAt;
          firstStartedAt = firstStartedAt ?? entry.changedAt;
        }
      }
      if (entry.status === "ready_for_production" && activeStartAt) {
        const startMs = new Date(activeStartAt).getTime();
        const endMs = new Date(entry.changedAt).getTime();
        if (
          Number.isFinite(startMs) &&
          Number.isFinite(endMs) &&
          endMs >= startMs
        ) {
          totalMs += endMs - startMs;
          completedCycles += 1;
          lastCompletedAt = entry.changedAt;
        }
        activeStartAt = null;
      }
    });
    if (!firstStartedAt) {
      return null;
    }

    const inProgress =
      Boolean(activeStartAt) &&
      (orderState.status === "in_engineering" ||
        orderState.status === "engineering_blocked");
    if (inProgress && activeStartAt) {
      const startMs = new Date(activeStartAt).getTime();
      const nowMs = Date.now();
      if (Number.isFinite(startMs) && nowMs >= startMs) {
        totalMs += nowMs - startMs;
      }
    }
    if (totalMs <= 0) {
      return null;
    }
    const durationMinutes = Math.round(totalMs / 60000);
    return {
      startedAt: firstStartedAt,
      completedAt: lastCompletedAt,
      activeStartedAt: activeStartAt,
      inProgress,
      durationMinutes,
      completedCycles,
    };
  }, [orderState]);
  const visibleExternalJobs = useMemo(
    () => uniqueExternalJobsById(orderState?.externalJobs ?? []),
    [orderState?.externalJobs],
  );

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setEngineers([
        { id: "eng-1", name: `${engineerLabel} 1` },
        { id: "eng-2", name: `${engineerLabel} 2` },
      ]);
      return;
    }

    let isMounted = true;
    const fetchEngineers = async () => {
      const query = sb
        .from("profiles")
        .select("id, full_name")
        .eq("role", "Engineering");
      if (tenantId) {
        query.eq("tenant_id", tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setEngineers([]);
        return;
      }
      setEngineers(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.full_name ?? engineerLabel,
        })),
      );
    };

    fetchEngineers();
    return () => {
      isMounted = false;
    };
  }, [engineerLabel, tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setManagers([
        { id: "mgr-1", name: `${managerLabel} 1` },
        { id: "mgr-2", name: `${managerLabel} 2` },
      ]);
      return;
    }

    let isMounted = true;
    const fetchManagers = async () => {
      const query = sb
        .from("profiles")
        .select("id, full_name")
        .in("role", ["Sales", "Admin"]);
      if (tenantId) {
        query.eq("tenant_id", tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setManagers([]);
        return;
      }
      setManagers(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.full_name ?? managerLabel,
        })),
      );
    };

    fetchManagers();
    return () => {
      isMounted = false;
    };
  }, [managerLabel, tenantId]);

  useEffect(() => {
    setOrderState(order);
    setChecklistState(order?.checklist ?? {});
  }, [order]);

  useEffect(() => {
    if (isOrdersLoading) {
      setIsLoadingOrder(true);
      setShowNotFound(false);
      return;
    }
    if (order) {
      setIsLoadingOrder(false);
      setShowNotFound(false);
      return;
    }
    setIsLoadingOrder(true);
    const timer = window.setTimeout(() => {
      setIsLoadingOrder(false);
      setShowNotFound(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [isOrdersLoading, order]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !orderState?.id) {
      return;
    }
    const trackedExternalJobIds = new Set(
      (orderState.externalJobs ?? []).map((job) => job.id),
    );
    const isTrackedExternalJobPayload = (payload: {
      new?: { external_job_id?: string | null };
      old?: { external_job_id?: string | null };
    }) => {
      const newId = payload.new?.external_job_id ?? null;
      const oldId = payload.old?.external_job_id ?? null;
      return (
        (typeof newId === "string" && trackedExternalJobIds.has(newId)) ||
        (typeof oldId === "string" && trackedExternalJobIds.has(oldId))
      );
    };
    const channel = sb
      .channel(`order-live-${orderState.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderState.id}`,
        },
        () => {
          void refreshOrders();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_comments",
          filter: `order_id=eq.${orderState.id}`,
        },
        () => {
          void refreshOrders();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_status_history",
          filter: `order_id=eq.${orderState.id}`,
        },
        () => {
          void refreshOrders();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_jobs",
          filter: `order_id=eq.${orderState.id}`,
        },
        () => {
          void refreshOrders();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_job_status_history",
        },
        (payload) => {
          if (isTrackedExternalJobPayload(payload)) {
            void refreshOrders();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_job_attachments",
        },
        (payload) => {
          if (isTrackedExternalJobPayload(payload)) {
            void refreshOrders();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_job_field_values",
        },
        (payload) => {
          if (isTrackedExternalJobPayload(payload)) {
            void refreshOrders();
          }
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [orderState?.externalJobs, orderState?.id, refreshOrders]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !tenantId) {
      return;
    }
    let isMounted = true;
    const loadOrderInputFields = async () => {
      const { data, error } = await sb
        .from("order_input_fields")
        .select(
          "id, key, label, group_key, field_type, unit, options, is_required, is_active, show_in_production, sort_order",
        )
        .order("group_key", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (error) {
        setOrderInputError(t("orders.detail.errors.loadOrderInputs"));
        return;
      }
      setOrderInputError("");
      const mapped = (data ?? []).map((row) => ({
        id: row.id,
        key: row.key,
        label: row.label,
        groupKey: (row.group_key ??
          "order_info") as OrderInputField["groupKey"],
        fieldType: row.field_type as OrderInputField["fieldType"],
        unit: row.unit ?? undefined,
        options: row.options?.options ?? undefined,
        columns:
          (
            row.options?.columns as Partial<OrderInputTableColumn>[] | undefined
          )?.map((column) => ({
            ...column,
            isActive: column.isActive ?? true,
            showInTable: column.showInTable ?? true,
            showInProduction: column.showInProduction ?? true,
          })) as OrderInputTableColumn[] | undefined,
        showInTable: row.options?.showInTable ?? true,
        isRequired: row.is_required ?? false,
        isActive: row.is_active ?? true,
        showInProduction: row.show_in_production ?? false,
        sortOrder: row.sort_order ?? 0,
      }));
      setOrderInputFields(mapped);
    };
    void loadOrderInputFields();
    return () => {
      isMounted = false;
    };
  }, [t, tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !tenantId) {
      setExternalJobFields([]);
      setExternalJobFieldValues({});
      setExternalJobValuesByJobId({});
      return;
    }
    let isMounted = true;
    const loadExternalJobFields = async () => {
      const { data, error } = await sb
        .from("external_job_fields")
        .select(
          "id, key, label, field_type, scope, field_role, show_in_table, ai_enabled, ai_match_only, ai_aliases, unit, options, is_required, is_active, sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (error) {
        return;
      }
      const mapped = (data ?? []).map((row) => ({
        id: row.id,
        key: row.key,
        label: row.label,
        fieldType: row.field_type as ExternalJobField["fieldType"],
        scope: (row.scope ?? "manual") as ExternalJobField["scope"],
        fieldRole: (row.field_role ?? "none") as ExternalJobField["fieldRole"],
        showInTable: row.show_in_table ?? true,
        aiEnabled: row.ai_enabled ?? false,
        aiMatchOnly: row.ai_match_only ?? false,
        aiAliases: row.ai_aliases ?? undefined,
        unit: row.unit ?? undefined,
        options: row.options?.options ?? undefined,
        isRequired: row.is_required ?? false,
        isActive: row.is_active ?? true,
        sortOrder: row.sort_order ?? 0,
      }));
      setExternalJobFields(mapped);
      setExternalJobFieldValues((prev) => {
        const next: Record<string, unknown> = { ...prev };
        mapped.forEach((field) => {
          if (field.fieldType === "toggle" && next[field.id] === undefined) {
            next[field.id] = false;
          }
          if (
            field.key.trim().toLowerCase() === "status" &&
            next[field.id] === undefined
          ) {
            next[field.id] = "requested";
          }
        });
        return next;
      });
    };
    void loadExternalJobFields();
    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !tenantId) {
      setExternalJobValuesByJobId({});
      return;
    }
    const ids = (orderState?.externalJobs ?? []).map((job) => job.id);
    if (ids.length === 0) {
      setExternalJobValuesByJobId({});
      return;
    }
    let isMounted = true;
    const loadExternalJobValues = async () => {
      const { data, error } = await sb
        .from("external_job_field_values")
        .select("external_job_id, field_id, value")
        .eq("tenant_id", tenantId)
        .in("external_job_id", ids);
      if (!isMounted || error) {
        return;
      }
      const next: Record<string, Record<string, unknown>> = {};
      (data ?? []).forEach((row) => {
        if (!next[row.external_job_id]) {
          next[row.external_job_id] = {};
        }
        next[row.external_job_id][row.field_id] = row.value;
      });
      setExternalJobValuesByJobId(next);
    };
    void loadExternalJobValues();
    return () => {
      isMounted = false;
    };
  }, [orderState?.externalJobs, tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !orderState?.id) {
      setOrderInputValues({});
      setOrderInputInitialValues({});
      setConstructionRowsByFieldId({});
      setConstructionInitialRowsByFieldId({});
      setOrderItemsByRowKey({});
      setOrderItemDocumentIdsByRowKey({});
      setBomLinesByOrderItemId({});
      return;
    }
    let isMounted = true;
    const loadOrderInputValues = async () => {
      const { data, error } = await sb
        .from("order_input_values")
        .select("field_id, value")
        .eq("order_id", orderState.id);
      if (!isMounted) {
        return;
      }
      if (error) {
        setOrderInputError(t("orders.detail.errors.loadOrderValues"));
        return;
      }
      setOrderInputError("");
      const nextValues: Record<string, unknown> = {};
      const nextConstructionValues: Record<string, Array<Record<string, unknown>>> =
        {};
      (data ?? []).forEach((row) => {
        nextValues[row.field_id] = row.value ?? undefined;
      });

      const tableFields = orderInputFields.filter(
        (field) => field.fieldType === "table",
      );
      if (tableFields.length > 0) {
        const orderItemsResult = await sb
          .from("order_items")
          .select(
            "id, order_id, source_kind, source_field_id, source_row_id, sort_order, position, item_name, item_type, qty, material, dimensions, attributes, created_at, updated_at",
          )
          .eq("order_id", orderState.id)
          .eq("source_kind", "order_input_table")
          .in(
            "source_field_id",
            tableFields.map((field) => field.id),
          )
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (!isMounted) {
          return;
        }
        if (
          orderItemsResult.data &&
          !isMissingOrderItemsSchema(orderItemsResult.error)
        ) {
          const items = orderItemsResult.data.map(mapOrderItemRow);
          const itemMapByRowKey: Record<string, OrderItem> = {};
          items.forEach((item) => {
            if (!item.sourceFieldId) {
              return;
            }
            itemMapByRowKey[`${item.sourceFieldId}:${item.sourceRowId}`] = item;
          });
          setOrderItemsByRowKey(itemMapByRowKey);
          const documentMap: Record<string, string[]> = {};
          if (items.length > 0) {
            const orderItemIds = items.map((item) => item.id);
            const orderItemMap = new Map(
              items.map((item) => [item.id, item] as const),
            );
            const orderItemDocumentsResult = await sb
              .from("order_item_documents")
              .select("order_item_id, order_attachment_id, sort_order")
              .in("order_item_id", orderItemIds)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true });

            if (
              isMounted &&
              orderItemDocumentsResult.data &&
              !isMissingOrderItemDocumentsSchema(orderItemDocumentsResult.error)
            ) {
              orderItemDocumentsResult.data.forEach((document) => {
                const item = orderItemMap.get(document.order_item_id);
                if (!item?.sourceFieldId) {
                  return;
                }
                const key = `${item.sourceFieldId}:${item.sourceRowId}`;
                documentMap[key] = [
                  ...(documentMap[key] ?? []),
                  document.order_attachment_id,
                ];
              });
            }

            const bomLinesResult = await sb
              .from("order_item_bom_lines")
              .select(
                "id, order_item_id, line_no, component_code, component_name, component_type, qty, unit, length, width, height, attributes, source_kind, sort_order, created_at, updated_at",
              )
              .in("order_item_id", orderItemIds)
              .order("sort_order", { ascending: true })
              .order("line_no", { ascending: true })
              .order("created_at", { ascending: true });

            if (isMounted && bomLinesResult.data) {
              const bomMap: Record<string, OrderItemBomLine[]> = {};
              bomLinesResult.data
                .map((row) => mapOrderItemBomLineRow(row as OrderItemBomLineRow))
                .forEach((line) => {
                  bomMap[line.orderItemId] = [
                    ...(bomMap[line.orderItemId] ?? []),
                    line,
                  ];
                });
              setBomLinesByOrderItemId(bomMap);
            }
          }
          setOrderItemDocumentIdsByRowKey(documentMap);
          tableFields.forEach((field) => {
            delete nextValues[field.id];
            const builtRows = buildTableRowsFromOrderItems(field, items).map(
              (row) =>
                attachOrderInputTableRowDocuments(
                  row,
                  documentMap[
                    `${field.id}:${getOrderInputTableRowId(row) ?? ""}`
                  ] ?? [],
                ),
            );
            nextConstructionValues[field.id] = builtRows;
          });
        } else {
          setOrderItemsByRowKey({});
          setOrderItemDocumentIdsByRowKey({});
          setBomLinesByOrderItemId({});
          tableFields.forEach((field) => {
            delete nextValues[field.id];
            nextConstructionValues[field.id] = [];
          });
        }
      } else {
        setConstructionRowsByFieldId({});
        setConstructionInitialRowsByFieldId({});
      }

      setOrderInputValues(nextValues);
      setOrderInputInitialValues(nextValues);
      setConstructionRowsByFieldId(nextConstructionValues);
      setConstructionInitialRowsByFieldId(nextConstructionValues);
    };
    void loadOrderInputValues();
    return () => {
      isMounted = false;
    };
  }, [orderInputFields, orderState?.id, t]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !orderState?.id) {
      setProductionDisplayStatus(null);
      setProductionCompletionProgress(null);
      return;
    }
    let isMounted = true;
    const loadProductionStatus = async () => {
      const { data, error } = await sb
        .from("production_items")
        .select("status, station_id")
        .eq("order_id", orderState.id);
      if (!isMounted) {
        return;
      }
      if (error || !data || data.length === 0) {
        setProductionDisplayStatus(null);
        setProductionCompletionProgress(null);
        return;
      }
      const completionMode = rules.productionCompletionConfig.mode;
      if (completionMode === "completion_stations_done") {
        const selectedStationIds = new Set(
          rules.productionCompletionConfig.completionStationIds,
        );
        const byStation = new Map<string, Array<{ status: string }>>();
        data.forEach((item) => {
          if (!item.station_id || !selectedStationIds.has(item.station_id)) {
            return;
          }
          const entry = byStation.get(item.station_id) ?? [];
          entry.push({ status: item.status });
          byStation.set(item.station_id, entry);
        });
        const total = byStation.size;
        const done = Array.from(byStation.values()).filter((items) =>
          items.every((item) => item.status === "done"),
        ).length;
        setProductionCompletionProgress({ done, total, mode: "stations" });
      } else {
        const total = data.length;
        const done = data.filter((item) => item.status === "done").length;
        setProductionCompletionProgress({ done, total, mode: "all" });
      }
      const isDone = isOrderProductionComplete(
        data.map((item) => ({
          status: item.status,
          stationId: item.station_id,
        })),
        rules.productionCompletionConfig,
      );
      setProductionDisplayStatus(isDone ? "done" : "in_production");
    };
    void loadProductionStatus();
    return () => {
      isMounted = false;
    };
  }, [orderState?.id, rules.productionCompletionConfig]);

  useEffect(() => {
    if (isAttachmentCategoryManual) {
      return;
    }
    if (!attachmentCategories.some((item) => item.id === attachmentCategory)) {
      setAttachmentCategory(defaultAttachmentCategory);
      return;
    }
    setAttachmentCategory(defaultAttachmentCategory);
  }, [
    attachmentCategories,
    attachmentCategory,
    defaultAttachmentCategory,
    isAttachmentCategoryManual,
  ]);

  const attachments = orderState?.attachments ?? EMPTY_ATTACHMENTS;
  const defaultAiAttachmentCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    const engineeringDefault = rules.attachmentCategoryDefaults?.Engineering;
    const productionDefault = rules.attachmentCategoryDefaults?.Production;
    if (engineeringDefault) {
      ids.add(engineeringDefault);
    }
    if (productionDefault) {
      ids.add(productionDefault);
    }
    return ids;
  }, [rules.attachmentCategoryDefaults]);
  const aiEnabledAttachmentCategoryIds = useMemo(
    () =>
      new Set(
        attachmentCategories
          .filter(
            (item) =>
              "aiParseEnabled" in item &&
              Boolean(
                (item as { aiParseEnabled?: boolean | null }).aiParseEnabled,
              ),
          )
          .map((item) => item.id),
      ),
    [attachmentCategories],
  );
  const effectiveAiAttachmentCategoryIds = useMemo(
    () =>
      aiEnabledAttachmentCategoryIds.size > 0
        ? aiEnabledAttachmentCategoryIds
        : defaultAiAttachmentCategoryIds,
    [aiEnabledAttachmentCategoryIds, defaultAiAttachmentCategoryIds],
  );
  const aiAttachmentCategoryLabels = useMemo(() => {
    const labels = Array.from(effectiveAiAttachmentCategoryIds)
      .map((id) => attachmentCategoryLabels[id] ?? id)
      .filter(Boolean);
    return labels.length > 0
      ? labels
      : [t("orders.detail.aiImport.defaultCategoryLabel")];
  }, [attachmentCategoryLabels, effectiveAiAttachmentCategoryIds, t]);
  const aiAttachmentCategoryHint = aiAttachmentCategoryLabels.join(", ");
  const productionDocumentationParseAttachments = useMemo(
    () =>
      attachments.filter((attachment) => {
        const categoryLabel = attachment.category
          ? (attachmentCategoryLabels[attachment.category] ??
            attachment.category)
          : "";
        const normalizedCategory = categoryLabel.trim().toLowerCase();
        const isConfiguredAiCategory = attachment.category
          ? effectiveAiAttachmentCategoryIds.has(attachment.category)
          : false;
        const isProductionDocumentation =
          isConfiguredAiCategory ||
          normalizedCategory ===
            t("orders.detail.aiImport.defaultCategoryLabel").toLowerCase();
        const nameLower = attachment.name.toLowerCase();
        const mimeLower = (attachment.mimeType ?? "").toLowerCase();
        const isSupported =
          nameLower.endsWith(".pdf") ||
          nameLower.endsWith(".xlsx") ||
          nameLower.endsWith(".xls") ||
          mimeLower.includes("application/pdf") ||
          mimeLower.includes("excel") ||
          mimeLower.includes("spreadsheet");
        return isProductionDocumentation && isSupported;
      }),
    [
      attachments,
      attachmentCategoryLabels,
      effectiveAiAttachmentCategoryIds,
      t,
    ],
  );
  const comments = useMemo(
    () => orderState?.comments ?? [],
    [orderState?.comments],
  );
  const latestComment = useMemo(
    () =>
      comments.reduce<OrderComment | null>((latest, comment) => {
        if (!latest) return comment;
        return new Date(comment.createdAt).getTime() >
          new Date(latest.createdAt).getTime()
          ? comment
          : latest;
      }, null),
    [comments],
  );
  const canManageAllComments =
    isAdmin || isOwner || hasPermission("orders.manage");
  const canRemoveComment = (comment: OrderComment) =>
    canManageAllComments || comment.authorId === userId;
  useEffect(() => {
    const sb = supabase;
    if (!sb || activeTab !== "files") {
      return;
    }
    const pending = attachments.filter(
      (attachment) => attachment.url && !signedAttachmentUrls[attachment.id],
    );
    if (pending.length === 0) {
      return;
    }
    let isMounted = true;
    const signAll = async () => {
      const results = await Promise.all(
        pending.map(async (attachment) => {
          let path = attachment.url as string;
          if (storagePublicPrefix && path.startsWith(storagePublicPrefix)) {
            path = path.slice(storagePublicPrefix.length);
          }
          const { data } = await sb.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }),
      );
      if (!isMounted) {
        return;
      }
      setSignedAttachmentUrls((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if (result.url) {
            next[result.id] = result.url;
          }
        });
        return next;
      });
    };
    signAll();
    return () => {
      isMounted = false;
    };
  }, [activeTab, attachments, signedAttachmentUrls, storagePublicPrefix]);

  useEffect(() => {
    const availableIds = new Set(
      attachments.map((attachment) => attachment.id),
    );
    setSelectedAttachmentIds((prev) => {
      const next = prev.filter((attachmentId) =>
        availableIds.has(attachmentId),
      );
      if (next.length === prev.length) {
        const same = next.every((id, index) => id === prev[index]);
        if (same) {
          return prev;
        }
      }
      return next;
    });
  }, [attachments]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || activeTab !== "external") {
      return;
    }
    const externalAttachments = (orderState?.externalJobs ?? []).flatMap(
      (job) => job.attachments ?? [],
    );
    const pending = externalAttachments.filter(
      (attachment) =>
        attachment.url && !signedExternalAttachmentUrls[attachment.id],
    );
    if (pending.length === 0) {
      return;
    }
    let isMounted = true;
    const signAll = async () => {
      const results = await Promise.all(
        pending.map(async (attachment) => {
          let path = attachment.url as string;
          if (storagePublicPrefix && path.startsWith(storagePublicPrefix)) {
            path = path.slice(storagePublicPrefix.length);
          }
          const { data } = await sb.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }),
      );
      if (!isMounted) {
        return;
      }
      setSignedExternalAttachmentUrls((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if (result.url) {
            next[result.id] = result.url;
          }
        });
        return next;
      });
    };
    signAll();
    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    orderState?.externalJobs,
    signedExternalAttachmentUrls,
    storagePublicPrefix,
  ]);
  const meetsEngineeringChecklist = requiredForEngineering.every(
    (item) => checklistState[item.id],
  );
  const meetsProductionChecklist = requiredForProduction.every(
    (item) => checklistState[item.id],
  );
  const meetsEngineeringAttachments =
    attachments.length >= rules.minAttachmentsForEngineering;
  const meetsEngineeringComment =
    !rules.requireCommentForEngineering || comments.length > 0;
  const meetsProductionComment =
    !rules.requireCommentForProduction || comments.length > 0;
  const attachmentGroups = useMemo(() => {
    const groups = new Map<string, OrderAttachment[]>();
    attachments.forEach((attachment) => {
      const key = attachment.category ?? "uncategorized";
      const current = groups.get(key) ?? [];
      current.push(attachment);
      groups.set(key, current);
    });
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: attachmentCategoryLabels[key] ?? "Uncategorized",
      items,
    }));
  }, [attachmentCategoryLabels, attachments]);
  const latestAttachment = useMemo(
    () =>
      [...attachments]
        .filter((attachment) => Boolean(attachment.createdAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [attachments],
  );
  const selectedAttachmentsCount = selectedAttachmentIds.length;
  const activeOrderInputFields = useMemo(
    () =>
      orderInputFields
        .filter((field) => field.isActive)
        .sort((a, b) => {
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
  const requiredOrderInputFields = activeOrderInputFields.filter(
    (field) => field.isRequired,
  );
  const productionScopedOrderInputFields = activeOrderInputFields.filter(
    (field) =>
      field.showInProduction ||
      field.groupKey === "production_scope" ||
      field.scope === "construction_table" ||
      field.scope === "construction_attribute",
  );
  const requiredProductionOrderInputFields = requiredOrderInputFields.filter(
    (field) =>
      field.showInProduction ||
      field.groupKey === "production_scope" ||
      field.scope === "construction_table" ||
      field.scope === "construction_attribute",
  );
  const completedRequiredOrderInputCount = requiredOrderInputFields.filter(
    (field) =>
      shouldPersistOrderInputValue(
        field,
        normalizeOrderInputValue(field, getFieldCurrentValue(field)),
      ),
  ).length;
  const completedRequiredProductionOrderInputCount =
    requiredProductionOrderInputFields.filter((field) =>
      shouldPersistOrderInputValue(
        field,
        normalizeOrderInputValue(field, getFieldCurrentValue(field)),
      ),
    ).length;
  const persistedProductionOrderInputCount =
    productionScopedOrderInputFields.filter((field) =>
      shouldPersistOrderInputValue(
        field,
        normalizeOrderInputValue(field, getFieldCurrentValue(field)),
      ),
    ).length;
  const hasRequiredOrderInputs =
    completedRequiredOrderInputCount === requiredOrderInputFields.length;
  const hasRequiredProductionOrderInputs =
    requiredProductionOrderInputFields.length > 0
      ? completedRequiredProductionOrderInputCount ===
        requiredProductionOrderInputFields.length
      : persistedProductionOrderInputCount > 0;
  const engineeringAttachmentCategoryId =
    rules.attachmentCategoryDefaults?.Engineering ?? null;
  const engineeringScopedAttachments = engineeringAttachmentCategoryId
    ? attachments.filter(
        (attachment) =>
          attachment.category === engineeringAttachmentCategoryId ||
          attachment.addedByRole === "Engineering",
      )
    : attachments;
  const hasAssignedEngineer = Boolean(orderState?.assignedEngineerId);
  const canAdvanceToEngineering =
    meetsEngineeringChecklist &&
    meetsEngineeringAttachments &&
    meetsEngineeringComment &&
    (!rules.requireOrderInputsForEngineering || hasRequiredOrderInputs);
  const canAdvanceToProduction =
    meetsProductionChecklist &&
    engineeringScopedAttachments.length >= rules.minAttachmentsForProduction &&
    meetsProductionComment &&
    (!rules.requireOrderInputsForProduction ||
      hasRequiredProductionOrderInputs) &&
    hasAssignedEngineer;
  const engineeringGateItems = [
    ...(requiredForEngineering.length > 0
      ? [
          {
            label: t("orders.detail.workflow.gates.checklist"),
            ok: meetsEngineeringChecklist,
            value: `${requiredForEngineering.filter((item) => checklistState[item.id]).length}/${requiredForEngineering.length}`,
          },
        ]
      : []),
    ...(rules.minAttachmentsForEngineering > 0
      ? [
          {
            label: t("orders.detail.workflow.gates.attachments"),
            ok: meetsEngineeringAttachments,
            value: `${Math.min(attachments.length, rules.minAttachmentsForEngineering)}/${rules.minAttachmentsForEngineering}`,
          },
        ]
      : []),
    ...(rules.requireCommentForEngineering
      ? [
          {
            label: t("orders.detail.workflow.gates.comments"),
            ok: meetsEngineeringComment,
            value: `${Math.min(comments.length, 1)}/1`,
          },
        ]
      : []),
    ...(rules.requireOrderInputsForEngineering
      ? [
          {
            label: t("orders.detail.workflow.gates.inputs"),
            ok: hasRequiredOrderInputs,
            value: hasRequiredOrderInputs
              ? t("settings.common.yes")
              : t("settings.common.no"),
          },
        ]
      : []),
  ];
  const productionGateItems = [
    {
      label: engineerLabel,
      ok: hasAssignedEngineer,
      value: hasAssignedEngineer
        ? t("orders.detail.workflow.gates.assigned")
        : t("orders.detail.workflow.gates.missing"),
    },
    ...(requiredForProduction.length > 0
      ? [
          {
            label: t("orders.detail.workflow.gates.checklist"),
            ok: meetsProductionChecklist,
            value: `${requiredForProduction.filter((item) => checklistState[item.id]).length}/${requiredForProduction.length}`,
          },
        ]
      : []),
    ...(rules.minAttachmentsForProduction > 0
      ? [
          {
            label: t("orders.detail.workflow.gates.attachments"),
            ok:
              engineeringScopedAttachments.length >=
              rules.minAttachmentsForProduction,
            value: `${Math.min(engineeringScopedAttachments.length, rules.minAttachmentsForProduction)}/${rules.minAttachmentsForProduction}`,
          },
        ]
      : []),
    ...(rules.requireCommentForProduction
      ? [
          {
            label: t("orders.detail.workflow.gates.comments"),
            ok: meetsProductionComment,
            value: `${Math.min(comments.length, 1)}/1`,
          },
        ]
      : []),
    ...(rules.requireOrderInputsForProduction
      ? [
          {
            label: t("orders.detail.workflow.gates.inputs"),
            ok: hasRequiredProductionOrderInputs,
            value: hasRequiredProductionOrderInputs
              ? t("settings.common.yes")
              : t("settings.common.no"),
          },
        ]
      : []),
  ];
  const activeGateItems = canSendToEngineering
    ? engineeringGateItems
    : canSendToProduction
      ? productionGateItems
      : [];
  const manualExternalJobFields = useMemo(
    () =>
      externalJobFields
        .filter(
          (field) => field.isActive && (field.scope ?? "manual") === "manual",
        )
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }
          return a.label.localeCompare(b.label);
        }),
    [externalJobFields],
  );
  const portalResponseExternalJobFields = useMemo(
    () =>
      externalJobFields
        .filter(
          (field) =>
            field.isActive && (field.scope ?? "manual") === "portal_response",
        )
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }
          return a.label.localeCompare(b.label);
        }),
    [externalJobFields],
  );
  const externalFieldsByKey = useMemo(() => {
    const map = new Map<string, ExternalJobField>();
    manualExternalJobFields.forEach((field) => {
      map.set(field.key.trim().toLowerCase(), field);
    });
    return map;
  }, [manualExternalJobFields]);

  const getExternalFieldValueByKeys = (...keys: string[]) => {
    for (const key of keys) {
      const field = externalFieldsByKey.get(key.trim().toLowerCase());
      if (!field) {
        continue;
      }
      return externalJobFieldValues[field.id];
    }
    return undefined;
  };

  const formatExternalFieldValue = (
    field: ExternalJobField,
    value: unknown,
    mode?: ExternalJob["requestMode"],
    partnerName?: string,
  ): string => {
    const semantic = getExternalFieldSemantic(field);
    const isPortal = mode === "partner_portal";
    const showPending =
      isPortal &&
      (semantic === "external_order" ||
        semantic === "due_date" ||
        semantic === "unit_price");
    if (value === null || value === undefined) {
      if (showPending) {
        return `pending from ${partnerName ?? "partner"}`;
      }
      return "--";
    }
    if (field.fieldType === "toggle") {
      return value === true ? "Yes" : "No";
    }
    if (field.fieldType === "date" && typeof value === "string" && value) {
      return formatDate(value);
    }
    const text = String(value);
    if (!text) {
      if (showPending) {
        return `pending from ${partnerName ?? "partner"}`;
      }
      return "--";
    }
    return field.unit ? `${text} ${field.unit}` : text;
  };
  const constructionTableFields = useMemo(() => {
    const tableFields = activeOrderInputFields.filter(
      (field) => field.fieldType === "table",
    );
    const explicitConstructionTables = tableFields.filter(
      (field) =>
        field.isPrimaryConstructionTable ||
        field.scope === "construction_table",
    );
    const relevantFields =
      explicitConstructionTables.length > 0
        ? explicitConstructionTables
        : tableFields;
    return [...relevantFields].sort((left, right) => {
      const leftPrimary = left.isPrimaryConstructionTable ? 0 : 1;
      const rightPrimary = right.isPrimaryConstructionTable ? 0 : 1;
      if (leftPrimary !== rightPrimary) {
        return leftPrimary - rightPrimary;
      }
      const leftScope = left.scope === "construction_table" ? 0 : 1;
      const rightScope = right.scope === "construction_table" ? 0 : 1;
      if (leftScope !== rightScope) {
        return leftScope - rightScope;
      }
      const leftPriority = left.groupKey === "production_scope" ? 0 : 1;
      const rightPriority = right.groupKey === "production_scope" ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.sortOrder - right.sortOrder;
    });
  }, [activeOrderInputFields]);
  const supplementalOrderInputGroups = useMemo(() => {
    const groups = new Map<string, OrderInputField[]>();
    activeOrderInputFields
      .filter((field) => field.fieldType !== "table")
      .forEach((field) => {
        const current = groups.get(field.groupKey) ?? [];
        current.push(field);
        groups.set(field.groupKey, current);
      });
    return groups;
  }, [activeOrderInputFields]);
  const getConstructionRowKey = useCallback((fieldId: string, row: unknown) => {
    const rowId = getOrderInputTableRowId(row);
    return rowId ? `${fieldId}:${rowId}` : null;
  }, []);
  const getConstructionAttachmentIds = useCallback(
    (fieldId: string, row: unknown) => {
      const rowIds = getOrderInputTableRowAttachmentIds(row);
      const rowKey = getConstructionRowKey(fieldId, row);
      const linkedIds = rowKey ? orderItemDocumentIdsByRowKey[rowKey] ?? [] : [];
      return Array.from(new Set([...linkedIds, ...rowIds]));
    },
    [getConstructionRowKey, orderItemDocumentIdsByRowKey],
  );
  const activeConstructionDetailData = useMemo(() => {
    if (!activeConstructionDetail) {
      return null;
    }
    const field = orderInputFields.find(
      (item) => item.id === activeConstructionDetail.fieldId,
    );
    if (!field || field.fieldType !== "table") {
      return null;
    }
    const rows = getConstructionRows(field.id);
    const row = rows.find(
      (item) => getOrderInputTableRowId(item) === activeConstructionDetail.rowId,
    );
    if (!row) {
      return null;
    }
    const rowKey = `${field.id}:${activeConstructionDetail.rowId}`;
    const orderItem = orderItemsByRowKey[rowKey] ?? null;
    const attachmentIds = getConstructionAttachmentIds(field.id, row);
    const linkedAttachments = attachmentIds
      .map((attachmentId) =>
        attachments.find((attachment) => attachment.id === attachmentId),
      )
      .filter((attachment): attachment is OrderAttachment => Boolean(attachment));
    return {
      field,
      row,
      rowId: activeConstructionDetail.rowId,
      orderItem,
      bomLines: orderItem ? (bomLinesByOrderItemId[orderItem.id] ?? []) : [],
      attachments: linkedAttachments,
    };
  }, [
    activeConstructionDetail,
    attachments,
    bomLinesByOrderItemId,
    getConstructionAttachmentIds,
    getConstructionRows,
    orderInputFields,
    orderItemsByRowKey,
  ]);
  const activeConstructionAttachmentIds = useMemo(
    () =>
      activeConstructionDetailData?.attachments.map((attachment) => attachment.id) ??
      [],
    [activeConstructionDetailData],
  );
  useEffect(() => {
    const sb = supabase;
    if (!sb || activeConstructionAttachmentIds.length === 0) {
      return;
    }
    const pending = attachments.filter(
      (attachment) =>
        activeConstructionAttachmentIds.includes(attachment.id) &&
        attachment.url &&
        !signedAttachmentUrls[attachment.id],
    );
    if (pending.length === 0) {
      return;
    }
    let isMounted = true;
    const signAll = async () => {
      const results = await Promise.all(
        pending.map(async (attachment) => {
          let path = attachment.url as string;
          if (storagePublicPrefix && path.startsWith(storagePublicPrefix)) {
            path = path.slice(storagePublicPrefix.length);
          }
          const { data } = await sb.storage
            .from(supabaseBucket)
            .createSignedUrl(path, 60 * 60);
          return { id: attachment.id, url: data?.signedUrl };
        }),
      );
      if (!isMounted) {
        return;
      }
      setSignedAttachmentUrls((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if (result.url) {
            next[result.id] = result.url;
          }
        });
        return next;
      });
    };
    void signAll();
    return () => {
      isMounted = false;
    };
  }, [
    activeConstructionAttachmentIds,
    attachments,
    signedAttachmentUrls,
    storagePublicPrefix,
  ]);
  const canEditOrderInputs =
    orderState != null
      ? canEditOrderInputsByRole({ role, isAdmin, isOwner }, orderState.status)
      : false;

  const updateBomDraft = useCallback(
    (
      orderItemId: string,
      patch: Partial<OrderItemBomLineDraft> | ((draft: OrderItemBomLineDraft) => OrderItemBomLineDraft),
    ) => {
      setBomDraftsByOrderItemId((prev) => {
        const current = prev[orderItemId] ?? DEFAULT_BOM_DRAFT;
        const nextDraft =
          typeof patch === "function"
            ? patch(current)
            : { ...current, ...patch };
        return {
          ...prev,
          [orderItemId]: nextDraft,
        };
      });
    },
    [],
  );

  const handleSaveBomLine = useCallback(
    async (orderItemId: string) => {
      const sb = supabase;
      if (!sb) {
        notify({
          title: t("header.notificationDefaultTitle"),
          description: t("orders.detail.errors.supabaseNotConfigured"),
          variant: "error",
        });
        return;
      }
      const draft = bomDraftsByOrderItemId[orderItemId] ?? DEFAULT_BOM_DRAFT;
      if (!draft.componentName.trim()) {
        notify({
          title: t("header.notificationDefaultTitle"),
          description: t("orders.detail.orderInputs.bomSaveFailed"),
          variant: "error",
        });
        return;
      }
      const existing = bomLinesByOrderItemId[orderItemId] ?? [];
      const numericOrNull = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const parsed = Number(trimmed.replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      };

      setSavingBomForItemId(orderItemId);
      const { data, error } = await sb
        .from("order_item_bom_lines")
        .insert({
          order_item_id: orderItemId,
          line_no: existing.length,
          component_code: draft.componentCode.trim() || null,
          component_name: draft.componentName.trim(),
          component_type: draft.componentType,
          qty: Number(draft.qty.replace(",", ".")) || 1,
          unit: draft.unit.trim() || "pcs",
          length: numericOrNull(draft.length),
          width: numericOrNull(draft.width),
          height: numericOrNull(draft.height),
          attributes: draft.notes.trim() ? { notes: draft.notes.trim() } : {},
          source_kind: "manual",
          sort_order: existing.length,
        })
        .select(
          "id, order_item_id, line_no, component_code, component_name, component_type, qty, unit, length, width, height, attributes, source_kind, sort_order, created_at, updated_at",
        )
        .single();

      setSavingBomForItemId(null);

      if (error || !data) {
        notify({
          title: t("header.notificationDefaultTitle"),
          description: t("orders.detail.orderInputs.bomSaveFailed"),
          variant: "error",
        });
        return;
      }

      const mapped = mapOrderItemBomLineRow(data as OrderItemBomLineRow);
      setBomLinesByOrderItemId((prev) => ({
        ...prev,
        [orderItemId]: [...(prev[orderItemId] ?? []), mapped].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.lineNo - b.lineNo,
        ),
      }));
      setBomDraftsByOrderItemId((prev) => ({
        ...prev,
        [orderItemId]: DEFAULT_BOM_DRAFT,
      }));
      notify({
        title: t("header.notificationDefaultTitle"),
        description: t("orders.detail.orderInputs.bomSaved"),
      });
    },
    [bomDraftsByOrderItemId, bomLinesByOrderItemId, notify, t],
  );

  const handleDeleteBomLine = useCallback(
    async (line: OrderItemBomLine) => {
      const sb = supabase;
      if (!sb) {
        notify({
          title: t("header.notificationDefaultTitle"),
          description: t("orders.detail.errors.supabaseNotConfigured"),
          variant: "error",
        });
        return;
      }
      if (
        !(await confirmRemove(
          t("orders.detail.orderInputs.bomDelete"),
          t("orders.detail.orderInputs.bomDeleteDescription"),
        ))
      ) {
        return;
      }
      setDeletingBomLineId(line.id);
      const { error } = await sb
        .from("order_item_bom_lines")
        .delete()
        .eq("id", line.id);
      setDeletingBomLineId(null);
      if (error) {
        notify({
          title: t("header.notificationDefaultTitle"),
          description: t("orders.detail.orderInputs.bomDeleteFailed"),
          variant: "error",
        });
        return;
      }
      setBomLinesByOrderItemId((prev) => ({
        ...prev,
        [line.orderItemId]: (prev[line.orderItemId] ?? []).filter(
          (item) => item.id !== line.id,
        ),
      }));
      notify({
        title: t("header.notificationDefaultTitle"),
        description: t("orders.detail.orderInputs.bomDeleted"),
      });
    },
    [confirmRemove, notify, t],
  );

  const renderConstructionBomSection = useCallback(
    (detail: NonNullable<typeof activeConstructionDetailData>) => {
      const orderItemId = detail.orderItem?.id;
      const draft = orderItemId
        ? bomDraftsByOrderItemId[orderItemId] ?? DEFAULT_BOM_DRAFT
        : DEFAULT_BOM_DRAFT;
      return (
        <div className="rounded-md border border-border bg-background px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                {t("orders.detail.orderInputs.bomTitle")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("orders.detail.orderInputs.bomDescription")}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {detail.bomLines.length}
            </div>
          </div>
          {detail.bomLines.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t("orders.detail.orderInputs.bomEmpty")}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {detail.bomLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        {line.componentName}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[
                          line.componentCode,
                          BOM_COMPONENT_TYPE_OPTIONS.find(
                            (option) => option.value === line.componentType,
                          )?.label ?? line.componentType,
                          `${line.qty} ${line.unit}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {(line.length || line.width || line.height) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {[
                            line.length ? `L ${line.length}` : "",
                            line.width ? `W ${line.width}` : "",
                            line.height ? `H ${line.height}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      {typeof line.attributes.notes === "string" &&
                      line.attributes.notes.trim() ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {String(line.attributes.notes)}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDeleteBomLine(line)}
                      disabled={deletingBomLineId === line.id}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {orderItemId ? (
            <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/10 p-3">
              <div className="text-sm font-medium">
                {t("orders.detail.orderInputs.bomAdd")}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={draft.componentName}
                  onChange={(event) =>
                    updateBomDraft(orderItemId, {
                      componentName: event.target.value,
                    })
                  }
                  placeholder={t("orders.detail.orderInputs.bomComponentName")}
                  className="h-9"
                />
                <Input
                  value={draft.componentCode}
                  onChange={(event) =>
                    updateBomDraft(orderItemId, {
                      componentCode: event.target.value,
                    })
                  }
                  placeholder={t("orders.detail.orderInputs.bomComponentCode")}
                  className="h-9"
                />
                <Select
                  value={draft.componentType}
                  onValueChange={(value) =>
                    updateBomDraft(orderItemId, {
                      componentType: value as OrderItemBomLineType,
                    })
                  }
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue
                      placeholder={t("orders.detail.orderInputs.bomComponentType")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {BOM_COMPONENT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Input
                    value={draft.qty}
                    onChange={(event) =>
                      updateBomDraft(orderItemId, { qty: event.target.value })
                    }
                    placeholder={t("orders.detail.orderInputs.bomQty")}
                    className="h-9"
                  />
                  <Input
                    value={draft.unit}
                    onChange={(event) =>
                      updateBomDraft(orderItemId, { unit: event.target.value })
                    }
                    placeholder={t("orders.detail.orderInputs.bomUnit")}
                    className="h-9"
                  />
                </div>
                <Input
                  value={draft.length}
                  onChange={(event) =>
                    updateBomDraft(orderItemId, { length: event.target.value })
                  }
                  placeholder={t("orders.detail.orderInputs.bomLength")}
                  className="h-9"
                />
                <Input
                  value={draft.width}
                  onChange={(event) =>
                    updateBomDraft(orderItemId, { width: event.target.value })
                  }
                  placeholder={t("orders.detail.orderInputs.bomWidth")}
                  className="h-9"
                />
                <Input
                  value={draft.height}
                  onChange={(event) =>
                    updateBomDraft(orderItemId, { height: event.target.value })
                  }
                  placeholder={t("orders.detail.orderInputs.bomHeight")}
                  className="h-9"
                />
                <Input
                  value={draft.notes}
                  onChange={(event) =>
                    updateBomDraft(orderItemId, { notes: event.target.value })
                  }
                  placeholder={t("orders.detail.orderInputs.bomNotes")}
                  className="h-9"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void handleSaveBomLine(orderItemId)}
                  disabled={savingBomForItemId === orderItemId}
                >
                  {savingBomForItemId === orderItemId
                    ? t("orders.detail.orderInputs.bomAdding")
                    : t("orders.detail.orderInputs.bomSave")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      );
    },
    [
      bomDraftsByOrderItemId,
      deletingBomLineId,
      handleDeleteBomLine,
      handleSaveBomLine,
      savingBomForItemId,
      t,
      updateBomDraft,
    ],
  );

  function normalizeOrderInputValue(field: OrderInputField, value: unknown) {
    if (field.fieldType === "table") {
      return ensureOrderInputTableRows(value);
    }
    if (field.fieldType === "toggle_number") {
      const raw =
        typeof value === "object" && value !== null
          ? (value as { enabled?: boolean; amount?: number | string | null })
          : {};
      const enabled = Boolean(raw.enabled);
      const amount =
        raw.amount === "" || raw.amount === null || raw.amount === undefined
          ? null
          : Number(raw.amount);
      return { enabled, amount: Number.isNaN(amount) ? null : amount };
    }
    if (field.fieldType === "toggle") {
      return Boolean(value);
    }
    if (field.fieldType === "number") {
      if (value === "" || value === null || value === undefined) {
        return null;
      }
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (field.fieldType === "date") {
      return typeof value === "string" ? value : "";
    }
    return typeof value === "string" ? value : (value ?? "");
  }
  function shouldPersistOrderInputValue(
    field: OrderInputField,
    value: unknown,
  ) {
    const normalized = normalizeOrderInputValue(field, value);
    if (field.fieldType === "table") {
      const rows = normalized as Array<Record<string, unknown>>;
      return rows.some((row) => !isOrderInputTableRowEmpty(row));
    }
    if (field.fieldType === "toggle_number") {
      const payload = normalized as { enabled: boolean; amount: number | null };
      return payload.enabled || payload.amount !== null;
    }
    if (field.fieldType === "toggle") {
      return true;
    }
    if (field.fieldType === "number") {
      return normalized !== null;
    }
    if (field.fieldType === "date") {
      return Boolean(normalized);
    }
    return Boolean(String(normalized ?? "").trim());
  }
  const normalizeAiCellValue = (
    value: unknown,
    column: OrderInputTableColumn,
  ): unknown => {
    if (column.fieldType === "number") {
      if (typeof value === "number") {
        return String(value);
      }
      return typeof value === "string" ? value.trim() : "";
    }
    if (column.fieldType === "select") {
      const maxSelect = Math.max(1, Math.min(3, column.maxSelect ?? 1));
      const options = (column.options ?? []).map((item) => item.trim());
      const optionMap = new Map(
        options.map((item) => [item.trim().toLowerCase(), item]),
      );
      const values = Array.isArray(value)
        ? value
            .map((item) =>
              typeof item === "string" ? item.trim() : String(item ?? ""),
            )
            .filter(Boolean)
        : typeof value === "string"
          ? value
              .split(/[\/;,\n]+/)
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
      const normalizedValues = values.map((item) => {
        const mapped = optionMap.get(item.toLowerCase());
        return mapped ?? item;
      });
      if (maxSelect === 1) {
        return normalizedValues[0] ?? "";
      }
      return normalizedValues.slice(0, maxSelect);
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return value === null || value === undefined ? "" : String(value);
  };
  const normalizeAiTableRows = (
    rows: unknown[],
    columns: OrderInputTableColumn[],
    options?: { attachmentId?: string },
  ) => {
    return rows
      .map((row) => {
        if (!row || typeof row !== "object") {
          return null;
        }
        const source = row as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        columns.forEach((column) => {
          const fromKey = source[column.key];
          const fromLabel = source[column.label];
          const fromAiKey = column.aiKey ? source[column.aiKey] : undefined;
          const rawValue =
            fromKey !== undefined
              ? fromKey
              : fromLabel !== undefined
                ? fromLabel
                : fromAiKey !== undefined
                  ? fromAiKey
                  : "";
          next[column.key] = normalizeAiCellValue(rawValue, column);
        });
        const hasAnyValue = columns.some((column) => {
          const value = next[column.key];
          if (Array.isArray(value)) {
            return value.length > 0;
          }
          return String(value ?? "").trim().length > 0;
        });
        if (!hasAnyValue) {
          return null;
        }
        return options?.attachmentId
          ? attachOrderInputTableRowDocuments(next, [options.attachmentId])
          : next;
      })
      .filter((row): row is Record<string, unknown> => Boolean(row));
  };
  const isOrderInputsDirty = useMemo(
    () =>
      activeOrderInputFields.some((field) => {
        if (field.fieldType === "table") {
          const current = ensureOrderInputTableRows(
            constructionRowsByFieldId[field.id],
          );
          const initial = ensureOrderInputTableRows(
            constructionInitialRowsByFieldId[field.id],
          );
          return JSON.stringify(current) !== JSON.stringify(initial);
        }
        const current = normalizeOrderInputValue(
          field,
          orderInputValues[field.id],
        );
        const initial = normalizeOrderInputValue(
          field,
          orderInputInitialValues[field.id],
        );
        return JSON.stringify(current) !== JSON.stringify(initial);
      }),
    [
      activeOrderInputFields,
      constructionInitialRowsByFieldId,
      constructionRowsByFieldId,
      orderInputInitialValues,
      orderInputValues,
    ],
  );
  if (!orderState && (isLoadingOrder || isOrdersLoading || !showNotFound)) {
    return (
      <section className="space-y-3 pt-20">
        <h1 className="text-xl font-semibold">
          {t("orders.detail.loadingTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("orders.detail.loadingDescription")}
        </p>
        <LoadingSpinner label={t("orders.detail.loadingSpinner")} />
      </section>
    );
  }

  const detailTabs = [
    { value: "overview", label: t("orders.detail.tabs.overview") },
    { value: "files", label: t("orders.detail.tabs.files") },
    { value: "details", label: t("orders.detail.tabs.details") },
    { value: "external", label: t("orders.detail.tabs.external") },
    { value: "history", label: t("orders.detail.tabs.history") },
  ];
  const activeDetailTab =
    detailTabs.find((tab) => tab.value === activeTab) ?? detailTabs[0];

  if (!orderState) {
    return (
      <section className="space-y-4 md:space-y-6">
        <div className="desktop-sticky-bleed sticky top-0 z-30 bg-background/95 pb-2 backdrop-blur md:desktop-sticky-bleed-no-shadow">
          <Tabs value="overview" className="pointer-events-none">
            <DetailTabsBar
              backHref="/orders"
              backLabel={t("orders.detail.back")}
              tabs={detailTabs}
              disabled
              className="pb-1"
            />
          </Tabs>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("orders.detail.notFoundTitle")}</CardTitle>
            <CardDescription>
              {t("orders.detail.notFoundDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => router.push("/orders")}>
                {t("orders.detail.back")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const priorityVariant =
    orderState.priority === "low"
      ? "priority-low"
      : orderState.priority === "high"
        ? "priority-high"
        : orderState.priority === "urgent"
          ? "priority-urgent"
          : "priority-normal";
  const displayStatus = productionDisplayStatus ?? orderState.status;
  const statusVariant =
    displayStatus === "draft"
      ? "status-draft"
      : displayStatus === "ready_for_engineering"
        ? "status-ready_for_engineering"
        : displayStatus === "in_engineering"
          ? "status-in_engineering"
          : displayStatus === "engineering_blocked"
            ? "status-engineering_blocked"
            : displayStatus === "in_production"
              ? "status-in_production"
              : displayStatus === "done"
                ? "status-done"
                : "status-ready_for_production";
  const externalJobStatusLabels: Record<ExternalJobStatus, string> = {
    ...rules.externalJobStatusLabels,
    requested: t("orders.detail.external.status.requested"),
    ordered: t("orders.detail.external.status.ordered"),
    in_progress: t("orders.detail.external.status.inProgress"),
    delivered: t("orders.detail.external.status.delivered"),
    approved: t("orders.detail.external.status.approved"),
    cancelled: t("orders.detail.external.status.cancelled"),
  };
  const externalJobStatusVariant = (status: ExternalJobStatus) => {
    switch (status) {
      case "requested":
        return "status-pending";
      case "ordered":
        return "status-planned";
      case "in_progress":
        return "status-in_progress";
      case "delivered":
      case "approved":
        return "status-completed";
      case "cancelled":
        return "status-cancelled";
      default:
        return "secondary";
    }
  };
  const externalMinAttachmentsForStatus = (status: ExternalJobStatus) => {
    const rule = rules.externalJobRules.find((item) => item.status === status);
    return rule?.minAttachments ?? 0;
  };
  const dueInDays = getDaysFromToday(orderState.dueDate);
  const dueState =
    displayStatus === "done" || dueInDays === null
      ? null
      : dueInDays < 0
        ? {
            tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
            label: t("orders.detail.hero.daysLate", {
              count: Math.abs(dueInDays),
            }),
          }
        : dueInDays === 0
          ? {
              tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
              label: t("orders.detail.hero.dueToday"),
            }
          : dueInDays <= 3
            ? {
                tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
                label: t("orders.detail.hero.dueInDays", {
                  count: dueInDays,
                }),
              }
            : null;
  const dueRiskKpi = dueState
    ? {
        value: dueState.label,
        tone: dueState.tone,
      }
    : {
        value:
          displayStatus === "done"
            ? t("orders.detail.hero.completed")
            : t("orders.detail.overview.onTrack"),
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
      };
  const progressPercent = productionCompletionProgress
    ? Math.round(
        (productionCompletionProgress.done /
          Math.max(productionCompletionProgress.total, 1)) *
          100,
      )
    : displayStatus === "done"
      ? 100
      : displayStatus === "in_production"
        ? 75
        : displayStatus === "ready_for_production"
          ? 60
          : displayStatus === "engineering_blocked"
            ? 35
            : displayStatus === "in_engineering"
              ? 35
              : displayStatus === "ready_for_engineering"
                ? 15
                : 0;
  const productionSummary = productionCompletionProgress
    ? `${productionCompletionProgress.done} / ${productionCompletionProgress.total} ${
        productionCompletionProgress.mode === "stations"
          ? t("orders.detail.productionCompletion.stations")
          : t("orders.detail.productionCompletion.items")
      }`
    : displayStatus === "done"
      ? t("orders.detail.hero.completed")
      : displayStatus === "in_production"
        ? t("orders.detail.hero.inProgress")
        : t("orders.detail.hero.notStarted");
  const customFieldRows = [
    ...activeLevels.map((level) => {
      const valueId = orderState.orderFieldValues?.[level.id];
      return {
        id: level.id,
        label: level.name,
        value: valueId
          ? (orderState.orderFieldLabels?.[level.id] ?? valueId)
          : "--",
      };
    }),
  ];
  const activeExternalJobsCount = visibleExternalJobs.filter(
    (job) => !["approved", "cancelled"].includes(job.status),
  ).length;
  const invoicePriceField = externalJobFields.find(
    (field) => field.fieldRole === "invoice_price",
  );
  const plannedPriceField = externalJobFields.find(
    (field) => field.fieldRole === "planned_price",
  );
  const externalCostTotal = visibleExternalJobs.reduce((total, job) => {
    const invoiceValue = invoicePriceField
      ? parseMoneyValue(
          externalJobValuesByJobId[job.id]?.[invoicePriceField.id],
        )
      : null;
    const plannedValue = plannedPriceField
      ? parseMoneyValue(
          externalJobValuesByJobId[job.id]?.[plannedPriceField.id],
        )
      : null;
    return total + (invoiceValue ?? plannedValue ?? 0);
  }, 0);
  const externalCostLabel =
    externalCostTotal > 0
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 2,
        }).format(externalCostTotal)
      : "--";
  const heroKpis = [
    {
      key: "due-risk",
      title: t("orders.detail.hero.dueRisk"),
      value: dueRiskKpi.value,
      meta: formatDate(orderState.dueDate),
      className: dueRiskKpi.tone,
      valueClassName: "text-lg font-semibold md:text-xl",
      titleClassName: "opacity-80",
      metaClassName: "opacity-80",
    },
    {
      key: "progress",
      title: t("orders.detail.hero.progress"),
      value: `${progressPercent}%`,
      className: "border-border bg-muted/20",
      valueClassName: "text-xl font-semibold md:text-2xl",
      titleClassName: "text-muted-foreground",
    },
    {
      key: "production",
      title: t("orders.detail.hero.production"),
      value: productionSummary,
      className: "border-border bg-muted/20",
      valueClassName: "text-lg font-semibold md:text-xl",
      titleClassName: "text-muted-foreground",
    },
    ...(externalCostTotal > 0
      ? [
          {
            key: "external-cost",
            title: t("orders.detail.hero.externalCost"),
            value: externalCostLabel,
            className: "border-border bg-muted/20",
            valueClassName: "text-xl font-semibold md:text-2xl",
            titleClassName: "text-muted-foreground",
          },
        ]
      : []),
  ] as const;
  const heroKpiGridClass =
    heroKpis.length >= 4
      ? "xl:grid-cols-4"
      : heroKpis.length === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-2";
  const orderTitle = `#${orderState.orderNumber} - ${orderState.customerName}`;
  const createdByDisplayName =
    orderState.createdByName ?? t("orders.detail.system");
  const updatedByDisplayName =
    orderState.updatedByName ??
    orderState.createdByName ??
    t("orders.detail.system");
  const getInlineFieldValue = (fieldId: string) => {
    switch (fieldId) {
      case "customerName":
        return orderState.customerName ?? "";
      case "dueDate":
        return orderState.dueDate ?? "";
      case "quantity":
        return orderState.quantity != null ? String(orderState.quantity) : "";
      case "priority":
        return orderState.priority ?? "normal";
      case "assignedEngineer":
        return orderState.assignedEngineerId ?? "";
      case "assignedManager":
        return orderState.assignedManagerId ?? "";
      case "deliveryAddress":
        return deliveryAddressField
          ? ((orderState.orderFieldValues?.[deliveryAddressField.id] as
              | string
              | undefined) ?? "")
          : "";
      case "customerPhone":
        return customerPhoneField
          ? ((orderState.orderFieldValues?.[customerPhoneField.id] as
              | string
              | undefined) ?? "")
          : "";
      default:
        return "";
    }
  };
  const openInlineField = (fieldId: string) => {
    if (!canEditInlineField(fieldId) || isSavingInlineField) {
      return;
    }
    setInlineEditingField(fieldId);
    setInlineDraftValue(getInlineFieldValue(fieldId));
  };
  const closeInlineField = () => {
    setInlineEditingField(null);
    setInlineDraftValue("");
  };
  const renderInlineEditButton = (fieldId: string) =>
    canEditInlineField(fieldId) ? (
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={() => openInlineField(fieldId)}
        aria-label={t("orders.detail.editOrder")}
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </Button>
    ) : null;
  const saveInlineField = async () => {
    if (
      !inlineEditingField ||
      !orderState ||
      !canEditInlineField(inlineEditingField)
    ) {
      return;
    }

    const rawValue = inlineDraftValue.trim();
    let patch: Parameters<typeof updateOrder>[1] | null = null;

    if (inlineEditingField === "customerName") {
      patch = { customerName: rawValue };
      setOrderState((prev) =>
        prev ? { ...prev, customerName: rawValue } : prev,
      );
    } else if (inlineEditingField === "dueDate") {
      patch = { dueDate: inlineDraftValue };
      setOrderState((prev) =>
        prev ? { ...prev, dueDate: inlineDraftValue } : prev,
      );
    } else if (inlineEditingField === "quantity") {
      const parsed = Number(inlineDraftValue);
      if (!Number.isFinite(parsed)) {
        return;
      }
      patch = { quantity: parsed };
      setOrderState((prev) => (prev ? { ...prev, quantity: parsed } : prev));
    } else if (inlineEditingField === "priority") {
      patch = {
        priority: inlineDraftValue as Order["priority"],
      };
      setOrderState((prev) =>
        prev
          ? { ...prev, priority: inlineDraftValue as Order["priority"] }
          : prev,
      );
    } else if (inlineEditingField === "assignedEngineer") {
      const engineer = engineers.find((item) => item.id === inlineDraftValue);
      patch = {
        assignedEngineerId: inlineDraftValue,
        assignedEngineerName: engineer?.name ?? "",
      };
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              assignedEngineerId: inlineDraftValue || undefined,
              assignedEngineerName: engineer?.name ?? undefined,
            }
          : prev,
      );
    } else if (inlineEditingField === "assignedManager") {
      const manager = managers.find((item) => item.id === inlineDraftValue);
      patch = {
        assignedManagerId: inlineDraftValue,
        assignedManagerName: manager?.name ?? "",
      };
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              assignedManagerId: inlineDraftValue || undefined,
              assignedManagerName: manager?.name ?? undefined,
            }
          : prev,
      );
    } else if (
      inlineEditingField === "deliveryAddress" &&
      deliveryAddressField
    ) {
      const nextValues = {
        ...(orderState.orderFieldValues ?? {}),
        [deliveryAddressField.id]: rawValue,
      };
      patch = { orderFieldValues: nextValues };
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              orderFieldValues: nextValues,
              orderFieldLabels: {
                ...(prev.orderFieldLabels ?? {}),
                [deliveryAddressField.id]: rawValue,
              },
            }
          : prev,
      );
    } else if (inlineEditingField === "customerPhone" && customerPhoneField) {
      const nextValues = {
        ...(orderState.orderFieldValues ?? {}),
        [customerPhoneField.id]: rawValue,
      };
      patch = { orderFieldValues: nextValues };
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              orderFieldValues: nextValues,
              orderFieldLabels: {
                ...(prev.orderFieldLabels ?? {}),
                [customerPhoneField.id]: rawValue,
              },
            }
          : prev,
      );
    } else if (inlineEditingField.startsWith("orderField:")) {
      const fieldId = inlineEditingField.replace("orderField:", "");
      const nextValues = {
        ...(orderState.orderFieldValues ?? {}),
        [fieldId]: rawValue,
      };
      patch = { orderFieldValues: nextValues };
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              orderFieldValues: nextValues,
              orderFieldLabels: {
                ...(prev.orderFieldLabels ?? {}),
                [fieldId]: rawValue,
              },
            }
          : prev,
      );
    }

    if (!patch) {
      return;
    }

    try {
      setIsSavingInlineField(true);
      await updateOrder(orderState.id, patch);
      closeInlineField();
    } finally {
      setIsSavingInlineField(false);
    }
  };
  const engineeringHealth = engineeringTiming?.inProgress
    ? {
        title: t("orders.detail.overview.engineering"),
        value: t("orders.detail.hero.inProgress"),
        tone: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200",
      }
    : displayStatus === "engineering_blocked"
      ? {
          title: t("orders.detail.overview.engineering"),
          value: t("orders.detail.overview.blocked"),
          tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
        }
      : {
          title: t("orders.detail.overview.engineering"),
          value: t("orders.detail.overview.onTrack"),
          tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
        };
  const externalHealth =
    activeExternalJobsCount > 0
      ? {
          title: t("orders.detail.overview.external"),
          value: t("orders.detail.overview.activeJobs", {
            count: activeExternalJobsCount,
          }),
          tone: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200",
        }
      : {
          title: t("orders.detail.overview.external"),
          value: t("orders.detail.overview.none"),
          tone: "border-muted bg-muted/20 text-foreground",
        };
  const blockedHealth =
    displayStatus === "engineering_blocked"
      ? {
          title: t("orders.detail.overview.blockedState"),
          value: getOrderStatusLabel(
            displayStatus,
            t,
            statusLabel(displayStatus),
          ),
          tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
        }
      : null;
  type TopActionButton = {
    key: string;
    label: string;
    onClick: () => void;
    disabled: boolean;
    variant: "default" | "outline";
  };
  const topActionButtons: TopActionButton[] = [
    canSendToEngineering
      ? {
          key: "ready_for_engineering",
          label: t("orders.detail.workflow.sendToEngineering"),
          onClick: () => {
            void handleStatusChange("ready_for_engineering");
          },
          disabled: !canAdvanceToEngineering,
          variant: "default" as const,
        }
      : null,
    canStartEngineering
      ? {
          key: "in_engineering",
          label: t("orders.detail.workflow.startEngineering"),
          onClick: () => {
            void handleStatusChange("in_engineering");
          },
          disabled: false,
          variant: "default" as const,
        }
      : null,
    canSendToProduction
      ? {
          key: "ready_for_production",
          label: statusLabel("ready_for_production"),
          onClick: () => {
            void handleStatusChange("ready_for_production");
          },
          disabled: !canAdvanceToProduction,
          variant: "default" as const,
        }
      : null,
    canSendBack
      ? {
          key: "send_back",
          label: t("orders.detail.sendBack"),
          onClick: () => setIsReturnOpen(true),
          disabled: false,
          variant: "outline" as const,
        }
      : null,
    canTakeOrder
      ? {
          key: "take_order",
          label: t("orders.page.takeOrder"),
          onClick: () => {
            void handleTakeOrder();
          },
          disabled: false,
          variant: "outline" as const,
        }
      : null,
    canReturnToQueue
      ? {
          key: "return_to_queue",
          label: t("orders.detail.workflow.returnToQueue"),
          onClick: () => {
            void handleReturnToQueue();
          },
          disabled: false,
          variant: "outline" as const,
        }
      : null,
  ].filter((action): action is TopActionButton => action !== null);
  const buildExternalTimeline = (job: ExternalJob) => {
    const events: Array<{ label: string; at: string }> = [
      {
        label: t("orders.detail.external.timeline.created"),
        at: job.createdAt,
      },
    ];
    if (job.partnerRequestSentAt) {
      events.push({
        label: t("orders.detail.external.timeline.sent"),
        at: job.partnerRequestSentAt,
      });
    }
    if (job.partnerRequestViewedAt) {
      events.push({
        label: t("orders.detail.external.timeline.viewed"),
        at: job.partnerRequestViewedAt,
      });
    }
    if (job.partnerResponseSubmittedAt) {
      events.push({
        label: t("orders.detail.external.timeline.responded"),
        at: job.partnerResponseSubmittedAt,
      });
    }
    const confirmed = (job.statusHistory ?? []).find(
      (entry) => entry.status === "approved" || entry.status === "delivered",
    );
    if (confirmed) {
      events.push({
        label: t("orders.detail.external.timeline.confirmedManually"),
        at: confirmed.changedAt,
      });
    }
    return events
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((item) => ({
        ...item,
        at: formatDateTime(item.at),
      }));
  };
  function handleFilesAdded(files: FileList | File[]) {
    const next = Array.from(files);
    if (next.length === 0) {
      return;
    }
    const oversized = next.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setAttachmentError(
        `${oversized.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
      );
      return;
    }
    setAttachmentError("");
    setAttachmentFiles((prev) => [...prev, ...next]);
  }

  async function handleRemovePendingFile(index: number) {
    const target = attachmentFiles[index];
    const label = target?.name
      ? t("orders.detail.confirm.removeNamedFile", { name: target.name })
      : t("orders.detail.confirm.removeFile");
    if (!(await confirmRemove(label))) {
      return;
    }
    setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleAddAttachment() {
    if (!orderState) {
      return;
    }
    if (attachmentFiles.length === 0) {
      return;
    }
    setAttachmentError("");
    setAttachmentNotice("");
    setIsUploading(true);

    const uploadedAttachments: OrderAttachment[] = [];
    try {
      for (const file of attachmentFiles) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setAttachmentError(
            `${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
          );
          continue;
        }
        const result = await uploadOrderAttachment(file, orderState.id);
        if (result.error || !result.attachment) {
          const rawError =
            result.error ?? t("orders.detail.errors.uploadFailed");
          if (rawError.toLowerCase().includes("mime type")) {
            setAttachmentError(
              t("orders.detail.errors.uploadBlockedByMimeRules"),
            );
          } else {
            setAttachmentError(rawError);
          }
          continue;
        }
        const created = await addOrderAttachment(orderState.id, {
          name: result.attachment.name,
          url: result.attachment.url,
          size: result.attachment.size,
          mimeType: result.attachment.mimeType,
          addedBy: name,
          addedByRole: role,
          category: attachmentCategory,
        });
        if (created) {
          uploadedAttachments.push(created);
        }
      }

      if (uploadedAttachments.length > 0) {
        const nextAttachments = [...uploadedAttachments, ...attachments];
        setOrderState((prev) =>
          prev ? { ...prev, attachments: nextAttachments } : prev,
        );
        setAttachmentFiles([]);
      }
      if (uploadedAttachments.length === 0 && attachmentError) {
        setAttachmentNotice(t("orders.detail.errors.uploadFailedCheckBucket"));
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAddComment() {
    if (!orderState) {
      return;
    }
    const trimmedMessage = commentMessage.trim();
    if (!trimmedMessage) {
      return;
    }
    const created = await addOrderComment(orderState.id, {
      message: trimmedMessage,
      author: name,
      authorRole: role,
    });
    if (created) {
      const nextComments = [created, ...comments];
      setOrderState((prev) =>
        prev ? { ...prev, comments: nextComments } : prev,
      );
      setCommentMessage("");
    }
  }

  async function handleSaveOrderInputs() {
    if (!supabase || !orderState?.id) {
      return;
    }
    setIsSavingOrderInputs(true);
    setOrderInputError("");
    const upsertRows: Array<{
      order_id: string;
      field_id: string;
      value: unknown;
    }> = [];
    const deleteFieldIds: string[] = [];
    activeOrderInputFields.forEach((field) => {
      if (field.fieldType === "table") {
        deleteFieldIds.push(field.id);
        return;
      }
      const value = normalizeOrderInputValue(field, orderInputValues[field.id]);
      if (shouldPersistOrderInputValue(field, value)) {
        upsertRows.push({
          order_id: orderState.id,
          field_id: field.id,
          value,
        });
      } else {
        deleteFieldIds.push(field.id);
      }
    });

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("order_input_values")
        .upsert(upsertRows, { onConflict: "order_id,field_id" });
      if (error) {
        setOrderInputError(t("orders.detail.errors.saveOrderInputs"));
        setIsSavingOrderInputs(false);
        return;
      }
    }

    if (deleteFieldIds.length > 0) {
      const { error } = await supabase
        .from("order_input_values")
        .delete()
        .eq("order_id", orderState.id)
        .in("field_id", deleteFieldIds);
      if (error) {
        setOrderInputError(t("orders.detail.errors.clearOrderInputs"));
        setIsSavingOrderInputs(false);
        return;
      }
    }

    const tableFields = activeOrderInputFields.filter(
      (field) => field.fieldType === "table",
    );
    if (tableFields.length > 0) {
      const desiredItems = tableFields.flatMap((field) =>
        buildOrderItemsFromTableField({
          orderId: orderState.id,
          field,
          value: constructionRowsByFieldId[field.id],
        }),
      );
      const tableFieldIds = tableFields.map((field) => field.id);
      const existingItemsResult = await supabase
        .from("order_items")
        .select("id, source_field_id, source_row_id")
        .eq("order_id", orderState.id)
        .eq("source_kind", "order_input_table")
        .in("source_field_id", tableFieldIds);

      if (
        existingItemsResult.error &&
        !isMissingOrderItemsSchema(existingItemsResult.error)
      ) {
        setOrderInputError(existingItemsResult.error.message);
        setIsSavingOrderInputs(false);
        return;
      }

      if (!isMissingOrderItemsSchema(existingItemsResult.error)) {
        const desiredKeys = new Set(
          desiredItems.map(
            (item) => `${item.source_field_id}:${item.source_row_id}`,
          ),
        );
        const idsToDelete = (existingItemsResult.data ?? [])
          .filter((item) => {
            const key = `${item.source_field_id}:${item.source_row_id}`;
            return !desiredKeys.has(key);
          })
          .map((item) => item.id);

        if (idsToDelete.length > 0) {
          const { error: deleteOrderItemsError } = await supabase
            .from("order_items")
            .delete()
            .in("id", idsToDelete);
          if (deleteOrderItemsError) {
            setOrderInputError(deleteOrderItemsError.message);
            setIsSavingOrderInputs(false);
            return;
          }
        }

        if (desiredItems.length > 0) {
          const { error: upsertOrderItemsError } = await supabase
            .from("order_items")
            .upsert(desiredItems, {
              onConflict: "order_id,source_kind,source_field_id,source_row_id",
            });
          if (upsertOrderItemsError) {
            setOrderInputError(upsertOrderItemsError.message);
            setIsSavingOrderInputs(false);
            return;
          }
        }

        const savedItemsResult = await supabase
          .from("order_items")
          .select(
            "id, order_id, source_kind, source_field_id, source_row_id, sort_order, position, item_name, item_type, qty, material, dimensions, attributes, created_at, updated_at",
          )
          .eq("order_id", orderState.id)
          .eq("source_kind", "order_input_table")
          .in("source_field_id", tableFieldIds);

        if (
          savedItemsResult.error &&
          !isMissingOrderItemsSchema(savedItemsResult.error)
        ) {
          setOrderInputError(savedItemsResult.error.message);
          setIsSavingOrderInputs(false);
          return;
        }

        if (!isMissingOrderItemsSchema(savedItemsResult.error)) {
          const savedItems = (savedItemsResult.data ?? []).map(mapOrderItemRow);
          const desiredDocuments = tableFields.flatMap((field) =>
            buildOrderItemDocumentsFromTableField({
              fieldId: field.id,
              rows: constructionRowsByFieldId[field.id],
              orderItems: savedItems,
            }),
          );

          const itemIds = savedItems.map((item) => item.id);
          if (itemIds.length > 0) {
            const existingDocumentsResult = await supabase
              .from("order_item_documents")
              .select("id, order_item_id")
              .in("order_item_id", itemIds);

            if (
              existingDocumentsResult.error &&
              !isMissingOrderItemDocumentsSchema(existingDocumentsResult.error)
            ) {
              setOrderInputError(existingDocumentsResult.error.message);
              setIsSavingOrderInputs(false);
              return;
            }

            if (
              !isMissingOrderItemDocumentsSchema(existingDocumentsResult.error)
            ) {
              const existingIds = (existingDocumentsResult.data ?? []).map(
                (item) => item.id,
              );
              if (existingIds.length > 0) {
                const { error: deleteDocumentsError } = await supabase
                  .from("order_item_documents")
                  .delete()
                  .in("id", existingIds);
                if (deleteDocumentsError) {
                  setOrderInputError(deleteDocumentsError.message);
                  setIsSavingOrderInputs(false);
                  return;
                }
              }

              if (desiredDocuments.length > 0) {
                const { error: insertDocumentsError } = await supabase
                  .from("order_item_documents")
                  .insert(desiredDocuments);
                if (insertDocumentsError) {
                  setOrderInputError(insertDocumentsError.message);
                  setIsSavingOrderInputs(false);
                  return;
                }
              }
            }
          }
        }
      }
    }

    setOrderInputInitialValues({ ...orderInputValues });
    setConstructionInitialRowsByFieldId({ ...constructionRowsByFieldId });
    setOrderInputError("");
    setIsSavingOrderInputs(false);
  }

  async function handleParseTableFieldWithAi(field: OrderInputField) {
    if (!orderState) {
      return;
    }
    if (field.fieldType !== "table") {
      return;
    }
    const availableParseAttachments = productionDocumentationParseAttachments;
    if (availableParseAttachments.length === 0) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: t("orders.detail.aiImport.noSupportedFilesInCategories", {
          categories: aiAttachmentCategoryHint,
        }),
      }));
      return;
    }
    const attachmentId = tableImportAttachmentIds[field.id];
    if (!attachmentId) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: t("orders.detail.aiImport.chooseFileFromCategories", {
          categories: aiAttachmentCategoryHint,
        }),
      }));
      return;
    }
    const sb = supabase;
    if (!sb) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: t("orders.detail.errors.supabaseNotConfigured"),
      }));
      return;
    }
    if (!canUseAiOrderInputImport) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: t("orders.detail.errors.aiImportProOnly"),
      }));
      return;
    }
    const columns = field.columns ?? [];
    if (columns.length === 0) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: t("orders.detail.aiImport.addTableColumnsFirst"),
      }));
      return;
    }

    const {
      data: { session },
    } = await sb.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: t("orders.detail.errors.signInAgain"),
      }));
      return;
    }

    setIsParsingTableFieldId(field.id);
    setTableImportNotices((prev) => ({ ...prev, [field.id]: "" }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 95000);
      let response: Response;
      try {
        response = await fetch("/api/order-inputs/ai-parse", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId: orderState.id,
            attachmentId,
            columns: columns.map((column) => ({
              key: column.key,
              label: column.label,
              aiKey: column.aiKey,
              fieldType: column.fieldType,
              options: column.options ?? [],
              maxSelect: column.maxSelect ?? 1,
            })),
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        rows?: unknown[];
        parserModel?: string;
      };
      if (!response.ok) {
        const message =
          payload.error === "feature_not_available"
            ? t("orders.detail.errors.aiImportProOnly")
            : (payload.error ?? t("orders.detail.errors.parsePdfFailed"));
        setTableImportNotices((prev) => ({ ...prev, [field.id]: message }));
        return;
      }
      const normalizedRows = normalizeAiTableRows(payload.rows ?? [], columns, {
        attachmentId,
      });
      let totalRowsCount = normalizedRows.length;
      setConstructionRowsByFieldId((prev) => {
        const existingRows = ensureOrderInputTableRows(prev[field.id]);
        const nextRows = [
          ...existingRows,
          ...normalizedRows.map((row) => ensureOrderInputTableRow(row)),
        ];
        totalRowsCount = nextRows.length;
        return {
          ...prev,
          [field.id]: nextRows,
        };
      });
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]:
          normalizedRows.length > 0
            ? t("orders.detail.aiImport.rowsAddedNotice", {
                added: normalizedRows.length,
                total: totalRowsCount,
              })
            : t("orders.detail.aiImport.noRowsInPdfNotice", {
                model: payload.parserModel
                  ? t("orders.detail.aiImport.modelWithName", {
                      model: payload.parserModel,
                    })
                  : "",
              }),
      }));
      notify({
        title:
          normalizedRows.length > 0
            ? t("orders.detail.aiImport.pdfParsed")
            : t("orders.detail.aiImport.noRowsDetected"),
        description:
          normalizedRows.length > 0
            ? t("orders.detail.aiImport.detectedRowsForField", {
                count: normalizedRows.length,
                field: field.label,
              })
            : t("orders.detail.aiImport.checkPdfAndColumns"),
        variant: normalizedRows.length > 0 ? "success" : "info",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? t("orders.detail.errors.parsingTimedOut")
          : t("orders.detail.errors.parsePdfFailed");
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: message,
      }));
      notify({
        title: t("orders.detail.aiImport.pdfParseFailed"),
        description: message,
        variant: "error",
      });
    } finally {
      setIsParsingTableFieldId(null);
    }
  }

  function renderOrderInputField(field: OrderInputField) {
    const value =
      field.fieldType === "table"
        ? constructionRowsByFieldId[field.id]
        : orderInputValues[field.id];
    const normalized = normalizeOrderInputValue(field, value);
    const label = (
      <span className="font-medium">
        {field.label}
        {field.isRequired && <span className="ml-1 text-destructive">*</span>}
      </span>
    );

    if (field.fieldType === "toggle_number") {
      const payload = normalized as { enabled: boolean; amount: number | null };
      return (
        <div
          key={field.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
        >
          <Checkbox
            checked={payload.enabled}
            disabled={!canEditOrderInputs}
            onChange={(event) =>
              setOrderInputValues((prev) => ({
                ...prev,
                [field.id]: {
                  enabled: event.target.checked,
                  amount: payload.amount ?? null,
                },
              }))
            }
            label={label}
            containerClassName="text-sm"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={payload.amount ?? ""}
              disabled={!canEditOrderInputs || !payload.enabled}
              onChange={(event) =>
                setOrderInputValues((prev) => ({
                  ...prev,
                  [field.id]: {
                    enabled: payload.enabled,
                    amount: event.target.value,
                  },
                }))
              }
              className="h-9 w-28 rounded-md border border-border bg-input-background px-2 text-sm"
            />
            {field.unit && (
              <span className="text-xs text-muted-foreground">
                {field.unit}
              </span>
            )}
          </div>
        </div>
      );
    }

    if (field.fieldType === "toggle") {
      return (
        <label
          key={field.id}
          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
        >
          {label}
          <Checkbox
            checked={Boolean(normalized)}
            disabled={!canEditOrderInputs}
            onChange={(event) =>
              setOrderInputValues((prev) => ({
                ...prev,
                [field.id]: event.target.checked,
              }))
            }
          />
        </label>
      );
    }

    if (field.fieldType === "select") {
      return (
        <SelectField
          key={field.id}
          label={label}
          value={
            normalized === undefined || normalized === null || normalized === ""
              ? "__none__"
              : String(normalized)
          }
          onValueChange={(value) =>
            setOrderInputValues((prev) => ({
              ...prev,
              [field.id]: value === "__none__" ? "" : value,
            }))
          }
        >
          <Select
            value={
              normalized === undefined ||
              normalized === null ||
              normalized === ""
                ? "__none__"
                : String(normalized)
            }
            disabled={!canEditOrderInputs}
            onValueChange={(value) =>
              setOrderInputValues((prev) => ({
                ...prev,
                [field.id]: value === "__none__" ? "" : value,
              }))
            }
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder={t("orders.detail.aiImport.select")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t("orders.detail.aiImport.select")}
              </SelectItem>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SelectField>
      );
    }

    if (field.fieldType === "table") {
      const columns = field.columns ?? [];
      const rows = getConstructionRows(field.id);
      const visibleColumns = columns.filter(
        (column) => (column.isActive ?? true) && (column.showInTable ?? true),
      );
      const selectedAttachmentId = tableImportAttachmentIds[field.id] ?? "";
      const availableParseAttachments = productionDocumentationParseAttachments;
      const selectedAttachment = availableParseAttachments.find(
        (item) => item.id === selectedAttachmentId,
      );
      const aiButtonTooltipBasic = t("orders.detail.aiImport.description");
      const importNotice = tableImportNotices[field.id] ?? "";
      const isParsingThisField = isParsingTableFieldId === field.id;
      const selectedRows = tableRowSelections[field.id] ?? [];
      const allSelected =
        rows.length > 0 && selectedRows.length === rows.length;
      const selectedConstructionRowId = activeConstructionDetail?.fieldId
        ? activeConstructionDetail.fieldId === field.id
          ? activeConstructionDetail.rowId
          : null
        : null;
      const toggleSelectAll = (checked: boolean) => {
        setTableRowSelections((prev) => ({
          ...prev,
          [field.id]: checked ? rows.map((_, idx) => idx) : [],
        }));
      };
      const updateRow = (
        rowIndex: number,
        columnKey: string,
        nextValue: string,
      ) => {
        setConstructionRowsByFieldId((prev) => {
          const nextRows = [...rows];
          const currentRow =
            typeof nextRows[rowIndex] === "object" && nextRows[rowIndex]
              ? ensureOrderInputTableRow(nextRows[rowIndex])
              : ensureOrderInputTableRow({});
          currentRow[columnKey] = nextValue;
          nextRows[rowIndex] = currentRow;
          return { ...prev, [field.id]: nextRows };
        });
      };
      const addRow = () => {
        setConstructionRowsByFieldId((prev) => ({
          ...prev,
          [field.id]: [...rows, ensureOrderInputTableRow({})],
        }));
      };
      const removeRow = async (rowIndex: number) => {
        if (
          !(await confirmRemove(
            t("orders.detail.confirm.deleteRow"),
            t("orders.detail.confirm.thisWillRemoveRow"),
          ))
        ) {
          return;
        }
        setConstructionRowsByFieldId((prev) => ({
          ...prev,
          [field.id]: rows.filter((_, idx) => idx !== rowIndex),
        }));
        setTableRowSelections((prev) => ({
          ...prev,
          [field.id]: (prev[field.id] ?? [])
            .filter((idx) => idx !== rowIndex)
            .map((idx) => (idx > rowIndex ? idx - 1 : idx)),
        }));
      };
      const removeSelectedRows = async () => {
        if (selectedRows.length === 0) {
          return;
        }
        if (
          !(await confirmRemove(
            t("orders.detail.confirm.deleteSelectedRows"),
            t("orders.detail.confirm.thisWillRemoveSelectedRows", {
              count: selectedRows.length,
            }),
          ))
        ) {
          return;
        }
        const removeSet = new Set(selectedRows);
        setConstructionRowsByFieldId((prev) => ({
          ...prev,
          [field.id]: rows.filter((_, idx) => !removeSet.has(idx)),
        }));
        setTableRowSelections((prev) => ({ ...prev, [field.id]: [] }));
      };
      const resolveColumnWidth = (column: OrderInputTableColumn) => {
        const token = `${column.key} ${column.label}`.toLowerCase();
        if (
          token.includes("skaits") ||
          token.includes("gab") ||
          token.includes("qty") ||
          token.includes("quantity")
        ) {
          return "88px";
        }
        if (
          token.includes("izmērs") ||
          token.includes("izmers") ||
          token.includes("size")
        ) {
          return "170px";
        }
        if (
          token.includes("krāsa") ||
          token.includes("krasa") ||
          token.includes("color")
        ) {
          return "220px";
        }
        if (
          token.includes("nosaukums") ||
          token.includes("name") ||
          token.includes("description")
        ) {
          return "260px";
        }
        if (token.includes("konstrukcija") || token.includes("construction")) {
          return "190px";
        }
        if (token.includes("position") || token.includes("poz")) {
          return "170px";
        }
        return "180px";
      };
      return (
        <div
          key={field.id}
          className="min-w-0 max-w-full space-y-3 md:col-span-2"
        >
          <div className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">{label}</div>
            <div className="flex min-w-0 max-w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-end">
              {canUseAiOrderInputImport && (
                <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                  <div className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Select
                      value={selectedAttachmentId || "__none__"}
                      onValueChange={(value) => {
                        const nextId = value === "__none__" ? "" : value;
                        setTableImportAttachmentIds((prev) => ({
                          ...prev,
                          [field.id]: nextId,
                        }));
                        setTableImportNotices((prev) => ({
                          ...prev,
                          [field.id]: nextId
                            ? ""
                            : t("orders.detail.aiImport.choosePdfFirst"),
                        }));
                      }}
                      disabled={!canEditOrderInputs || isParsingThisField}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 sm:w-65">
                        <SelectValue
                          placeholder={t(
                            "orders.detail.aiImport.choosePdfFromProductionDocs",
                          )}
                          className="block max-w-50 truncate text-left"
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t("orders.detail.aiImport.chooseFile")}
                        </SelectItem>
                        {availableParseAttachments.map((attachment) => (
                          <SelectItem
                            key={attachment.id}
                            value={attachment.id}
                            className="max-w-105"
                          >
                            {attachment.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canUseAiOrderInputImport ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleParseTableFieldWithAi(field)}
                        disabled={!canEditOrderInputs || isParsingThisField}
                        className="w-full sm:w-auto"
                      >
                        {isParsingThisField ? (
                          <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            {t("orders.detail.aiImport.adding")}
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="h-4 w-4 text-sky-500" />
                            {t("orders.detail.aiImport.addWithAi")}
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <Tooltip
                          content={aiButtonTooltipBasic}
                          className="max-w-[320px] text-xs"
                        >
                          <span className="inline-flex">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleParseTableFieldWithAi(field)}
                              disabled
                            >
                              <SparklesIcon className="h-4 w-4 text-sky-500" />
                              {t("orders.detail.aiImport.addWithAi")}
                            </Button>
                          </span>
                        </Tooltip>
                        <span className="text-xs text-amber-700">
                          {t("orders.detail.aiImport.lockedOnPlan", {
                            plan: subscription.planCode,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="wrap-break-word text-xs text-muted-foreground">
                    {t("orders.detail.aiImport.useFilesFrom", {
                      categories: aiAttachmentCategoryHint,
                    })}
                  </div>
                </div>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={removeSelectedRows}
                disabled={!canEditOrderInputs || selectedRows.length === 0}
                className="w-full sm:w-auto"
              >
                {t("orders.detail.aiImport.removeSelected")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={addRow}
                disabled={!canEditOrderInputs}
                className="w-full sm:w-auto"
              >
                {t("orders.detail.aiImport.addRow")}
              </Button>
            </div>
          </div>
          {importNotice && (
            <div className="text-xs text-muted-foreground">{importNotice}</div>
          )}
          {canUseAiOrderInputImport && selectedAttachment && (
            <div className="text-xs text-muted-foreground">
              {t("orders.detail.aiImport.source")}: {selectedAttachment.name}
            </div>
          )}
          {!canUseAiOrderInputImport && (
            <div className="text-xs text-muted-foreground">
              {t("orders.detail.aiImport.proOnly")}
            </div>
          )}
          {visibleColumns.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t("orders.detail.aiImport.noColumnsConfigured")}
            </div>
          ) : (
            <div className="w-full max-w-full overflow-x-auto rounded-lg border border-border">
              {isParsingThisField && (
                <LoadingSpinner
                  className="justify-start border-b border-border px-3 py-2"
                  label={t("orders.detail.aiImport.addingRows")}
                />
              )}
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  {visibleColumns.map((column) => (
                    <col
                      key={`col-${column.key}`}
                      style={{ width: resolveColumnWidth(column) }}
                    />
                  ))}
                  <col style={{ width: "116px" }} />
                </colgroup>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column.key}
                        className="whitespace-nowrap px-3 py-2 text-left"
                      >
                        {column.label}
                        {column.unit ? ` (${column.unit})` : ""}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>{t("orders.page.actions")}</span>
                        <Checkbox
                          variant="box"
                          checked={allSelected}
                          onChange={(event) =>
                            toggleSelectAll(event.target.checked)
                          }
                          disabled={rows.length === 0 || !canEditOrderInputs}
                        />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="px-3 py-4 text-center text-xs text-muted-foreground"
                      >
                        {t("orders.detail.aiImport.noRowsYet")}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, rowIndex) => (
                      (() => {
                        const rowId = getOrderInputTableRowId(row);
                        const isActiveRow =
                          selectedConstructionRowId !== null &&
                          rowId === selectedConstructionRowId;
                        return (
                      <tr
                        key={rowId ?? `row-${rowIndex}`}
                        className={`border-t border-border ${
                          isActiveRow ? "bg-primary/5" : ""
                        }`}
                      >
                        {visibleColumns.map((column) => {
                          const cellValue =
                            typeof row === "object" && row !== null
                              ? (row as Record<string, unknown>)[column.key]
                              : "";
                          if (column.fieldType === "select") {
                            const maxSelect = Math.max(
                              1,
                              Math.min(3, column.maxSelect ?? 1),
                            );
                            const currentValues = Array.isArray(cellValue)
                              ? cellValue.filter(
                                  (item): item is string =>
                                    typeof item === "string",
                                )
                              : typeof cellValue === "string" && cellValue
                                ? [cellValue]
                                : [];
                            const isMultiSelect = maxSelect > 1;
                            const canAddMore = currentValues.length < maxSelect;
                            const handleAddValue = (value: string) => {
                              if (!value) {
                                return;
                              }
                              if (currentValues.includes(value)) {
                                return;
                              }
                              const nextValues = [
                                ...currentValues,
                                value,
                              ].slice(0, maxSelect);
                              setConstructionRowsByFieldId((prev) => {
                                const nextRows = [...rows];
                                const currentRow =
                                  typeof nextRows[rowIndex] === "object" &&
                                  nextRows[rowIndex]
                                    ? ensureOrderInputTableRow(
                                        nextRows[rowIndex],
                                      )
                                    : ensureOrderInputTableRow({});
                                currentRow[column.key] =
                                  maxSelect === 1 ? value : nextValues;
                                nextRows[rowIndex] = currentRow;
                                return { ...prev, [field.id]: nextRows };
                              });
                            };
                            return (
                              <td
                                key={column.key}
                                className="whitespace-nowrap px-3 py-2 align-top"
                              >
                                <Select
                                  value={
                                    isMultiSelect
                                      ? "__none__"
                                      : (currentValues[0] ?? "__none__")
                                  }
                                  disabled={
                                    !canEditOrderInputs ||
                                    (isMultiSelect && !canAddMore)
                                  }
                                  onValueChange={(value) => {
                                    if (value === "__none__") {
                                      if (!isMultiSelect) {
                                        updateRow(rowIndex, column.key, "");
                                      }
                                      return;
                                    }
                                    if (isMultiSelect) {
                                      handleAddValue(value);
                                      return;
                                    }
                                    updateRow(rowIndex, column.key, value);
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-full rounded-md">
                                    <SelectValue
                                      placeholder={
                                        isMultiSelect
                                          ? canAddMore
                                            ? t("orders.detail.aiImport.select")
                                            : t(
                                                "orders.detail.aiImport.maxSelected",
                                              )
                                          : t("orders.detail.aiImport.select")
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      {isMultiSelect
                                        ? canAddMore
                                          ? t("orders.detail.aiImport.select")
                                          : t(
                                              "orders.detail.aiImport.maxSelected",
                                            )
                                        : t("orders.detail.aiImport.select")}
                                    </SelectItem>
                                    {(column.options ?? []).map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {isMultiSelect && currentValues.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {currentValues.map((chip) => (
                                      <button
                                        key={chip}
                                        type="button"
                                        onClick={() => {
                                          const nextValues =
                                            currentValues.filter(
                                              (item) => item !== chip,
                                            );
                                          setConstructionRowsByFieldId((prev) => {
                                            const nextRows = [...rows];
                                            const currentRow =
                                              typeof nextRows[rowIndex] ===
                                                "object" && nextRows[rowIndex]
                                                ? ensureOrderInputTableRow(
                                                    nextRows[rowIndex],
                                                  )
                                                : ensureOrderInputTableRow({});
                                            currentRow[column.key] =
                                              maxSelect === 1
                                                ? (nextValues[0] ?? "")
                                                : nextValues;
                                            nextRows[rowIndex] = currentRow;
                                            return {
                                              ...prev,
                                              [field.id]: nextRows,
                                            };
                                          });
                                        }}
                                        disabled={!canEditOrderInputs}
                                        className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                                      >
                                        {chip}
                                        <span aria-hidden="true">&times;</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={column.key}
                              className="whitespace-nowrap px-3 py-2 align-top"
                            >
                              <Input
                                type={
                                  column.fieldType === "number"
                                    ? "number"
                                    : "text"
                                }
                                value={String(cellValue ?? "")}
                                disabled={!canEditOrderInputs}
                                onChange={(event) =>
                                  updateRow(
                                    rowIndex,
                                    column.key,
                                    event.target.value,
                                  )
                                }
                                className="h-9 w-full px-2 text-sm"
                              />
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-2 align-top text-right">
                          <div className="flex items-start justify-end gap-2">
                            <Button
                              size="sm"
                              variant={isActiveRow ? "default" : "outline"}
                              onClick={() => {
                                if (!rowId) {
                                  return;
                                }
                                setActiveConstructionDetail({
                                  fieldId: field.id,
                                  rowId,
                                });
                              }}
                            >
                              <PanelRightIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const nextRows = [
                                  ...rows,
                                  cloneOrderInputTableRow(row),
                                ];
                                setConstructionRowsByFieldId((prev) => ({
                                  ...prev,
                                  [field.id]: nextRows,
                                }));
                              }}
                              disabled={!canEditOrderInputs}
                            >
                              <CopyIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeRow(rowIndex)}
                              disabled={!canEditOrderInputs}
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                            <Checkbox
                              variant="box"
                              checked={selectedRows.includes(rowIndex)}
                              onChange={(event) => {
                                setTableRowSelections((prev) => {
                                  const current = prev[field.id] ?? [];
                                  if (event.target.checked) {
                                    return {
                                      ...prev,
                                      [field.id]: [...current, rowIndex],
                                    };
                                  }
                                  return {
                                    ...prev,
                                    [field.id]: current.filter(
                                      (idx) => idx !== rowIndex,
                                    ),
                                  };
                                });
                              }}
                              disabled={!canEditOrderInputs}
                            />
                          </div>
                        </td>
                      </tr>
                        );
                      })()
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {activeConstructionDetailData?.field.id === field.id ? (
            <div className="hidden rounded-lg border border-border bg-muted/10 p-4 md:block">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {t("orders.detail.orderInputs.detailTitle")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("orders.detail.orderInputs.detailDescription")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveConstructionDetail(null)}
                >
                  {t("profile.close")}
                </Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeConstructionDetailData.field.columns?.map((column) => {
                      const rawValue =
                        activeConstructionDetailData.row[column.key];
                      const value = Array.isArray(rawValue)
                        ? rawValue.join(" / ")
                        : String(rawValue ?? "").trim();
                      if (!value) {
                        return null;
                      }
                      return (
                        <div
                          key={column.key}
                          className="rounded-md border border-border bg-background px-3 py-2"
                        >
                          <div className="text-xs text-muted-foreground">
                            {column.label}
                          </div>
                          <div className="mt-1 text-sm font-medium text-foreground">
                            {value}
                            {column.unit ? ` ${column.unit}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-background px-3 py-3">
                    <div className="text-xs text-muted-foreground">
                      {t("orders.detail.orderInputs.detailSourceField")}
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {activeConstructionDetailData.field.label}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {t("orders.detail.orderInputs.detailRowId")}
                    </div>
                    <div className="mt-1 text-sm font-medium break-all">
                      {activeConstructionDetailData.rowId}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {t("orders.detail.orderInputs.detailFileCount")}
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {activeConstructionDetailData.attachments.length}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-3">
                    <div className="text-sm font-medium">
                      {t("orders.detail.orderInputs.detailDocuments")}
                    </div>
                    {activeConstructionDetailData.attachments.length === 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {t("orders.detail.orderInputs.detailNoDocuments")}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {activeConstructionDetailData.attachments.map(
                          (attachment) => (
                            <div
                              key={attachment.id}
                              className="rounded-md border border-border bg-muted/20 px-3 py-2"
                            >
                              <div className="text-sm font-medium break-all">
                                {attachment.name ||
                                  t("orders.detail.orderInputs.detailUnknownFile")}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {attachment.createdAt
                                  ? formatDateTime(attachment.createdAt)
                                  : t("orders.detail.unknown")}
                              </div>
                              <div className="mt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  asChild={
                                    Boolean(signedAttachmentUrls[attachment.id])
                                  }
                                  disabled={!signedAttachmentUrls[attachment.id]}
                                >
                                  {signedAttachmentUrls[attachment.id] ? (
                                    <a
                                      href={signedAttachmentUrls[attachment.id]}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {t("orders.detail.orderInputs.detailOpenFile")}
                                    </a>
                                  ) : (
                                    <span>
                                      {t("orders.detail.orderInputs.detailOpenFile")}
                                    </span>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  {renderConstructionBomSection(activeConstructionDetailData)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (field.fieldType === "date") {
      return (
        <DatePicker
          label={field.label}
          value={String(normalized ?? "")}
          onChange={(next) =>
            setOrderInputValues((prev) => ({
              ...prev,
              [field.id]: next,
            }))
          }
          disabled={!canEditOrderInputs}
          className="flex flex-col gap-2 text-sm font-medium"
          triggerClassName="h-10"
        />
      );
    }

    if (field.fieldType === "textarea") {
      return (
        <TextAreaField
          key={field.id}
          label={label}
          value={String(normalized ?? "")}
          disabled={!canEditOrderInputs}
          onChange={(event) =>
            setOrderInputValues((prev) => ({
              ...prev,
              [field.id]: event.target.value,
            }))
          }
          className="min-h-20"
        />
      );
    }

    return (
      <label key={field.id} className="flex flex-col gap-2 text-sm font-medium">
        {label}
        <Input
          type={field.fieldType === "number" ? "number" : "text"}
          value={String(normalized ?? "")}
          disabled={!canEditOrderInputs}
          onChange={(event) =>
            setOrderInputValues((prev) => ({
              ...prev,
              [field.id]: event.target.value,
            }))
          }
          className="h-10 px-3 text-sm"
        />
      </label>
    );
  }

  async function handleRemoveAttachment(attachmentId: string) {
    if (!orderState) {
      return;
    }
    const target = attachments.find(
      (attachment) => attachment.id === attachmentId,
    );
    const targetLabel = target?.name ?? t("orders.detail.attachments.item");
    if (
      !(await confirmRemove(
        t("orders.detail.confirm.deleteAttachment"),
        t("orders.detail.confirm.thisWillRemoveNamed", { name: targetLabel }),
      ))
    ) {
      return;
    }
    if (target?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(target.url);
    }
    const removed = await removeOrderAttachment(orderState.id, attachmentId);
    if (removed) {
      const nextAttachments = attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
      setOrderState((prev) =>
        prev ? { ...prev, attachments: nextAttachments } : prev,
      );
      setSelectedAttachmentIds((prev) =>
        prev.filter((selectedId) => selectedId !== attachmentId),
      );
    }
  }

  async function handleDeleteAttachmentGroup(
    group: { key: string; label: string; items: OrderAttachment[] },
    mode: "all" | "selected",
  ) {
    if (!orderState) {
      return;
    }
    const targetItems =
      mode === "all"
        ? group.items
        : group.items.filter((item) => selectedAttachmentIds.includes(item.id));
    if (targetItems.length === 0) {
      notify({
        title: t("orders.detail.notifications.noFilesSelectedTitle"),
        description: t(
          "orders.detail.notifications.noFilesSelectedDescription",
        ),
        variant: "error",
      });
      return;
    }
    const count = targetItems.length;
    const confirmed = await confirmRemove(
      mode === "all"
        ? t("orders.detail.confirm.deleteAllFilesInCategory", {
            category: group.label,
          })
        : t("orders.detail.confirm.deleteSelectedFilesInCategory", {
            category: group.label,
          }),
      t("orders.detail.confirm.thisWillRemoveFiles", { count }),
    );
    if (!confirmed) {
      return;
    }
    setDeletingAttachmentGroup(group.key);
    try {
      const removedIds: string[] = [];
      for (const attachment of targetItems) {
        if (attachment.url?.startsWith("blob:")) {
          URL.revokeObjectURL(attachment.url);
        }
        const removed = await removeOrderAttachment(
          orderState.id,
          attachment.id,
        );
        if (removed) {
          removedIds.push(attachment.id);
        }
      }
      if (removedIds.length > 0) {
        const removedSet = new Set(removedIds);
        setOrderState((prev) =>
          prev
            ? {
                ...prev,
                attachments: (prev.attachments ?? []).filter(
                  (item) => !removedSet.has(item.id),
                ),
              }
            : prev,
        );
        setSelectedAttachmentIds((prev) =>
          prev.filter((id) => !removedSet.has(id)),
        );
      }
      if (removedIds.length !== targetItems.length) {
        notify({
          title: t("orders.detail.notifications.someFilesNotDeleted"),
          description: t("orders.detail.notifications.deletedOutOf", {
            removed: removedIds.length,
            total: targetItems.length,
          }),
          variant: "error",
        });
      } else {
        notify({
          title: t("orders.detail.notifications.filesDeleted"),
          description: t("orders.detail.notifications.deletedFiles", {
            count: removedIds.length,
          }),
        });
      }
    } finally {
      setDeletingAttachmentGroup(null);
    }
  }

  async function handleRemoveComment(commentId: string) {
    if (!orderState) {
      return;
    }
    const targetComment = comments.find((comment) => comment.id === commentId);
    if (!targetComment || !canRemoveComment(targetComment)) {
      notify({
        title: t("orders.detail.notifications.commentNotRemoved"),
        description: t("orders.detail.notifications.removeOwnCommentsOnly"),
        variant: "error",
      });
      return;
    }
    if (
      !(await confirmRemove(
        t("orders.detail.confirm.deleteComment"),
        t("orders.detail.confirm.removeCommentPermanently"),
      ))
    ) {
      return;
    }
    const removed = await removeOrderComment(orderState.id, commentId);
    if (removed) {
      const nextComments = comments.filter(
        (comment) => comment.id !== commentId,
      );
      setOrderState((prev) =>
        prev ? { ...prev, comments: nextComments } : prev,
      );
    }
  }

  async function handleAddExternalJob() {
    if (!orderState) {
      return;
    }
    const isPortalMode = externalRequestMode === "partner_portal";
    if (isPortalMode && !canSendExternalJobToPartner) {
      setExternalError(t("orders.detail.errors.sendToPartnerProOnly"));
      return;
    }
    if (!externalPartnerId) {
      setExternalError(t("orders.detail.errors.partnerRequired"));
      return;
    }
    const partner = activePartners.find(
      (item) => item.id === externalPartnerId,
    );
    if (!partner) {
      setExternalError(t("orders.detail.errors.selectValidPartner"));
      return;
    }
    if (!isPortalMode) {
      const missingRequired = manualExternalJobFields.find((field) => {
        if (!field.isRequired) {
          return false;
        }
        const value = externalJobFieldValues[field.id];
        if (field.fieldType === "toggle") {
          return value === undefined;
        }
        return isEmptyExternalFieldValue(value);
      });
      if (missingRequired) {
        setExternalError(
          t("orders.detail.errors.fieldRequired", {
            field: missingRequired.label,
          }),
        );
        return;
      }
    }
    const externalOrderNumberRaw = isPortalMode
      ? undefined
      : getExternalFieldValueByKeys(
          "external_order_number",
          "external_order_no",
          "order_number",
        );
    const dueDateRaw = isPortalMode
      ? undefined
      : getExternalFieldValueByKeys("due_date", "due");
    const statusRaw = isPortalMode
      ? "requested"
      : getExternalFieldValueByKeys("status");
    const quantityRaw = isPortalMode
      ? undefined
      : getExternalFieldValueByKeys("quantity", "qty");
    const resolvedExternalOrderNumber = isPortalMode
      ? `REQ-${Date.now().toString().slice(-6)}`
      : typeof externalOrderNumberRaw === "string" &&
          externalOrderNumberRaw.trim().length > 0
        ? externalOrderNumberRaw.trim()
        : `EXT-${Date.now().toString().slice(-6)}`;
    const resolvedDueDate = isPortalMode
      ? orderState.dueDate
      : typeof dueDateRaw === "string" && dueDateRaw.trim().length > 0
        ? dueDateRaw
        : new Date().toISOString().slice(0, 10);
    const resolvedStatus = parseExternalJobStatus(statusRaw) ?? "requested";
    const resolvedQuantity =
      typeof quantityRaw === "number"
        ? quantityRaw
        : typeof quantityRaw === "string" && quantityRaw.trim()
          ? Number(quantityRaw)
          : undefined;
    setExternalError("");
    const created = await addExternalJob(orderState.id, {
      partnerId: partner.id,
      partnerName: partner.name,
      partnerEmail: partner.email,
      requestMode: externalRequestMode,
      partnerRequestComment: isPortalMode
        ? externalPortalComment.trim() || undefined
        : undefined,
      externalOrderNumber: resolvedExternalOrderNumber,
      quantity:
        resolvedQuantity !== undefined && !Number.isNaN(resolvedQuantity)
          ? resolvedQuantity
          : undefined,
      dueDate: resolvedDueDate,
      status: resolvedStatus,
    });
    if (created) {
      let createdWithAttachments = created;
      if (
        !isPortalMode &&
        supabase &&
        tenantId &&
        manualExternalJobFields.length > 0
      ) {
        const rows = manualExternalJobFields
          .map((field) => {
            const raw = externalJobFieldValues[field.id];
            if (
              field.fieldType !== "toggle" &&
              isEmptyExternalFieldValue(raw)
            ) {
              return null;
            }
            let value: unknown = raw;
            if (field.fieldType === "number") {
              if (typeof raw === "string") {
                value = raw.trim() ? Number(raw) : null;
              }
              if (value === null || Number.isNaN(value)) {
                return null;
              }
            }
            return {
              tenant_id: tenantId,
              external_job_id: created.id,
              field_id: field.id,
              value,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));
        if (rows.length > 0) {
          await supabase.from("external_job_field_values").insert(rows);
          setExternalJobValuesByJobId((prev) => ({
            ...prev,
            [created.id]: rows.reduce<Record<string, unknown>>((acc, row) => {
              acc[row.field_id] = row.value;
              return acc;
            }, {}),
          }));
        }
      }

      if (isPortalMode && externalPortalFiles.length > 0) {
        const uploadedAttachments: ExternalJobAttachment[] = [];
        for (const file of externalPortalFiles) {
          const upload = await uploadExternalJobAttachment(file, created.id);
          if (upload.error || !upload.attachment) {
            setExternalError(
              upload.error ??
                t("orders.detail.errors.uploadPartnerRequestFiles"),
            );
            continue;
          }
          const attached = await addExternalJobAttachment(created.id, {
            name: upload.attachment.name,
            url: upload.attachment.url,
            size: upload.attachment.size,
            mimeType: upload.attachment.mimeType,
            addedBy: name,
            addedByRole: role,
            category: "partner_request",
          });
          if (attached) {
            uploadedAttachments.push(attached);
          }
        }
        if (uploadedAttachments.length > 0) {
          createdWithAttachments = {
            ...createdWithAttachments,
            attachments: [
              ...uploadedAttachments,
              ...(createdWithAttachments.attachments ?? []),
            ],
          };
        }
      }

      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              externalJobs: uniqueExternalJobsById([
                createdWithAttachments,
                ...(prev.externalJobs ?? []),
              ]),
            }
          : prev,
      );
      setExternalPartnerId("");
      setExternalPartnerGroupId("");
      if (isPortalMode) {
        const sent = await handleSendToPartner(created.id);
        if (!sent) {
          await removeExternalJob(created.id);
          setExternalJobValuesByJobId((prev) => {
            const next = { ...prev };
            delete next[created.id];
            return next;
          });
          setOrderState((prev) =>
            prev
              ? {
                  ...prev,
                  externalJobs: (prev.externalJobs ?? []).filter(
                    (job) => job.id !== created.id,
                  ),
                }
              : prev,
          );
          return;
        }
        setExternalPortalComment("");
        setExternalPortalFiles([]);
      } else {
        setExternalJobFieldValues((prev) => {
          const next: Record<string, unknown> = {};
          manualExternalJobFields.forEach((field) => {
            if (field.fieldType === "toggle") {
              next[field.id] = false;
            } else if (field.key.trim().toLowerCase() === "status") {
              next[field.id] = "requested";
            } else if (prev[field.id] !== undefined) {
              next[field.id] = "";
            }
          });
          return { ...prev, ...next };
        });
      }
    }
  }

  async function handleSendToPartner(externalJobId: string) {
    if (!supabase) {
      setExternalError(t("orders.detail.errors.supabaseNotConfigured"));
      return false;
    }
    if (!canSendExternalJobToPartner) {
      setExternalError(t("orders.detail.errors.sendToPartnerProOnly"));
      return false;
    }
    setExternalError("");
    setSendingToPartnerJobId(externalJobId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setSendingToPartnerJobId(null);
      setExternalError(t("orders.detail.errors.signInAgain"));
      return false;
    }

    const response = await fetch("/api/external-jobs/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ externalJobId }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      expiresAt?: string;
    };

    if (!response.ok) {
      if (payload.error === "feature_not_available") {
        setExternalError(t("orders.detail.errors.featureProOnly"));
      } else {
        setExternalError(
          payload.error ?? t("orders.detail.errors.sendToPartnerFailed"),
        );
      }
      setSendingToPartnerJobId(null);
      return false;
    }

    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            externalJobs: (prev.externalJobs ?? []).map((job) =>
              job.id === externalJobId
                ? {
                    ...job,
                    requestMode: "partner_portal",
                    partnerRequestSentAt: new Date().toISOString(),
                    status: job.status === "requested" ? "ordered" : job.status,
                  }
                : job,
            ),
          }
        : prev,
    );
    notify({
      title: t("orders.detail.notifications.requestSentToPartner"),
      description: payload.expiresAt
        ? t("orders.detail.notifications.secureLinkExpires", {
            date: formatDateTime(payload.expiresAt),
          })
        : undefined,
      variant: "success",
    });
    setSendingToPartnerJobId(null);
    return true;
  }

  async function handleExternalStatusChange(
    externalJobId: string,
    status: ExternalJobStatus,
  ) {
    if (!orderState) {
      return;
    }
    const targetJob = orderState.externalJobs?.find(
      (job) => job.id === externalJobId,
    );
    const minAttachments = externalMinAttachmentsForStatus(status);
    if ((targetJob?.attachments ?? []).length < minAttachments) {
      setExternalJobUpload((prev) => ({
        ...prev,
        [externalJobId]: {
          isUploading: false,
          error: `Add at least ${minAttachments} attachment(s) before setting this status.`,
        },
      }));
      return;
    }
    const updated = await updateExternalJob(externalJobId, { status });
    if (updated) {
      setExternalJobUpload((prev) => ({
        ...prev,
        [externalJobId]: { isUploading: false },
      }));
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              externalJobs: (prev.externalJobs ?? []).map((job) =>
                job.id === externalJobId ? updated : job,
              ),
            }
          : prev,
      );
    }
  }

  async function handleRemoveExternalJob(externalJobId: string) {
    if (
      !(await confirmRemove(
        t("orders.detail.confirm.deleteExternalJob"),
        t("orders.detail.confirm.thisWillRemoveExternalJob"),
      ))
    ) {
      return;
    }
    const removed = await removeExternalJob(externalJobId);
    if (removed) {
      setExternalJobValuesByJobId((prev) => {
        const next = { ...prev };
        delete next[externalJobId];
        return next;
      });
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              externalJobs: (prev.externalJobs ?? []).filter(
                (job) => job.id !== externalJobId,
              ),
            }
          : prev,
      );
    }
  }

  function handleExternalFilesAdded(externalJobId: string, files: FileList) {
    const list = Array.from(files);
    if (list.length === 0) {
      return;
    }
    const oversized = list.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setExternalJobUpload((prev) => ({
        ...prev,
        [externalJobId]: {
          isUploading: false,
          error: `${oversized.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
        },
      }));
      return;
    }
    setExternalJobUpload((prev) => ({
      ...prev,
      [externalJobId]: { isUploading: false },
    }));
    setExternalJobFiles((prev) => ({
      ...prev,
      [externalJobId]: [...(prev[externalJobId] ?? []), ...list],
    }));
  }

  async function handleUploadExternalFiles(externalJobId: string) {
    const pending = externalJobFiles[externalJobId] ?? [];
    if (pending.length === 0) {
      return;
    }
    setExternalJobUpload((prev) => ({
      ...prev,
      [externalJobId]: { isUploading: true },
    }));
    for (const file of pending) {
      const result = await uploadExternalJobAttachment(file, externalJobId);
      if (result.error || !result.attachment) {
        setExternalJobUpload((prev) => ({
          ...prev,
          [externalJobId]: { isUploading: false, error: result.error },
        }));
        continue;
      }
      const created = await addExternalJobAttachment(externalJobId, {
        name: result.attachment.name,
        url: result.attachment.url,
        size: result.attachment.size,
        mimeType: result.attachment.mimeType,
        addedBy: name,
        addedByRole: role,
      });
      if (created) {
        setOrderState((prev) =>
          prev
            ? {
                ...prev,
                externalJobs: (prev.externalJobs ?? []).map((job) =>
                  job.id === externalJobId
                    ? {
                        ...job,
                        attachments: [created, ...(job.attachments ?? [])],
                      }
                    : job,
                ),
              }
            : prev,
        );
      }
    }
    setExternalJobFiles((prev) => ({ ...prev, [externalJobId]: [] }));
    setExternalJobUpload((prev) => ({
      ...prev,
      [externalJobId]: { isUploading: false },
    }));
  }

  async function handleRemoveExternalFile(
    externalJobId: string,
    attachmentId: string,
  ) {
    if (!orderState) {
      return;
    }
    const job = orderState.externalJobs?.find(
      (item) => item.id === externalJobId,
    );
    const attachment = job?.attachments?.find(
      (item) => item.id === attachmentId,
    );
    const label = attachment?.name ?? t("orders.detail.attachments.item");
    if (
      !(await confirmRemove(
        t("orders.detail.confirm.deleteAttachment"),
        t("orders.detail.confirm.thisWillRemoveNamed", { name: label }),
      ))
    ) {
      return;
    }
    const removed = await removeExternalJobAttachment(
      externalJobId,
      attachmentId,
    );
    if (removed) {
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              externalJobs: (prev.externalJobs ?? []).map((job) =>
                job.id === externalJobId
                  ? {
                      ...job,
                      attachments: (job.attachments ?? []).filter(
                        (file) => file.id !== attachmentId,
                      ),
                    }
                  : job,
              ),
            }
          : prev,
      );
    }
  }

  async function handleTakeOrder() {
    if (!orderState) {
      return;
    }
    const now = new Date().toISOString();
    if (!supabase) {
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              assignedEngineerId: userId,
              assignedEngineerName: name,
              assignedEngineerAt: now,
            }
          : prev,
      );
      await updateOrder(orderState.id, {
        assignedEngineerId: userId,
        assignedEngineerName: name,
        assignedEngineerAt: now,
      });
      return;
    }

    const { data: claimRows, error: claimError } = await supabase
      .from("orders")
      .update({
        assigned_engineer_id: userId,
        assigned_engineer_name: name,
        assigned_engineer_at: now,
      })
      .eq("id", orderState.id)
      .eq("status", "ready_for_engineering")
      .is("assigned_engineer_id", null)
      .select("id");

    if (claimError) {
      notify({
        title: t("orders.detail.notifications.orderNotUpdated"),
        description: claimError.message,
        variant: "error",
      });
      return;
    }
    if (!claimRows || claimRows.length === 0) {
      const { data: latestOrder } = await supabase
        .from("orders")
        .select(
          "id, status, assigned_engineer_id, assigned_engineer_name, assigned_engineer_at",
        )
        .eq("id", orderState.id)
        .maybeSingle();
      if (latestOrder?.assigned_engineer_id === userId) {
        setOrderState((prev) =>
          prev
            ? {
                ...prev,
                assignedEngineerId: latestOrder.assigned_engineer_id ?? userId,
                assignedEngineerName:
                  latestOrder.assigned_engineer_name ?? name,
                assignedEngineerAt: latestOrder.assigned_engineer_at ?? now,
              }
            : prev,
        );
        notify({
          title: t("orders.detail.notifications.orderTaken"),
          variant: "success",
        });
      } else if (latestOrder?.assigned_engineer_id) {
        notify({
          title: t("orders.detail.notifications.orderAlreadyTaken"),
          description: latestOrder.assigned_engineer_name
            ? t("orders.detail.notifications.alreadyTakenBy", {
                name: latestOrder.assigned_engineer_name,
              })
            : t("orders.detail.notifications.anotherEngineerTook"),
          variant: "error",
        });
      } else if (
        latestOrder &&
        latestOrder.status !== "ready_for_engineering"
      ) {
        notify({
          title: t("orders.detail.notifications.orderStateChanged"),
          description: t(
            "orders.detail.notifications.noLongerReadyForEngineering",
          ),
          variant: "error",
        });
      } else if (
        latestOrder &&
        latestOrder.status === "ready_for_engineering" &&
        !latestOrder.assigned_engineer_id
      ) {
        notify({
          title: t("orders.detail.notifications.noPermission"),
          description: t("orders.detail.notifications.roleCannotTakeOrder"),
          variant: "error",
        });
      } else {
        notify({
          title: t("orders.detail.notifications.orderNotUpdated"),
          description: t("orders.detail.notifications.couldNotTakeOrder"),
          variant: "error",
        });
      }
      await refreshOrders();
      return;
    }

    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            assignedEngineerId: userId,
            assignedEngineerName: name,
            assignedEngineerAt: now,
          }
        : prev,
    );
    await refreshOrders();
  }

  async function handleReturnToQueue() {
    if (!orderState) {
      return;
    }
    if (
      role === "Engineering" &&
      orderState.assignedEngineerId &&
      orderState.assignedEngineerId !== userId
    ) {
      notify({
        title: t("orders.detail.notifications.noPermission"),
        description: t(
          "orders.detail.notifications.orderAssignedToAnotherEngineer",
        ),
        variant: "error",
      });
      return;
    }
    const shouldResetStatus =
      orderState.status === "in_engineering" ||
      orderState.status === "engineering_blocked";
    const nextStatus = shouldResetStatus
      ? "ready_for_engineering"
      : orderState.status;
    const now = new Date().toISOString();
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            assignedEngineerId: undefined,
            assignedEngineerName: undefined,
            assignedEngineerAt: undefined,
            status: nextStatus,
            statusChangedBy: name,
            statusChangedByRole: role,
            statusChangedAt: now,
            statusHistory: [
              {
                id: `hst-${Date.now()}`,
                status: nextStatus,
                changedBy: name,
                changedByRole: role,
                changedAt: now,
              },
              ...(prev.statusHistory ?? []),
            ],
          }
        : prev,
    );
    await updateOrder(orderState.id, {
      assignedEngineerId: "",
      assignedEngineerName: "",
      assignedEngineerAt: "",
      status: nextStatus,
      statusChangedBy: name,
      statusChangedByRole: role,
      statusChangedAt: now,
    });
  }

  async function handleStatusChange(
    nextStatus:
      | "draft"
      | "ready_for_engineering"
      | "in_engineering"
      | "engineering_blocked"
      | "ready_for_production"
      | "in_production",
  ) {
    if (!orderState) {
      return;
    }
    if (
      role === "Engineering" &&
      orderState.assignedEngineerId &&
      orderState.assignedEngineerId !== userId
    ) {
      notify({
        title: t("orders.detail.notifications.noPermission"),
        description: t(
          "orders.detail.notifications.orderAssignedToAnotherEngineer",
        ),
        variant: "error",
      });
      return;
    }
    const now = new Date().toISOString();
    const shouldAssignCurrentEngineer =
      nextStatus === "in_engineering" &&
      role === "Engineering" &&
      !orderState.assignedEngineerId;
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            assignedEngineerId: shouldAssignCurrentEngineer
              ? userId
              : prev.assignedEngineerId,
            assignedEngineerName: shouldAssignCurrentEngineer
              ? name
              : prev.assignedEngineerName,
            assignedEngineerAt: shouldAssignCurrentEngineer
              ? now
              : prev.assignedEngineerAt,
            statusChangedBy: name,
            statusChangedByRole: role,
            statusChangedAt: now,
            statusHistory: [
              {
                id: `hst-${Date.now()}`,
                status: nextStatus,
                changedBy: name,
                changedByRole: role,
                changedAt: now,
              },
              ...(prev.statusHistory ?? []),
            ],
          }
        : prev,
    );
    await updateOrder(orderState.id, {
      status: nextStatus,
      ...(shouldAssignCurrentEngineer
        ? {
            assignedEngineerId: userId,
            assignedEngineerName: name,
            assignedEngineerAt: now,
          }
        : {}),
      statusChangedBy: name,
      statusChangedByRole: role,
      statusChangedAt: now,
    });
  }

  async function handleChecklistToggle(id: string, checked: boolean) {
    if (!orderState) {
      return;
    }
    const next = { ...checklistState, [id]: checked };
    setChecklistState(next);
    setOrderState((prev) => (prev ? { ...prev, checklist: next } : prev));
    await updateOrder(orderState.id, { checklist: next });
  }

  async function handleDownloadAttachmentGroup(group: {
    key: string;
    label: string;
    items: OrderAttachment[];
  }) {
    if (!orderState || group.items.length === 0) {
      return;
    }
    setDownloadingAttachmentGroup(group.key);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let skippedCount = 0;

      for (let index = 0; index < group.items.length; index += 1) {
        const attachment = group.items[index];
        const fileUrl = resolveAttachmentUrl(attachment);
        if (!fileUrl) {
          skippedCount += 1;
          continue;
        }
        const response = await fetch(fileUrl);
        if (!response.ok) {
          skippedCount += 1;
          continue;
        }
        const blob = await response.blob();
        const originalName =
          attachment.name?.trim() || `attachment-${index + 1}.bin`;
        const lastDot = originalName.lastIndexOf(".");
        const baseName =
          lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
        const ext = lastDot > 0 ? originalName.slice(lastDot) : "";
        let nextName = originalName;
        let suffix = 2;
        while (usedNames.has(nextName.toLowerCase())) {
          nextName = `${baseName} (${suffix})${ext}`;
          suffix += 1;
        }
        usedNames.add(nextName.toLowerCase());
        zip.file(nextName, blob);
      }

      const includedCount = Object.keys(zip.files).length;
      if (includedCount === 0) {
        notify({
          title: t("orders.detail.notifications.downloadFailed"),
          description: t(
            "orders.detail.notifications.noFilesDownloadableInCategory",
          ),
          variant: "error",
        });
        return;
      }

      const archiveBlob = await zip.generateAsync({ type: "blob" });
      const orderPart = sanitizeArchiveName(orderState.orderNumber || "order");
      const categoryPart = sanitizeArchiveName(group.label || "attachments");
      const datePart = new Date().toISOString().slice(0, 10);
      const archiveName = `${orderPart}-${categoryPart}-${datePart}.zip`;
      const objectUrl = URL.createObjectURL(archiveBlob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = archiveName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      notify({
        title: t("orders.detail.notifications.archiveDownloaded"),
        description:
          skippedCount > 0
            ? t("orders.detail.notifications.downloadedWithSkipped", {
                included: includedCount,
                skipped: skippedCount,
              })
            : t("orders.detail.notifications.downloadedFiles", {
                count: includedCount,
              }),
      });
    } catch {
      notify({
        title: t("orders.detail.notifications.downloadFailed"),
        description: t("orders.detail.notifications.couldNotCreateArchive"),
        variant: "error",
      });
    } finally {
      setDownloadingAttachmentGroup(null);
    }
  }

  const resolveAttachmentUrl = (attachment: OrderAttachment) => {
    if (!attachment.url) {
      return undefined;
    }
    if (!supabase) {
      return attachment.url;
    }
    if (storagePublicPrefix && attachment.url.startsWith(storagePublicPrefix)) {
      return signedAttachmentUrls[attachment.id];
    }
    if (attachment.url.startsWith("http")) {
      return attachment.url;
    }
    return signedAttachmentUrls[attachment.id];
  };

  const resolveExternalAttachmentUrl = (attachment: ExternalJobAttachment) => {
    if (!attachment.url) {
      return undefined;
    }
    if (!supabase) {
      return attachment.url;
    }
    if (storagePublicPrefix && attachment.url.startsWith(storagePublicPrefix)) {
      return signedExternalAttachmentUrls[attachment.id];
    }
    if (attachment.url.startsWith("http")) {
      return attachment.url;
    }
    return signedExternalAttachmentUrls[attachment.id];
  };

  function renderAttachmentPreview(
    attachment: OrderAttachment | ExternalJobAttachment,
    resolvedUrl?: string,
  ) {
    const lowerName = attachment.name.toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const isImage =
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".gif") ||
      lowerName.endsWith(".webp");

    if (isImage && resolvedUrl) {
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <FileTextIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
        <FileIcon className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="space-y-0 pt-32 md:space-y-4 md:pt-0">
      <div
        className={`pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 -translate-x-1/2 transition-all duration-150 md:hidden ${
          showStickyMobileBadge
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1"
        }`}
      >
        <div className="flex flex-col justify-center items-center pointer-events-auto rounded-xl border border-border/80 bg-card/95 px-6 py-2 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
          <div className="truncate text-sm font-semibold">{orderTitle}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge
              variant={statusVariant}
              className="max-w-full truncate text-[11px]"
            >
              {statusLabel(displayStatus)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 md:hidden">
        <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("orders.detail.back")}
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }
              router.push("/orders");
            }}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 md:hidden">
        <div className="pointer-events-auto flex items-center justify-between gap-2">
          <div
            className={`relative transition-all duration-200 ${
              hideMobileFloatingControls
                ? "-translate-x-16 opacity-0"
                : "translate-x-0 opacity-100"
            }`}
          >
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full px-3 shadow-lg"
              onClick={() => setIsMobileActionsOpen(true)}
              aria-label={t("orders.detail.openActions")}
              aria-haspopup="dialog"
              aria-expanded={isMobileActionsOpen}
              aria-controls="order-actions-drawer"
            >
              <ListChecksIcon className="mr-2 h-4 w-4" />
              <span className="text-sm font-medium">
                {t("orders.page.actions")}
              </span>
            </Button>
            {activeGateItems.some((item) => !item.ok) ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white shadow">
                {activeGateItems.filter((item) => !item.ok).length}
              </span>
            ) : null}
          </div>
          <div
            className={`transition-all duration-200 ${
              hideMobileFloatingControls
                ? "translate-x-16 opacity-0"
                : "translate-x-0 opacity-100"
            }`}
          >
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full px-3 shadow-lg"
              onClick={() => setIsMobileSectionsOpen(true)}
              aria-label={t("orders.detail.openSections")}
              aria-haspopup="dialog"
              aria-expanded={isMobileSectionsOpen}
              aria-controls="order-sections-drawer"
            >
              <PanelRightIcon className="mr-2 h-4 w-4" />
              <span className="max-w-28 truncate text-sm font-medium">
                {activeDetailTab.label}
              </span>
            </Button>
          </div>
        </div>
      </div>
      <BottomSheet
        id="order-actions-drawer"
        open={isMobileActionsOpen}
        onClose={() => setIsMobileActionsOpen(false)}
        ariaLabel={t("orders.detail.openActions")}
        closeButtonLabel={t("orders.detail.closeActions")}
        title={t("orders.page.actions")}
        enableSwipeToClose
      >
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {topActionButtons.slice(0, 3).length > 0 ? (
              <div className="grid gap-2">
                {topActionButtons.slice(0, 3).map((action) => (
                  <Button
                    key={action.key}
                    variant={action.variant}
                    onClick={() => {
                      action.onClick();
                      setIsMobileActionsOpen(false);
                    }}
                    disabled={action.disabled}
                    className="w-full justify-center"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                {t("orders.detail.noAvailableActions")}
              </div>
            )}
            {activeGateItems.length > 0 ? (
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("orders.detail.overview.preflightChecks")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeGateItems.map((item) => (
                    <span
                      key={item.label}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                        item.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </BottomSheet>
      <BottomSheet
        id="order-sections-drawer"
        open={isMobileSectionsOpen}
        onClose={() => setIsMobileSectionsOpen(false)}
        ariaLabel={t("orders.detail.sections")}
        closeButtonLabel={t("orders.detail.closeSections")}
        title={t("orders.detail.sections")}
        enableSwipeToClose
      >
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {[
              { value: "overview", label: t("orders.detail.tabs.overview") },
              { value: "files", label: t("orders.detail.tabs.files") },
              { value: "details", label: t("orders.detail.tabs.details") },
              { value: "external", label: t("orders.detail.tabs.external") },
              { value: "history", label: t("orders.detail.tabs.history") },
            ].map((section) => {
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
                  <span>{section.label}</span>
                  {isActive ? (
                    <span className="text-xs">{t("orders.detail.active")}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
      <BottomSheet
        id="construction-detail-drawer"
        open={activeConstructionDetailData !== null}
        onClose={() => setActiveConstructionDetail(null)}
        ariaLabel={t("orders.detail.orderInputs.detailTitle")}
        closeButtonLabel={t("profile.close")}
        title={t("orders.detail.orderInputs.detailTitle")}
        enableSwipeToClose
      >
        <div className="flex-1 overflow-y-auto p-3">
          {activeConstructionDetailData ? (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("orders.detail.orderInputs.detailDescription")}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  {t("orders.detail.orderInputs.detailSourceField")}
                </div>
                <div className="mt-1 text-sm font-medium">
                  {activeConstructionDetailData.field.label}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {t("orders.detail.orderInputs.detailRowId")}
                </div>
                <div className="mt-1 break-all text-sm font-medium">
                  {activeConstructionDetailData.rowId}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t("orders.detail.orderInputs.detailAttributes")}
                </div>
                <div className="grid gap-2">
                  {activeConstructionDetailData.field.columns?.map((column) => {
                    const rawValue = activeConstructionDetailData.row[column.key];
                    const value = Array.isArray(rawValue)
                      ? rawValue.join(" / ")
                      : String(rawValue ?? "").trim();
                    if (!value) {
                      return null;
                    }
                    return (
                      <div
                        key={column.key}
                        className="rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <div className="text-xs text-muted-foreground">
                          {column.label}
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {value}
                          {column.unit ? ` ${column.unit}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">
                    {t("orders.detail.orderInputs.detailDocuments")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("orders.detail.orderInputs.detailFileCount")}:{" "}
                    {activeConstructionDetailData.attachments.length}
                  </div>
                </div>
                {activeConstructionDetailData.attachments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    {t("orders.detail.orderInputs.detailNoDocuments")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeConstructionDetailData.attachments.map(
                      (attachment) => (
                        <div
                          key={attachment.id}
                          className="rounded-lg border border-border bg-background px-3 py-2"
                        >
                          <div className="break-all text-sm font-medium">
                            {attachment.name ||
                              t("orders.detail.orderInputs.detailUnknownFile")}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {attachment.createdAt
                              ? formatDateTime(attachment.createdAt)
                              : t("orders.detail.unknown")}
                          </div>
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              asChild={Boolean(signedAttachmentUrls[attachment.id])}
                              disabled={!signedAttachmentUrls[attachment.id]}
                            >
                              {signedAttachmentUrls[attachment.id] ? (
                                <a
                                  href={signedAttachmentUrls[attachment.id]}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t("orders.detail.orderInputs.detailOpenFile")}
                                </a>
                              ) : (
                                <span>
                                  {t("orders.detail.orderInputs.detailOpenFile")}
                                </span>
                              )}
                            </Button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
              {renderConstructionBomSection(activeConstructionDetailData)}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              {t("orders.detail.orderInputs.detailEmpty")}
            </div>
          )}
        </div>
      </BottomSheet>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-2">
        <div
          className={`desktop-sticky-bleed sticky top-0 z-30 hidden bg-background/95 pb-2 backdrop-blur md:block ${
            showDesktopStickyShadow
              ? "desktop-sticky-bleed-shadow"
              : "desktop-sticky-bleed-no-shadow"
          }`}
        >
          <div className="space-y-3 pb-0">
            <div className="flex justify-between flex-wrap items-end">
              <DetailTabsBar
                backHref="/orders"
                backLabel={t("orders.detail.back")}
                tabs={detailTabs}
              />
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant}>
                  {statusLabel(displayStatus)}
                </Badge>
                {dueState ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${dueState.tone}`}
                  >
                    {dueState.label}
                  </span>
                ) : null}
                <Badge variant={priorityVariant}>
                  {t("orders.detail.hero.priorityBadge", {
                    value: getOrderPriorityLabel(orderState.priority, t),
                  })}
                </Badge>
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <div>
                <div className="space-y-1">
                  <div className="flex min-w-0 items-center gap-2 text-xl font-semibold md:text-2xl">
                    <Link
                      href="/orders"
                      className="shrink-0 text-xl font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      {t("orders.page.title")}
                    </Link>
                    <span className="shrink-0 text-muted-foreground/70">
                      &gt;
                    </span>
                    <span className="truncate text-foreground">
                      {orderTitle}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {t("orders.detail.lastModifiedBy", {
                      date: orderState.updatedAt
                        ? formatDateTime(orderState.updatedAt)
                        : "--",
                      name: updatedByDisplayName,
                    })}
                  </span>
                </div>
              </div>
              <div className="hidden flex-col md:flex items-end justify-end gap-2">
                <div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {topActionButtons.slice(0, 3).map((action) => (
                      <Button
                        key={action.key}
                        size="sm"
                        variant={action.variant}
                        onClick={action.onClick}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                  {activeGateItems.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeGateItems.map((item) => (
                        <span
                          key={item.label}
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                            item.ok
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.label}: {item.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-col md:hidden">
              <div className="flex min-w-0 items-center gap-2 text-xl font-semibold">
                <Link
                  href="/orders"
                  className="shrink-0 text-lg font-medium text-muted-foreground transition hover:text-foreground"
                >
                  {t("orders.page.title")}
                </Link>
                <span className="shrink-0 text-muted-foreground/70">&gt;</span>
                <span className="truncate text-foreground">{orderTitle}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {t("orders.detail.lastModifiedBy", {
                  date: orderState.updatedAt
                    ? formatDateTime(orderState.updatedAt)
                    : "--",
                  name: updatedByDisplayName,
                })}
              </span>
            </div>
            <div className="flex flex-wrap mb-3 items-center gap-2 md:hidden">
              <Badge variant={statusVariant}>
                {statusLabel(displayStatus)}
              </Badge>
              {dueState ? (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${dueState.tone}`}
                >
                  {dueState.label}
                </span>
              ) : null}
              <Badge variant={priorityVariant}>
                {t("orders.detail.hero.priorityBadge", {
                  value: getOrderPriorityLabel(orderState.priority, t),
                })}
              </Badge>
            </div>
          </div>
        </div>

        <TabsContent value="overview">
          <div className="flex flex-col gap-6">
            <div
              className={`grid grid-cols-2 gap-3 sm:grid-cols-2 ${heroKpiGridClass}`}
            >
              {heroKpis.map((kpi) => (
                <Card key={kpi.key} className="h-full">
                  <div
                    className={`flex h-full min-h-24 flex-col justify-start rounded-xl px-3 py-2.5 md:min-h-30 md:px-3.5 md:py-3 ${kpi.className}`}
                  >
                    <div
                      className={`text-[11px] md:text-xs ${kpi.titleClassName}`}
                    >
                      {kpi.title}
                    </div>
                    <div className="flex h-full flex-col justify-between">
                      <div
                        className={`mt-2 flex flex-1 items-center ${kpi.valueClassName}`}
                      >
                        {kpi.value}
                      </div>
                      <div
                        className={`mt-2 min-h-4 text-[10px] md:text-[11px] ${kpi.className ?? "text-muted-foreground"}`}
                      >
                        {"meta" in kpi && kpi.meta ? kpi.meta : null}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("orders.detail.orderInfo")}</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {t("orders.detail.createdAt")}:{" "}
                      {orderState.createdAt
                        ? formatDateTime(orderState.createdAt)
                        : "--"}{" "}
                      · {createdByDisplayName}
                    </span>
                  </CardHeader>
                  <CardContent className="grid items-start gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.orderNumberShort")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {orderState.orderNumber}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.customer")}
                      </div>
                      {inlineEditingField === "customerName" ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            value={inlineDraftValue}
                            onChange={(event) =>
                              setInlineDraftValue(event.target.value)
                            }
                            disabled={isSavingInlineField}
                          />
                          <div className="flex flex-wrap mt-2 items-center gap-2">
                            <Button
                              size="sm"
                              onClick={saveInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.saveChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="text-lg font-semibold">
                            {orderState.customerName}
                          </div>
                          {renderInlineEditButton("customerName")}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.dueDate")}
                      </div>
                      {inlineEditingField === "dueDate" ? (
                        <div className="mt-2 space-y-2">
                          <DatePicker
                            value={inlineDraftValue}
                            onChange={setInlineDraftValue}
                            disabled={isSavingInlineField}
                            className="space-y-2"
                            triggerClassName="h-10"
                            placeholder={t("orders.modal.dueDatePlaceholder")}
                          />
                          <div className="flex flex-wrap mt-2 items-center gap-2">
                            <Button
                              size="sm"
                              onClick={saveInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.saveChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="text-lg font-semibold">
                            {formatDate(orderState.dueDate)}
                          </div>
                          {renderInlineEditButton("dueDate")}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.quantity")}
                      </div>
                      {inlineEditingField === "quantity" ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            type="number"
                            min="0"
                            value={inlineDraftValue}
                            onChange={(event) =>
                              setInlineDraftValue(event.target.value)
                            }
                            disabled={isSavingInlineField}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={saveInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.saveChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="text-lg font-semibold">
                            {orderState.quantity ?? "--"}
                          </div>
                          {renderInlineEditButton("quantity")}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.priority")}
                      </div>
                      {inlineEditingField === "priority" ? (
                        <div className="mt-2 space-y-2">
                          <Select
                            value={inlineDraftValue}
                            onValueChange={setInlineDraftValue}
                            disabled={isSavingInlineField}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                ["low", "normal", "high", "urgent"] as const
                              ).map((priority) => (
                                <SelectItem key={priority} value={priority}>
                                  {getOrderPriorityLabel(priority, t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={saveInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.saveChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="text-lg font-semibold">
                            {getOrderPriorityLabel(orderState.priority, t)}
                          </div>
                          {renderInlineEditButton("priority")}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.deliveryAddress")}
                      </div>
                      {inlineEditingField === "deliveryAddress" ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            value={inlineDraftValue}
                            onChange={(event) =>
                              setInlineDraftValue(event.target.value)
                            }
                            disabled={isSavingInlineField}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={saveInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.saveChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="text-lg font-semibold">
                            {deliveryAddressField
                              ? ((orderState.orderFieldValues?.[
                                  deliveryAddressField.id
                                ] as string | undefined) ?? "--")
                              : "--"}
                          </div>
                          {deliveryAddressField
                            ? renderInlineEditButton("deliveryAddress")
                            : null}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.page.customerPhone")}
                      </div>
                      {inlineEditingField === "customerPhone" ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            value={inlineDraftValue}
                            onChange={(event) =>
                              setInlineDraftValue(event.target.value)
                            }
                            disabled={isSavingInlineField}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={saveInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.saveChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeInlineField}
                              disabled={isSavingInlineField}
                            >
                              {t("orders.page.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="text-lg font-semibold">
                            {customerPhoneField
                              ? ((orderState.orderFieldValues?.[
                                  customerPhoneField.id
                                ] as string | undefined) ?? "--")
                              : "--"}
                          </div>
                          {customerPhoneField
                            ? renderInlineEditButton("customerPhone")
                            : null}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t("orders.detail.overview.assignments")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid items-start gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                          {engineerLabel}
                        </div>
                        {inlineEditingField === "assignedEngineer" ? (
                          <div className="mt-2 space-y-2">
                            <Select
                              value={inlineDraftValue || "__none__"}
                              onValueChange={(value) =>
                                setInlineDraftValue(
                                  value === "__none__" ? "" : value,
                                )
                              }
                              disabled={isSavingInlineField}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={engineerLabel} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">--</SelectItem>
                                {engineers
                                  .filter((engineer) => engineer.id)
                                  .map((engineer) => (
                                    <SelectItem
                                      key={engineer.id}
                                      value={engineer.id}
                                    >
                                      {engineer.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                onClick={saveInlineField}
                                disabled={isSavingInlineField}
                              >
                                {t("orders.page.saveChanges")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={closeInlineField}
                                disabled={isSavingInlineField}
                              >
                                {t("orders.page.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-start justify-between gap-3">
                            <span className="text-lg font-semibold">
                              {orderState.assignedEngineerName ?? "--"}
                            </span>
                            {renderInlineEditButton("assignedEngineer")}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                          {managerLabel}
                        </div>
                        {inlineEditingField === "assignedManager" ? (
                          <div className="mt-2 space-y-2">
                            <Select
                              value={inlineDraftValue || "__none__"}
                              onValueChange={(value) =>
                                setInlineDraftValue(
                                  value === "__none__" ? "" : value,
                                )
                              }
                              disabled={isSavingInlineField}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={managerLabel} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">--</SelectItem>
                                {managers
                                  .filter((manager) => manager.id)
                                  .map((manager) => (
                                    <SelectItem
                                      key={manager.id}
                                      value={manager.id}
                                    >
                                      {manager.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                onClick={saveInlineField}
                                disabled={isSavingInlineField}
                              >
                                {t("orders.page.saveChanges")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={closeInlineField}
                                disabled={isSavingInlineField}
                              >
                                {t("orders.page.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-start justify-between gap-3">
                            <span className="text-lg font-semibold">
                              {orderState.assignedManagerName ?? "--"}
                            </span>
                            {renderInlineEditButton("assignedManager")}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {customFieldRows.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("orders.detail.orderFields")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {customFieldRows.map((field) => (
                        <div
                          key={field.id}
                          className="rounded-md border border-border px-3 py-2"
                        >
                          <div className="text-muted-foreground">
                            {field.label}
                          </div>
                          {inlineEditingField === `orderField:${field.id}` ? (
                            <div className="mt-2 space-y-2">
                              <Input
                                value={inlineDraftValue}
                                onChange={(event) =>
                                  setInlineDraftValue(event.target.value)
                                }
                                disabled={isSavingInlineField}
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={saveInlineField}
                                  disabled={isSavingInlineField}
                                >
                                  {t("orders.page.saveChanges")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={closeInlineField}
                                  disabled={isSavingInlineField}
                                >
                                  {t("orders.page.cancel")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 flex items-start justify-between gap-3">
                              <span className="font-medium">{field.value}</span>
                              {renderInlineEditButton(`orderField:${field.id}`)}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t("orders.detail.overview.execution")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
                    {[engineeringHealth, externalHealth]
                      .concat(blockedHealth ? [blockedHealth] : [])
                      .map((item) => (
                        <div
                          key={item.title}
                          className={`rounded-xl border px-4 py-3 ${item.tone}`}
                        >
                          <div className="text-xs opacity-80">{item.title}</div>
                          <div className="mt-1 text-lg font-semibold">
                            {item.value}
                          </div>
                        </div>
                      ))}
                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {t("orders.detail.hero.engineeringTime")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {engineeringTiming
                          ? formatDuration(engineeringTiming.durationMinutes)
                          : "--"}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {activeChecklistItems.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>
                          {t("orders.detail.workflow.preparationChecklist")}
                        </CardTitle>
                        <div className="text-xs text-muted-foreground">
                          {checklistDoneCount}/{activeChecklistItems.length}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {activeChecklistItems.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                        >
                          <span className="font-medium">{item.label}</span>
                          <Checkbox
                            checked={Boolean(checklistState[item.id])}
                            onChange={(event) =>
                              handleChecklistToggle(
                                item.id,
                                event.target.checked,
                              )
                            }
                          />
                        </label>
                      ))}
                      {canSendToEngineering && !canAdvanceToEngineering && (
                        <p className="text-xs text-muted-foreground">
                          {t("orders.detail.workflow.completeRequired")}
                          {rules.requireOrderInputsForEngineering
                            ? t("orders.detail.workflow.andRequiredOrderInputs")
                            : ""}{" "}
                          {t(
                            "orders.detail.workflow.beforeSendingToEngineering",
                          )}
                        </p>
                      )}
                      {canSendToProduction && !canAdvanceToProduction && (
                        <p className="text-xs text-muted-foreground">
                          {t("orders.detail.workflow.completeRequired")}
                          {rules.requireOrderInputsForProduction
                            ? t("orders.detail.workflow.andRequiredOrderInputs")
                            : ""}{" "}
                          {t(
                            "orders.detail.workflow.beforeSendingToProduction",
                          )}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="details">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("orders.detail.orderInputs.title")}</CardTitle>
                <CardDescription>
                  {t("orders.detail.orderInputs.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderInputError && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {orderInputError}
                  </div>
                )}
                {activeOrderInputFields.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium">
                      {t("orders.detail.orderInputs.noneConfiguredTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "orders.detail.orderInputs.noneConfiguredDescription1",
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "orders.detail.orderInputs.noneConfiguredDescription2",
                      )}
                    </p>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/settings?tab=constructions">
                          {t("orders.detail.openSettings")}
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {t("orders.detail.orderInputs.constructionsSection")}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(
                            "orders.detail.orderInputs.constructionsSectionDescription",
                          )}
                        </p>
                      </div>
                      {constructionTableFields.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
                          <p className="text-sm font-medium">
                            {t(
                              "orders.detail.orderInputs.noConstructionTableTitle",
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t(
                              "orders.detail.orderInputs.noConstructionTableDescription",
                            )}
                          </p>
                          <div className="mt-3">
                            <Button variant="outline" size="sm" asChild>
                              <Link href="/settings?tab=constructions">
                                {t("orders.detail.openSettings")}
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {constructionTableFields.map((field) =>
                            renderOrderInputField(field),
                          )}
                        </div>
                      )}
                    </div>
                    {supplementalOrderInputGroups.size > 0 ? (
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {t("orders.detail.orderInputs.additionalSection")}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t(
                              "orders.detail.orderInputs.additionalSectionDescription",
                            )}
                          </p>
                        </div>
                        {Array.from(supplementalOrderInputGroups.entries()).map(
                          ([groupKey, fields]) => (
                            <div key={groupKey} className="space-y-3">
                              <div className="text-sm font-semibold">
                                {groupKey === "production_scope"
                                  ? t("orders.detail.orderInputs.productionScope")
                                  : t("orders.detail.orderInputs.orderInfo")}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                {fields.map((field) =>
                                  renderOrderInputField(field),
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  {!canEditOrderInputs && (
                    <span className="text-xs text-muted-foreground">
                      {t("orders.detail.orderInputs.editPermissionHint")}
                    </span>
                  )}
                  <Button
                    onClick={handleSaveOrderInputs}
                    disabled={
                      !canEditOrderInputs ||
                      !isOrderInputsDirty ||
                      isSavingOrderInputs
                    }
                  >
                    {isSavingOrderInputs
                      ? t("orders.detail.saving")
                      : t("orders.detail.orderInputs.save")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {t("orders.detail.workflow.statusHistory")}
                  </CardTitle>
                  {statusHistory.length > 5 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAllHistory((prev) => !prev)}
                    >
                      {showAllHistory
                        ? t("orders.detail.showRecent")
                        : t("orders.detail.showAll")}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {(["all", "status", "comment", "file"] as const).map((filter) => (
                    <Button
                      key={filter}
                      type="button"
                      variant={historyFilter === filter ? "default" : "outline"}
                      size="sm"
                      onClick={() => setHistoryFilter(filter)}
                    >
                      {t(`orders.detail.workflow.historyFilter.${filter}`)}
                    </Button>
                  ))}
                </div>
                {visibleHistoryEvents.length > 0 ? (
                  <div className="space-y-3">
                    {visibleHistoryEvents.map((event, index) => (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-2.5 w-2.5 rounded-full ${
                              event.type === "status"
                                ? "bg-primary"
                                : event.type === "comment"
                                  ? "bg-blue-500"
                                  : "bg-emerald-500"
                            }`}
                          />
                          {index < visibleHistoryEvents.length - 1 ? (
                            <div className="mt-1 h-full w-px bg-border" />
                          ) : null}
                        </div>
                        <div className="flex-1 rounded-md border border-border px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              {event.type === "status" ? (
                                <Badge variant={`status-${event.meta}`}>
                                  {statusLabel(event.label as OrderStatus)}
                                </Badge>
                              ) : (
                                <div className="text-sm font-medium text-foreground">
                                  {event.type === "comment"
                                    ? t("orders.detail.workflow.historyEvent.commentAdded")
                                    : t("orders.detail.workflow.historyEvent.fileAdded")}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(event.createdAt)}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {event.actor || t("orders.detail.unknown")}
                            {event.actorRole ? ` (${event.actorRole})` : ""}
                          </div>
                          {event.type !== "status" ? (
                            <div className="mt-1 text-sm text-foreground">
                              {event.label}
                              {event.type === "file" && event.meta
                                ? ` · ${event.meta}`
                                : ""}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    {t("orders.detail.workflow.historyEmpty")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("orders.detail.attachments.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                    {t("orders.detail.attachments.totalFiles", {
                      count: attachments.length,
                    })}
                  </span>
                  {latestAttachment ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                      {t("orders.detail.attachments.latestUpload", {
                        date: formatDate(
                          latestAttachment.createdAt.slice(0, 10),
                        ),
                      })}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                    {t("orders.detail.attachments.categoriesCount", {
                      count: attachmentGroups.length,
                    })}
                  </span>
                  {selectedAttachmentsCount > 0 ? (
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                      {t("orders.detail.attachments.selectedCount", {
                        count: selectedAttachmentsCount,
                      })}
                    </span>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-muted/10 p-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
                    <div className="min-w-0">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        {t("orders.detail.attachments.category")}
                      </div>
                      <Select
                        value={attachmentCategory}
                        onValueChange={(value) => {
                          setAttachmentCategory(value);
                          setIsAttachmentCategoryManual(true);
                        }}
                      >
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {attachmentCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("orders.detail.attachments.categoryDescription")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div
                        className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background px-4 py-4 text-center text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleFilesAdded(event.dataTransfer.files);
                        }}
                        onClick={() => {
                          const input = document.getElementById(
                            "attachment-file-input",
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                      >
                        <UploadIcon className="h-4 w-4" />
                        <span>
                          {t("orders.detail.attachments.dragAndDrop")}
                        </span>
                        <span className="text-[11px]">
                          {t("orders.detail.attachments.maxPerFile", {
                            size: MAX_FILE_SIZE_MB,
                          })}
                        </span>
                      </div>
                      <FileField
                        id="attachment-file-input"
                        multiple
                        wrapperClassName="hidden"
                        onChange={(event) => {
                          if (event.target.files) {
                            handleFilesAdded(event.target.files);
                          }
                          event.target.value = "";
                        }}
                      />
                      {attachmentError ? (
                        <p className="text-xs text-destructive">
                          {attachmentError}
                        </p>
                      ) : null}
                      {attachmentNotice ? (
                        <p className="text-xs text-muted-foreground">
                          {attachmentNotice}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {attachmentFiles.length > 0 ? (
                  <div className="rounded-xl border border-border bg-muted/10 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-muted-foreground">
                        {t("orders.detail.attachments.pendingFiles")}
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddAttachment}
                        disabled={isUploading}
                      >
                        <UploadIcon className="h-4 w-4" />
                        {isUploading
                          ? t("orders.detail.uploading")
                          : t("orders.detail.upload")}
                      </Button>
                    </div>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {attachmentFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {file.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePendingFile(index)}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {attachments.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("orders.detail.attachments.empty")}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {attachmentGroups.map((group) => {
                      const selectedInGroup = group.items.filter((item) =>
                        selectedAttachmentIds.includes(item.id),
                      );
                      return (
                        <div
                          key={group.key}
                          className="overflow-hidden rounded-xl border border-border bg-background"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/10 px-3 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold">
                                  {group.label}
                                </div>
                                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {t("orders.detail.attachments.totalFiles", {
                                    count: group.items.length,
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                disabled={
                                  downloadingAttachmentGroup === group.key
                                }
                                onClick={() => {
                                  void handleDownloadAttachmentGroup(group);
                                }}
                              >
                                <DownloadIcon className="h-3.5 w-3.5" />
                                {downloadingAttachmentGroup === group.key
                                  ? t("orders.detail.preparing")
                                  : t("orders.detail.attachments.downloadAll")}
                              </Button>
                              {selectedInGroup.length > 0 ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  disabled={
                                    deletingAttachmentGroup === group.key
                                  }
                                  onClick={() => {
                                    void handleDeleteAttachmentGroup(
                                      group,
                                      "selected",
                                    );
                                  }}
                                >
                                  {deletingAttachmentGroup === group.key
                                    ? t("orders.detail.deleting")
                                    : t(
                                        "orders.detail.attachments.deleteSelected",
                                      )}
                                </Button>
                              ) : null}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-muted-foreground"
                                    aria-label={t(
                                      "orders.detail.attachments.deleteAll",
                                    )}
                                  >
                                    <MoreHorizontalIcon className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-48 p-2"
                                >
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="w-full justify-start text-destructive hover:text-destructive"
                                    disabled={
                                      deletingAttachmentGroup === group.key
                                    }
                                    onClick={() => {
                                      void handleDeleteAttachmentGroup(
                                        group,
                                        "all",
                                      );
                                    }}
                                  >
                                    {deletingAttachmentGroup === group.key
                                      ? t("orders.detail.deleting")
                                      : t(
                                          "orders.detail.attachments.deleteAll",
                                        )}
                                  </Button>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                          <div className="divide-y divide-border">
                            {group.items.map((attachment) => {
                              const fileUrl = resolveAttachmentUrl(attachment);
                              const sizeLabel = formatFileSize(attachment.size);
                              const attachmentCategoryKey =
                                attachment.category ?? "";
                              return (
                                <div
                                  key={attachment.id}
                                  className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between"
                                >
                                  <div className="flex min-w-0 items-start gap-3">
                                    {renderAttachmentPreview(
                                      attachment,
                                      fileUrl,
                                    )}
                                    <div className="min-w-0">
                                      <div className="break-all text-sm font-medium">
                                        {attachment.name}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="rounded-full border border-border bg-muted/10 px-2 py-0.5 text-[11px]">
                                          {attachmentCategoryLabels[
                                            attachmentCategoryKey
                                          ] ?? attachment.category}
                                        </span>
                                        <span>
                                          {t(
                                            "orders.detail.attachments.addedBy",
                                            {
                                              name: attachment.addedBy,
                                            },
                                          )}
                                          {attachment.addedByRole
                                            ? ` (${attachment.addedByRole})`
                                            : ""}
                                        </span>
                                        <span>
                                          {formatDate(
                                            attachment.createdAt.slice(0, 10),
                                          )}
                                        </span>
                                        {sizeLabel ? (
                                          <span>{sizeLabel}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-end gap-2 md:self-start">
                                    <Checkbox
                                      variant="box"
                                      checked={selectedAttachmentIds.includes(
                                        attachment.id,
                                      )}
                                      onChange={(event) => {
                                        const checked = event.target.checked;
                                        setSelectedAttachmentIds((prev) => {
                                          if (checked) {
                                            return prev.includes(attachment.id)
                                              ? prev
                                              : [...prev, attachment.id];
                                          }
                                          return prev.filter(
                                            (itemId) =>
                                              itemId !== attachment.id,
                                          );
                                        });
                                      }}
                                    />
                                    {fileUrl ? (
                                      <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary underline underline-offset-2"
                                      >
                                        {t("orders.detail.open")}
                                      </a>
                                    ) : null}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleRemoveAttachment(attachment.id)
                                      }
                                    >
                                      <Trash2Icon className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("orders.detail.comments.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                    {t("orders.detail.comments.totalComments", {
                      count: comments.length,
                    })}
                  </span>
                  {latestComment ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                      {t("orders.detail.comments.latestComment", {
                        date: formatDate(latestComment.createdAt.slice(0, 10)),
                      })}
                    </span>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-muted/5 p-3">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t("orders.detail.comments.composerHint")}
                    </p>
                    <textarea
                      value={commentMessage}
                      onChange={(event) =>
                        setCommentMessage(event.target.value)
                      }
                      className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder={t("orders.detail.comments.placeholder")}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAddComment}>
                        {t("orders.detail.comments.add")}
                      </Button>
                    </div>
                  </div>
                </div>
                {comments.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("orders.detail.comments.empty")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="relative rounded-xl border border-border/80 bg-background px-3 py-3"
                      >
                        <div className="absolute bottom-0 left-5 top-0 w-px bg-border/70" />
                        <div className="relative flex items-start gap-3">
                          <div className="z-10 mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-foreground">
                            {getInitials(comment.author)}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="text-sm font-medium leading-none text-foreground">
                                  {comment.author}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {comment.authorRole ||
                                    t("orders.detail.comments.roleUnknown")}
                                  {" · "}
                                  {formatDateTime(comment.createdAt)}
                                </div>
                              </div>
                              {canRemoveComment(comment) ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-muted-foreground"
                                  onClick={() =>
                                    handleRemoveComment(comment.id)
                                  }
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            <div className="whitespace-pre-wrap text-sm text-foreground">
                              {comment.message}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="external">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("orders.detail.external.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("orders.detail.external.requestMode")}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setExternalRequestMode("manual")}
                      className={`rounded-lg border px-3 py-2 text-left ${
                        externalRequestMode === "manual"
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="font-medium">
                        {t("orders.detail.external.manualEntry")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("orders.detail.external.manualEntryDescription")}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (canSendExternalJobToPartner) {
                          setExternalRequestMode("partner_portal");
                        }
                      }}
                      className={`rounded-lg border px-3 py-2 text-left ${
                        externalRequestMode === "partner_portal"
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background"
                      } ${!canSendExternalJobToPartner ? "opacity-60" : ""}`}
                    >
                      <div className="font-medium">
                        {t("orders.detail.external.partnerPortal")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("orders.detail.external.partnerPortalDescription")}
                      </div>
                      {!canSendExternalJobToPartner ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("orders.detail.external.availableOnPro")}
                        </div>
                      ) : null}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <SelectField
                    label={t("orders.detail.external.partnerGroup")}
                    value={externalPartnerGroupId || "__all__"}
                    onValueChange={(value) =>
                      setExternalPartnerGroupId(
                        value === "__all__" ? "" : value,
                      )
                    }
                  >
                    <Select
                      value={externalPartnerGroupId || "__all__"}
                      onValueChange={(value) =>
                        setExternalPartnerGroupId(
                          value === "__all__" ? "" : value,
                        )
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">
                          {t("orders.detail.external.allGroups")}
                        </SelectItem>
                        {activeGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                  <SelectField
                    label={t("orders.detail.external.partner")}
                    value={externalPartnerId || "__none__"}
                    onValueChange={(value) =>
                      setExternalPartnerId(value === "__none__" ? "" : value)
                    }
                  >
                    <Select
                      value={externalPartnerId || "__none__"}
                      onValueChange={(value) =>
                        setExternalPartnerId(value === "__none__" ? "" : value)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t("orders.detail.external.selectPartner")}
                        </SelectItem>
                        {activePartners
                          .filter((partner) =>
                            externalPartnerGroupId
                              ? partner.groupId === externalPartnerGroupId
                              : true,
                          )
                          .map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                              {partner.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </SelectField>
                </div>
                {externalRequestMode === "manual" ? (
                  manualExternalJobFields.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid gap-3 lg:grid-cols-2">
                        {manualExternalJobFields.map((field) => {
                          const rawValue = externalJobFieldValues[field.id];
                          if (field.fieldType === "toggle") {
                            return (
                              <div
                                key={field.id}
                                className="flex h-10 items-center rounded-lg border border-border bg-input-background px-3"
                              >
                                <Checkbox
                                  checked={rawValue === true}
                                  onChange={(event) =>
                                    setExternalJobFieldValues((prev) => ({
                                      ...prev,
                                      [field.id]: event.target.checked,
                                    }))
                                  }
                                  label={
                                    <>
                                      {field.label}
                                      {field.isRequired ? " *" : ""}
                                    </>
                                  }
                                  containerClassName="text-sm"
                                />
                              </div>
                            );
                          }
                          if (field.fieldType === "select") {
                            const isStatusField =
                              field.key.trim().toLowerCase() === "status";
                            const selectOptions = isStatusField
                              ? Object.entries(externalJobStatusLabels).map(
                                  ([value, label]) => ({
                                    value,
                                    label,
                                  }),
                                )
                              : (field.options ?? []).map((option) => ({
                                  value: option,
                                  label: option,
                                }));
                            return (
                              <SelectField
                                key={field.id}
                                label={field.label}
                                value={
                                  typeof rawValue === "string" && rawValue
                                    ? rawValue
                                    : "__none__"
                                }
                                onValueChange={(value) =>
                                  setExternalJobFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]:
                                      value === "__none__" ? "" : value,
                                  }))
                                }
                              >
                                <Select
                                  value={
                                    typeof rawValue === "string" && rawValue
                                      ? rawValue
                                      : "__none__"
                                  }
                                  onValueChange={(value) =>
                                    setExternalJobFieldValues((prev) => ({
                                      ...prev,
                                      [field.id]:
                                        value === "__none__" ? "" : value,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-10 w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      {t("orders.detail.external.selectValue")}
                                    </SelectItem>
                                    {selectOptions.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </SelectField>
                            );
                          }
                          if (field.fieldType === "date") {
                            return (
                              <DatePicker
                                key={field.id}
                                label={field.label}
                                value={
                                  typeof rawValue === "string" ? rawValue : ""
                                }
                                onChange={(value) =>
                                  setExternalJobFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: value,
                                  }))
                                }
                                className="space-y-2 text-sm font-medium"
                                triggerClassName="h-10"
                              />
                            );
                          }
                          if (field.fieldType === "textarea") {
                            return (
                              <TextAreaField
                                key={field.id}
                                label={field.label}
                                value={
                                  typeof rawValue === "string" ? rawValue : ""
                                }
                                onChange={(event) =>
                                  setExternalJobFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: event.target.value,
                                  }))
                                }
                                className="min-h-20"
                              />
                            );
                          }
                          return (
                            <label
                              key={field.id}
                              className="space-y-2 text-sm font-medium"
                            >
                              {field.label}
                              <Input
                                type={
                                  field.fieldType === "number"
                                    ? "number"
                                    : "text"
                                }
                                value={
                                  typeof rawValue === "string" ||
                                  typeof rawValue === "number"
                                    ? String(rawValue)
                                    : ""
                                }
                                onChange={(event) =>
                                  setExternalJobFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: event.target.value,
                                  }))
                                }
                                className="h-10 w-full px-3 text-sm"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
                      <p className="text-sm font-medium">
                        {t("orders.detail.external.noFieldsTitle")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("orders.detail.external.noFieldsDescription1")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("orders.detail.external.noFieldsDescription2")}
                      </p>
                      <div className="mt-3">
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/settings?tab=partners">
                            {t("orders.detail.openSettings")}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 px-4 py-3">
                    <TextAreaField
                      label={t("orders.detail.external.partnerComment")}
                      value={externalPortalComment}
                      onChange={(event) =>
                        setExternalPortalComment(event.target.value)
                      }
                      placeholder={t(
                        "orders.detail.external.partnerCommentPlaceholder",
                      )}
                      className="min-h-22.5"
                    />
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        {t("orders.detail.external.partnerFiles")}
                      </div>
                      <FileField
                        multiple
                        wrapperClassName="w-full"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          if (files.length === 0) {
                            return;
                          }
                          const oversized = files.find(
                            (file) => file.size > MAX_FILE_SIZE_BYTES,
                          );
                          if (oversized) {
                            setExternalError(
                              `${oversized.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
                            );
                            return;
                          }
                          setExternalPortalFiles((prev) => [...prev, ...files]);
                          event.target.value = "";
                        }}
                        className="text-sm"
                      />
                      {externalPortalFiles.length > 0 ? (
                        <div className="space-y-2">
                          {externalPortalFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${index}`}
                              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
                            >
                              <span>{file.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setExternalPortalFiles((prev) =>
                                    prev.filter((_, idx) => idx !== index),
                                  )
                                }
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t("orders.detail.external.noFilesSelected")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {externalError && (
                  <p className="text-xs text-destructive">{externalError}</p>
                )}
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Plan:{" "}
                  <span className="font-medium">{subscription.planCode}</span>{" "}
                  {canSendExternalJobToPartner
                    ? t("orders.detail.external.planIncludesSend")
                    : t("orders.detail.external.planManualOnly")}
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleAddExternalJob}>
                    {externalRequestMode === "partner_portal"
                      ? t("orders.detail.external.createPortalRequest")
                      : t("orders.detail.external.addExternalJob")}
                  </Button>
                </div>

                {visibleExternalJobs.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("orders.detail.external.empty")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {visibleExternalJobs.map((job) => {
                      const pendingFiles = externalJobFiles[job.id] ?? [];
                      const uploadState = externalJobUpload[job.id];
                      const partnerGroupName =
                        activeGroups.find(
                          (group) =>
                            group.id ===
                            activePartners.find(
                              (partner) => partner.id === job.partnerId,
                            )?.groupId,
                        )?.name ?? "";
                      return (
                        <div
                          key={job.id}
                          className="space-y-3 rounded-lg border border-border px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">
                                  {job.partnerName}
                                </div>
                                {partnerGroupName ? (
                                  <span className="text-xs text-muted-foreground">
                                    {partnerGroupName}
                                  </span>
                                ) : null}
                              </div>
                              {job.quantity !== undefined && (
                                <div className="text-xs text-muted-foreground">
                                  Qty: {job.quantity}
                                </div>
                              )}
                              <div className="mt-2 rounded-md border border-border bg-muted/20 px-2 py-2">
                                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                  Timeline
                                </div>
                                <div className="space-y-1">
                                  {buildExternalTimeline(job).map((item) => (
                                    <div
                                      key={`${job.id}-${item.label}-${item.at}`}
                                      className="flex items-center justify-between gap-2 text-xs"
                                    >
                                      <span className="text-muted-foreground">
                                        {item.label}
                                      </span>
                                      <span>{item.at}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {job.partnerRequestComment ? (
                                <div className="text-xs text-muted-foreground">
                                  {t("orders.detail.external.requestNote")}:{" "}
                                  {job.partnerRequestComment}
                                </div>
                              ) : null}
                              {job.partnerResponseNote ? (
                                <div className="text-xs text-muted-foreground">
                                  {t("orders.detail.external.note")}:{" "}
                                  {job.partnerResponseNote}
                                </div>
                              ) : null}
                              {(job.requestMode === "partner_portal"
                                ? portalResponseExternalJobFields.length > 0
                                  ? portalResponseExternalJobFields
                                  : manualExternalJobFields
                                : manualExternalJobFields
                              ).length > 0 && (
                                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                                  {(job.requestMode === "partner_portal"
                                    ? portalResponseExternalJobFields.length > 0
                                      ? portalResponseExternalJobFields
                                      : manualExternalJobFields
                                    : manualExternalJobFields
                                  ).map((field, index, fields) => {
                                    const semantic =
                                      getExternalFieldSemantic(field);
                                    if (
                                      semantic !== "other" &&
                                      fields
                                        .slice(0, index)
                                        .some(
                                          (candidate) =>
                                            getExternalFieldSemantic(
                                              candidate,
                                            ) === semantic,
                                        )
                                    ) {
                                      return null;
                                    }
                                    const value =
                                      externalJobValuesByJobId[job.id]?.[
                                        field.id
                                      ];
                                    const fallbackValue =
                                      semantic === "external_order"
                                        ? job.requestMode === "partner_portal"
                                          ? job.partnerResponseOrderNumber
                                          : job.externalOrderNumber
                                        : semantic === "due_date"
                                          ? job.requestMode === "partner_portal"
                                            ? job.partnerResponseDueDate
                                            : job.dueDate
                                          : semantic === "unit_price" &&
                                              job.requestMode !==
                                                "partner_portal"
                                            ? undefined
                                            : undefined;
                                    const resolvedValue =
                                      isEmptyExternalFieldValue(value)
                                        ? fallbackValue
                                        : value;
                                    return (
                                      <div key={field.id}>
                                        {field.label}:{" "}
                                        {formatExternalFieldValue(
                                          field,
                                          resolvedValue,
                                          job.requestMode,
                                          job.partnerName,
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={externalJobStatusVariant(job.status)}
                              >
                                {externalJobStatusLabels[job.status]}
                              </Badge>
                              {canSendExternalJobToPartner ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSendToPartner(job.id)}
                                  disabled={sendingToPartnerJobId === job.id}
                                >
                                  {sendingToPartnerJobId === job.id
                                    ? t("orders.detail.sending")
                                    : job.requestMode === "partner_portal"
                                      ? t(
                                          "orders.detail.external.resendRequest",
                                        )
                                      : job.partnerRequestSentAt
                                        ? t(
                                            "orders.detail.external.resendRequest",
                                          )
                                        : t(
                                            "orders.detail.external.sendToPartner",
                                          )}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {t("orders.detail.external.manualEntryBasic")}
                                </span>
                              )}
                              <Select
                                value={job.status}
                                onValueChange={(value) =>
                                  handleExternalStatusChange(
                                    job.id,
                                    value as ExternalJobStatus,
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-40 rounded-md text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(externalJobStatusLabels).map(
                                    ([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveExternalJob(job.id)}
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                {t("orders.detail.attachments.title")}
                              </div>
                              <div className="flex items-center gap-2">
                                <FileField
                                  id={`external-files-${job.id}`}
                                  multiple
                                  wrapperClassName="hidden"
                                  onChange={(event) => {
                                    if (event.target.files) {
                                      handleExternalFilesAdded(
                                        job.id,
                                        event.target.files,
                                      );
                                    }
                                    event.target.value = "";
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const input = document.getElementById(
                                      `external-files-${job.id}`,
                                    ) as HTMLInputElement | null;
                                    input?.click();
                                  }}
                                >
                                  {t("orders.detail.external.addFiles")}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleUploadExternalFiles(job.id)
                                  }
                                  disabled={
                                    pendingFiles.length === 0 ||
                                    uploadState?.isUploading
                                  }
                                >
                                  {uploadState?.isUploading
                                    ? t("orders.detail.uploading")
                                    : t("orders.detail.upload")}
                                </Button>
                              </div>
                            </div>
                            {uploadState?.error && (
                              <p className="text-xs text-destructive">
                                {uploadState.error}
                              </p>
                            )}
                            {pendingFiles.length > 0 && (
                              <div className="space-y-2 text-xs text-muted-foreground">
                                {pendingFiles.map((file, index) => (
                                  <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                                  >
                                    <span>{file.name}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setExternalJobFiles((prev) => ({
                                          ...prev,
                                          [job.id]: (prev[job.id] ?? []).filter(
                                            (_, idx) => idx !== index,
                                          ),
                                        }))
                                      }
                                    >
                                      <Trash2Icon className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(job.attachments ?? []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {t("orders.detail.external.noFilesUploaded")}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {(job.attachments ?? []).map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      {renderAttachmentPreview(
                                        file as ExternalJobAttachment,
                                        resolveExternalAttachmentUrl(
                                          file as ExternalJobAttachment,
                                        ),
                                      )}
                                      <span className="font-medium">
                                        {file.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {resolveExternalAttachmentUrl(
                                        file as ExternalJobAttachment,
                                      ) && (
                                        <a
                                          href={resolveExternalAttachmentUrl(
                                            file as ExternalJobAttachment,
                                          )}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs text-primary underline"
                                        >
                                          {t("orders.detail.open")}
                                        </a>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleRemoveExternalFile(
                                            job.id,
                                            file.id,
                                          )
                                        }
                                      >
                                        <Trash2Icon className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {t("orders.detail.external.statusHistory")}
                            </div>
                            {job.statusHistory &&
                            job.statusHistory.length > 0 ? (
                              <div className="space-y-2">
                                {(expandedExternalHistory[job.id]
                                  ? job.statusHistory
                                  : job.statusHistory.slice(0, 3)
                                ).map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant={externalJobStatusVariant(
                                          entry.status,
                                        )}
                                      >
                                        {externalJobStatusLabels[entry.status]}
                                      </Badge>
                                      <span className="text-muted-foreground">
                                        {entry.changedBy}
                                        {entry.changedByRole
                                          ? ` (${entry.changedByRole})`
                                          : ""}
                                      </span>
                                    </div>
                                    <span className="text-muted-foreground">
                                      {formatDate(entry.changedAt.slice(0, 10))}
                                    </span>
                                  </div>
                                ))}
                                {job.statusHistory.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedExternalHistory((prev) => ({
                                        ...prev,
                                        [job.id]: !prev[job.id],
                                      }))
                                    }
                                    className="text-xs text-primary underline"
                                  >
                                    {expandedExternalHistory[job.id]
                                      ? t("orders.detail.showLess")
                                      : t("orders.detail.showAllWithCount", {
                                          count: job.statusHistory.length,
                                        })}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {t("orders.detail.external.noStatusUpdates")}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {isReturnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {t("orders.detail.sendBackTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("orders.detail.sendBackDescription")}{" "}
              {statusLabel(returnTargetStatus)}.
            </p>
            <div className="mt-4 space-y-3">
              <SelectField
                label={t("orders.detail.reason")}
                value={returnReason || "__none__"}
                onValueChange={(value) =>
                  setReturnReason(value === "__none__" ? "" : value)
                }
              >
                <Select
                  value={returnReason || "__none__"}
                  onValueChange={(value) =>
                    setReturnReason(value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue
                      placeholder={t("orders.detail.selectReason")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      {t("orders.detail.selectReason")}
                    </SelectItem>
                    {rules.returnReasons
                      .filter((reason) => reason.trim() !== "")
                      .map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </SelectField>
              <TextAreaField
                label={t("orders.detail.comment")}
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                className="min-h-22.5"
                placeholder={t("orders.detail.sendBackCommentPlaceholder")}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsReturnOpen(false)}>
                {t("orders.page.cancel")}
              </Button>
              <Button
                onClick={async () => {
                  const trimmedNote = returnNote.trim();
                  if (!returnReason && !trimmedNote) {
                    return;
                  }
                  const reasonLabel =
                    returnReason || t("orders.detail.noReasonSelected");
                  const created = await addOrderComment(orderState.id, {
                    message: `Returned: ${reasonLabel}${
                      trimmedNote ? ` - ${trimmedNote}` : ""
                    }`,
                    author: name,
                    authorRole: role,
                  });
                  if (created) {
                    setOrderState((prev) =>
                      prev
                        ? {
                            ...prev,
                            comments: [created, ...(prev.comments ?? [])],
                          }
                        : prev,
                    );
                  }
                  setReturnReason("");
                  setReturnNote("");
                  setIsReturnOpen(false);
                  await handleStatusChange(returnTargetStatus);
                }}
              >
                {t("orders.detail.sendBack")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </section>
  );
}
