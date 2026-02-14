"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
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
  OrderAttachment,
  OrderComment,
  OrderStatus,
} from "@/types/orders";
import type {
  OrderInputField,
  OrderInputTableColumn,
} from "@/types/orderInputs";
import Link from "next/link";
import {
  ArrowLeftIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PanelRightIcon,
  PencilIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { OrderModal } from "@/app/orders/components/OrderModal";
import { useOrders } from "@/app/orders/OrdersContext";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { uploadOrderAttachment } from "@/lib/uploadOrderAttachment";
import { uploadExternalJobAttachment } from "@/lib/uploadExternalJobAttachment";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { usePartners } from "@/hooks/usePartners";
import { useNotifications } from "@/components/ui/Notifications";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { useRbac } from "@/contexts/RbacContext";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const defaultAttachmentCategories = [
  { id: "order_documents", label: "Order documents" },
  { id: "technical_docs", label: "Technical documentation" },
  { id: "photos", label: "Site photos" },
  { id: "other", label: "Other" },
];

function formatDuration(totalMinutes?: number | null) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
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
  const { levels, nodes } = useHierarchy();
  const { role, isAdmin, name, id: userId, tenantId } = useCurrentUser();
  const { hasPermission } = useRbac();
  const { confirm, dialog } = useConfirmDialog();
  const { rules } = useWorkflowRules();
  const { activePartners, activeGroups } = usePartners();
  const { notify } = useNotifications();
  const { subscription, hasCapability } = useTenantSubscription();

  async function confirmRemove(title: string, description?: string) {
    return confirm({
      title,
      description,
      confirmLabel: "Delete",
    });
  }
  const engineerLabel = rules.assignmentLabels?.engineer ?? "Engineer";
  const managerLabel = rules.assignmentLabels?.manager ?? "Manager";
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
  const getInitials = (value?: string) =>
    value
      ? value
          .split(" ")
          .filter(Boolean)
          .map((part) => part[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "";
  const statusLabel = (status: OrderStatus) =>
    rules.statusLabels?.[status] ?? formatOrderStatus(status);
  const activeLevels = useMemo(
    () =>
      levels
        .filter(
          (level) =>
            level.isActive &&
            level.key !== "engineer" &&
            level.key !== "manager",
        )
        .sort((a, b) => a.order - b.order),
    [levels],
  );
  const nodeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((node) => map.set(node.id, node.label));
    return map;
  }, [nodes]);

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
  const [isEditOpen, setIsEditOpen] = useState(false);
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
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {},
  );
  const [showAllHistory, setShowAllHistory] = useState(false);
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
  const [tableRowSelections, setTableRowSelections] = useState<
    Record<string, number[]>
  >({});
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
  const [expandedExternalHistory, setExpandedExternalHistory] = useState<
    Record<string, boolean>
  >({});
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<
    Record<string, string>
  >({});
  const [signedExternalAttachmentUrls, setSignedExternalAttachmentUrls] =
    useState<Record<string, string>>({});
  const [showDesktopStickyShadow, setShowDesktopStickyShadow] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const [isMobileSectionsOpen, setIsMobileSectionsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth < 768) {
        setShowDesktopStickyShadow(false);
      } else {
        setShowDesktopStickyShadow(window.scrollY > 8);
      }
      setShowCompactMobileTitle(window.scrollY > 52);
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
  const canReturnToQueue =
    role === "Engineering" &&
    orderState?.assignedEngineerId === userId &&
    (orderState?.status === "in_engineering" ||
      orderState?.status === "engineering_blocked" ||
      orderState?.status === "ready_for_engineering");
  const canSendToEngineering =
    role === "Sales" && orderState?.status === "draft";
  const canStartEngineering =
    role === "Engineering" && orderState?.status === "ready_for_engineering";
  const canBlockEngineering =
    role === "Engineering" && orderState?.status === "in_engineering";
  const canSendToProduction =
    role === "Engineering" && orderState?.status === "in_engineering";
  const canAssignEngineer = role === "Sales" || isAdmin;
  const canAssignManager =
    (role === "Sales" || isAdmin) && role !== "Engineering";
  const canSendBack =
    (role === "Sales" &&
      (orderState?.status === "ready_for_engineering" ||
        orderState?.status === "in_engineering" ||
        orderState?.status === "engineering_blocked")) ||
    (role === "Engineering" &&
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
  const canEditOrderRecord = hasPermission("orders.manage");

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
  const visibleStatusHistory = showAllHistory
    ? statusHistory
    : statusHistory.slice(0, 5);
  const visibleExternalJobs = useMemo(
    () => uniqueExternalJobsById(orderState?.externalJobs ?? []),
    [orderState?.externalJobs],
  );

  useEffect(() => {
    if (!orderState?.assignedEngineerId) {
      setSelectedEngineerId("");
      return;
    }
    setSelectedEngineerId(orderState.assignedEngineerId);
  }, [orderState?.assignedEngineerId]);

  useEffect(() => {
    if (!orderState?.assignedManagerId) {
      setSelectedManagerId("");
      return;
    }
    setSelectedManagerId(orderState.assignedManagerId);
  }, [orderState?.assignedManagerId]);

  useEffect(() => {
    if (!supabase) {
      setEngineers([
        { id: "eng-1", name: `${engineerLabel} 1` },
        { id: "eng-2", name: `${engineerLabel} 2` },
      ]);
      return;
    }

    let isMounted = true;
    const fetchEngineers = async () => {
      const query = supabase
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
    if (!supabase) {
      setManagers([
        { id: "mgr-1", name: `${managerLabel} 1` },
        { id: "mgr-2", name: `${managerLabel} 2` },
      ]);
      return;
    }

    let isMounted = true;
    const fetchManagers = async () => {
      const query = supabase.from("profiles").select("id, full_name, role");
      query.in("role", ["Sales"]);
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
    setIsLoadingOrder(false);
    setChecklistState(order?.checklist ?? {});
  }, [order]);

  useEffect(() => {
    if (!supabase || !tenantId) {
      return;
    }
    let isMounted = true;
    const loadOrderInputFields = async () => {
      const { data, error } = await supabase
        .from("order_input_fields")
        .select(
          "id, key, label, group_key, field_type, unit, options, is_required, is_active, sort_order",
        )
        .order("group_key", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted) {
        return;
      }
      if (error) {
        setOrderInputError("Failed to load order inputs.");
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
        columns: row.options?.columns ?? undefined,
        isRequired: row.is_required ?? false,
        isActive: row.is_active ?? true,
        sortOrder: row.sort_order ?? 0,
      }));
      setOrderInputFields(mapped);
    };
    void loadOrderInputFields();
    return () => {
      isMounted = false;
    };
  }, [supabase, tenantId]);

  useEffect(() => {
    if (!supabase || !tenantId) {
      setExternalJobFields([]);
      setExternalJobFieldValues({});
      setExternalJobValuesByJobId({});
      return;
    }
    let isMounted = true;
    const loadExternalJobFields = async () => {
      const { data, error } = await supabase
        .from("external_job_fields")
        .select(
          "id, key, label, field_type, scope, unit, options, is_required, is_active, sort_order",
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
  }, [supabase, tenantId]);

  useEffect(() => {
    if (!supabase || !tenantId) {
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
      const { data, error } = await supabase
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
  }, [orderState?.externalJobs, supabase, tenantId]);

  useEffect(() => {
    if (!supabase || !orderState?.id) {
      setOrderInputValues({});
      setOrderInputInitialValues({});
      return;
    }
    let isMounted = true;
    const loadOrderInputValues = async () => {
      const { data, error } = await supabase
        .from("order_input_values")
        .select("field_id, value")
        .eq("order_id", orderState.id);
      if (!isMounted) {
        return;
      }
      if (error) {
        setOrderInputError("Failed to load order values.");
        return;
      }
      setOrderInputError("");
      const nextValues: Record<string, unknown> = {};
      (data ?? []).forEach((row) => {
        nextValues[row.field_id] = row.value ?? undefined;
      });
      setOrderInputValues(nextValues);
      setOrderInputInitialValues(nextValues);
    };
    void loadOrderInputValues();
    return () => {
      isMounted = false;
    };
  }, [orderState?.id, supabase]);

  useEffect(() => {
    if (!supabase || !orderState?.id) {
      setProductionDisplayStatus(null);
      return;
    }
    let isMounted = true;
    const loadProductionStatus = async () => {
      const { data, error } = await supabase
        .from("production_items")
        .select("status")
        .eq("order_id", orderState.id);
      if (!isMounted) {
        return;
      }
      if (error || !data || data.length === 0) {
        setProductionDisplayStatus(null);
        return;
      }
      const total = data.length;
      const done = data.filter((item) => item.status === "done").length;
      setProductionDisplayStatus(done === total ? "done" : "in_production");
    };
    void loadProductionStatus();
    return () => {
      isMounted = false;
    };
  }, [orderState?.id, supabase]);

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

  const attachments = orderState?.attachments ?? [];
  const productionDocumentationParseAttachments = useMemo(
    () =>
      attachments.filter((attachment) => {
        const categoryLabel = attachment.category
          ? (attachmentCategoryLabels[attachment.category] ??
            attachment.category)
          : "";
        const normalizedCategory = categoryLabel.trim().toLowerCase();
        const isProductionDocumentation =
          normalizedCategory === "production documentation";
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
    [attachments, attachmentCategoryLabels],
  );
  const comments = orderState?.comments ?? [];
  useEffect(() => {
    if (!supabase) {
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
          const { data } = await supabase.storage
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
  }, [attachments, signedAttachmentUrls]);

  useEffect(() => {
    if (!supabase) {
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
          const { data } = await supabase.storage
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
  }, [orderState?.externalJobs, signedExternalAttachmentUrls]);
  const meetsEngineeringChecklist = requiredForEngineering.every(
    (item) => checklistState[item.id],
  );
  const meetsProductionChecklist = requiredForProduction.every(
    (item) => checklistState[item.id],
  );
  const meetsEngineeringAttachments =
    attachments.length >= rules.minAttachmentsForEngineering;
  const meetsProductionAttachments =
    attachments.length >= rules.minAttachmentsForProduction;
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
  }, [attachments]);
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
  const hasRequiredOrderInputs = activeOrderInputFields
    .filter((field) => field.isRequired)
    .every((field) =>
      shouldPersistOrderInputValue(
        field,
        normalizeOrderInputValue(field, orderInputValues[field.id]),
      ),
    );
  const canAdvanceToEngineering =
    meetsEngineeringChecklist &&
    meetsEngineeringAttachments &&
    meetsEngineeringComment &&
    (!rules.requireOrderInputsForEngineering || hasRequiredOrderInputs);
  const canAdvanceToProduction =
    meetsProductionChecklist &&
    meetsProductionAttachments &&
    meetsProductionComment &&
    (!rules.requireOrderInputsForProduction || hasRequiredOrderInputs);
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
  const orderInputGroups = useMemo(() => {
    const groups = new Map<string, OrderInputField[]>();
    activeOrderInputFields.forEach((field) => {
      const current = groups.get(field.groupKey) ?? [];
      current.push(field);
      groups.set(field.groupKey, current);
    });
    return groups;
  }, [activeOrderInputFields]);
  const canEditOrderInputs = hasPermission("orders.manage");
  const normalizeOrderInputValue = (field: OrderInputField, value: unknown) => {
    if (field.fieldType === "table") {
      return Array.isArray(value) ? value : [];
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
  };
  const shouldPersistOrderInputValue = (
    field: OrderInputField,
    value: unknown,
  ) => {
    const normalized = normalizeOrderInputValue(field, value);
    if (field.fieldType === "table") {
      const rows = normalized as Array<Record<string, unknown>>;
      return rows.some((row) =>
        Object.values(row).some((cell) => String(cell ?? "").trim().length > 0),
      );
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
  };
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
        return hasAnyValue ? next : null;
      })
      .filter((row): row is Record<string, unknown> => Boolean(row));
  };
  const isOrderInputsDirty = useMemo(
    () =>
      activeOrderInputFields.some((field) => {
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
    [activeOrderInputFields, orderInputInitialValues, orderInputValues],
  );
  if (!orderState && isLoadingOrder) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Loading order...</h1>
        <p className="text-sm text-muted-foreground">Fetching order details.</p>
      </section>
    );
  }

  if (!orderState) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Order not found</h1>
        <p className="text-sm text-muted-foreground">
          No order matches this ID.
        </p>
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
    requested: "Requested",
    ordered: "Ordered",
    in_progress: "In progress",
    delivered: "In Stock",
    approved: "Approved",
    cancelled: "Cancelled",
    ...rules.externalJobStatusLabels,
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
  const buildExternalTimeline = (job: ExternalJob) => {
    const events: Array<{ label: string; at: string }> = [
      { label: "Created", at: job.createdAt },
    ];
    if (job.partnerRequestSentAt) {
      events.push({ label: "Sent", at: job.partnerRequestSentAt });
    }
    if (job.partnerRequestViewedAt) {
      events.push({ label: "Viewed", at: job.partnerRequestViewedAt });
    }
    if (job.partnerResponseSubmittedAt) {
      events.push({ label: "Responded", at: job.partnerResponseSubmittedAt });
    }
    const confirmed = (job.statusHistory ?? []).find(
      (entry) => entry.status === "approved" || entry.status === "delivered",
    );
    if (confirmed) {
      events.push({ label: "Confirmed manually", at: confirmed.changedAt });
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
    const label = target?.name ? `Remove "${target.name}"?` : "Remove file?";
    if (!(await confirmRemove(label))) {
      return;
    }
    setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleAddAttachment() {
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
          const rawError = result.error ?? "Upload failed.";
          if (rawError.toLowerCase().includes("mime type")) {
            setAttachmentError(
              "Upload blocked by bucket file type rules. Allow xlsx/xls/csv/pdf in Supabase Storage bucket settings.",
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
        setAttachmentNotice("Upload failed. Check Supabase bucket settings.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAddComment() {
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
        setOrderInputError("Failed to save order inputs.");
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
        setOrderInputError("Failed to clear order inputs.");
        setIsSavingOrderInputs(false);
        return;
      }
    }

    setOrderInputInitialValues({ ...orderInputValues });
    setOrderInputError("");
    setIsSavingOrderInputs(false);
  }

  async function handleParseTableFieldWithAi(field: OrderInputField) {
    if (field.fieldType !== "table") {
      return;
    }
    const attachmentId = tableImportAttachmentIds[field.id];
    if (!attachmentId) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]:
          "Choose a file from Files & Comments (Production documentation).",
      }));
      return;
    }
    if (!supabase) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: "Supabase is not configured.",
      }));
      return;
    }
    if (!canUseAiOrderInputImport) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: "AI import is available on Pro plan.",
      }));
      return;
    }
    const columns = field.columns ?? [];
    if (columns.length === 0) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: "Add table columns in settings before AI import.",
      }));
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: "Please sign in again.",
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
            ? "AI import is available on Pro plan."
            : (payload.error ?? "Failed to parse PDF.");
        setTableImportNotices((prev) => ({ ...prev, [field.id]: message }));
        return;
      }
      const normalizedRows = normalizeAiTableRows(payload.rows ?? [], columns);
      let totalRowsCount = normalizedRows.length;
      setOrderInputValues((prev) => {
        const existingRows = Array.isArray(prev[field.id])
          ? (prev[field.id] as Array<Record<string, unknown>>)
          : [];
        const nextRows = [...existingRows, ...normalizedRows];
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
            ? `AI added ${normalizedRows.length} row(s). Total rows: ${totalRowsCount}. AI-generated results may contain errors, so review and verify all values before saving.`
            : `No rows detected in PDF.${payload.parserModel ? ` Model: ${payload.parserModel}.` : ""}`,
      }));
      notify({
        title: normalizedRows.length > 0 ? "PDF parsed" : "No rows detected",
        description:
          normalizedRows.length > 0
            ? `Detected ${normalizedRows.length} row(s) for ${field.label}.`
            : "Check the selected PDF and table columns.",
        variant: normalizedRows.length > 0 ? "success" : "warning",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Parsing timed out. Try a smaller PDF or fewer columns."
          : "Failed to parse PDF.";
      setTableImportNotices((prev) => ({
        ...prev,
        [field.id]: message,
      }));
      notify({
        title: "PDF parse failed",
        description: message,
        variant: "error",
      });
    } finally {
      setIsParsingTableFieldId(null);
    }
  }

  function renderOrderInputField(field: OrderInputField) {
    const value = orderInputValues[field.id];
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
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
            />
            {label}
          </label>
          <div className="flex items-center gap-2">
            <input
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
          <input
            type="checkbox"
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
        <label
          key={field.id}
          className="flex flex-col gap-2 text-sm font-medium"
        >
          {label}
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
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select</SelectItem>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      );
    }

    if (field.fieldType === "table") {
      const columns = field.columns ?? [];
      const rows = Array.isArray(normalized) ? normalized : [];
      const parseMultiValue = (raw: string) =>
        raw
          .split(/[\/;]+/)
          .map((item) => item.trim())
          .filter(Boolean);
      const selectedAttachmentId = tableImportAttachmentIds[field.id] ?? "";
      const availableParseAttachments = productionDocumentationParseAttachments;
      const selectedAttachment = availableParseAttachments.find(
        (item) => item.id === selectedAttachmentId,
      );
      const aiButtonTooltipBasic =
        "Add with AI reads the selected Production documentation file and appends detected rows into this table. Available on Pro subscription.";
      const importNotice = tableImportNotices[field.id] ?? "";
      const isParsingThisField = isParsingTableFieldId === field.id;
      const selectedRows = tableRowSelections[field.id] ?? [];
      const allSelected =
        rows.length > 0 && selectedRows.length === rows.length;
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
        setOrderInputValues((prev) => {
          const nextRows = [...rows];
          const currentRow =
            typeof nextRows[rowIndex] === "object" && nextRows[rowIndex]
              ? { ...(nextRows[rowIndex] as Record<string, unknown>) }
              : {};
          currentRow[columnKey] = nextValue;
          nextRows[rowIndex] = currentRow;
          return { ...prev, [field.id]: nextRows };
        });
      };
      const addRow = () => {
        setOrderInputValues((prev) => ({
          ...prev,
          [field.id]: [...rows, {}],
        }));
      };
      const removeRow = async (rowIndex: number) => {
        if (
          !(await confirmRemove("Delete row?", "This will remove the row."))
        ) {
          return;
        }
        setOrderInputValues((prev) => ({
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
            "Delete selected rows?",
            `This will remove ${selectedRows.length} selected row(s).`,
          ))
        ) {
          return;
        }
        const removeSet = new Set(selectedRows);
        setOrderInputValues((prev) => ({
          ...prev,
          [field.id]: rows.filter((_, idx) => !removeSet.has(idx)),
        }));
        setTableRowSelections((prev) => ({ ...prev, [field.id]: [] }));
      };
      return (
        <div key={field.id} className="md:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">{label}</div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {canUseAiOrderInputImport && (
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
                      [field.id]: nextId ? "" : "Choose a PDF first.",
                    }));
                  }}
                  disabled={!canEditOrderInputs || isParsingThisField}
                >
                  <SelectTrigger className="h-9 w-[260px] max-w-full min-w-0">
                    <SelectValue
                      placeholder="Choose PDF/XLSX from Production documentation"
                      className="block max-w-[200px] truncate text-left"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Choose file</SelectItem>
                    {availableParseAttachments.map((attachment) => (
                      <SelectItem
                        key={attachment.id}
                        value={attachment.id}
                        className="max-w-[420px]"
                      >
                        {attachment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {canUseAiOrderInputImport ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleParseTableFieldWithAi(field)}
                  disabled={!canEditOrderInputs || isParsingThisField}
                >
                  {isParsingThisField ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-4 w-4 text-sky-500" />
                      Add with AI
                    </>
                  )}
                </Button>
              ) : (
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
                      Add with AI
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={removeSelectedRows}
                disabled={!canEditOrderInputs || selectedRows.length === 0}
              >
                Remove selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={addRow}
                disabled={!canEditOrderInputs}
              >
                Add row
              </Button>
            </div>
          </div>
          {importNotice && (
            <div className="text-xs text-muted-foreground">{importNotice}</div>
          )}
          {canUseAiOrderInputImport && selectedAttachment && (
            <div className="text-xs text-muted-foreground">
              Source: {selectedAttachment.name}
            </div>
          )}
          {canUseAiOrderInputImport &&
            availableParseAttachments.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No supported files (PDF/XLSX/XLS) found in Files & Comments
                category &quot;Production documentation&quot;.
              </div>
            )}
          {!canUseAiOrderInputImport && (
            <div className="text-xs text-muted-foreground">
              AI PDF import is available on Pro plan.
            </div>
          )}
          {canUseAiOrderInputImport && (
            <div className="text-xs text-amber-700">
              AI-generated results may contain errors. Always review and verify
              values before saving inputs.
            </div>
          )}
          {columns.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              No columns configured for this table field.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              {isParsingThisField && (
                <LoadingSpinner
                  className="justify-start border-b border-border px-3 py-2"
                  label="Adding rows with AI..."
                />
              )}
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} className="px-3 py-2 text-left">
                        {column.label}
                        {column.unit ? ` (${column.unit})` : ""}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>Actions</span>
                        <input
                          type="checkbox"
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
                        colSpan={columns.length + 1}
                        className="px-3 py-4 text-center text-xs text-muted-foreground"
                      >
                        No rows yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, rowIndex) => (
                      <tr
                        key={`row-${rowIndex}`}
                        className="border-t border-border"
                      >
                        {columns.map((column) => {
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
                              setOrderInputValues((prev) => {
                                const nextRows = [...rows];
                                const currentRow =
                                  typeof nextRows[rowIndex] === "object" &&
                                  nextRows[rowIndex]
                                    ? {
                                        ...(nextRows[rowIndex] as Record<
                                          string,
                                          unknown
                                        >),
                                      }
                                    : {};
                                currentRow[column.key] =
                                  maxSelect === 1 ? value : nextValues;
                                nextRows[rowIndex] = currentRow;
                                return { ...prev, [field.id]: nextRows };
                              });
                            };
                            const handleRemoveValue = (value: string) => {
                              const nextValues = currentValues.filter(
                                (item) => item !== value,
                              );
                              setOrderInputValues((prev) => {
                                const nextRows = [...rows];
                                const currentRow =
                                  typeof nextRows[rowIndex] === "object" &&
                                  nextRows[rowIndex]
                                    ? {
                                        ...(nextRows[rowIndex] as Record<
                                          string,
                                          unknown
                                        >),
                                      }
                                    : {};
                                currentRow[column.key] =
                                  maxSelect === 1
                                    ? (nextValues[0] ?? "")
                                    : nextValues;
                                nextRows[rowIndex] = currentRow;
                                return { ...prev, [field.id]: nextRows };
                              });
                            };
                            return (
                              <td key={column.key} className="px-3 py-2">
                                <Select
                                  value="__none__"
                                  disabled={!canEditOrderInputs || !canAddMore}
                                  onValueChange={(value) => {
                                    if (value === "__none__") return;
                                    handleAddValue(value);
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-full rounded-md">
                                    <SelectValue
                                      placeholder={
                                        canAddMore ? "Select" : "Max selected"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      {canAddMore ? "Select" : "Max selected"}
                                    </SelectItem>
                                    {(column.options ?? []).map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {currentValues.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {currentValues.map((chip) => (
                                      <button
                                        key={chip}
                                        type="button"
                                        onClick={() => handleRemoveValue(chip)}
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
                            <td key={column.key} className="px-3 py-2">
                              <input
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
                                className="h-9 w-full rounded-md border border-border bg-input-background px-2 text-sm"
                              />
                              {column.fieldType !== "number" &&
                                typeof cellValue === "string" &&
                                (() => {
                                  const chips = parseMultiValue(cellValue);
                                  if (chips.length <= 1) {
                                    return null;
                                  }
                                  return (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {chips.map((chip, chipIndex) => (
                                        <span
                                          key={`${chip}-${chipIndex}`}
                                          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                                        >
                                          {chip}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const nextRows = [...rows, row];
                                setOrderInputValues((prev) => ({
                                  ...prev,
                                  [field.id]: nextRows,
                                }));
                              }}
                              disabled={!canEditOrderInputs}
                            >
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeRow(rowIndex)}
                              disabled={!canEditOrderInputs}
                            >
                              Remove
                            </Button>
                            <input
                              type="checkbox"
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (field.fieldType === "date") {
      return (
        <DatePicker
          label={label}
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
        <label
          key={field.id}
          className="flex flex-col gap-2 text-sm font-medium"
        >
          {label}
          <textarea
            value={String(normalized ?? "")}
            disabled={!canEditOrderInputs}
            onChange={(event) =>
              setOrderInputValues((prev) => ({
                ...prev,
                [field.id]: event.target.value,
              }))
            }
            className="min-h-[80px] rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
          />
        </label>
      );
    }

    return (
      <label key={field.id} className="flex flex-col gap-2 text-sm font-medium">
        {label}
        <input
          type={field.fieldType === "number" ? "number" : "text"}
          value={String(normalized ?? "")}
          disabled={!canEditOrderInputs}
          onChange={(event) =>
            setOrderInputValues((prev) => ({
              ...prev,
              [field.id]: event.target.value,
            }))
          }
          className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
        />
      </label>
    );
  }

  async function handleRemoveAttachment(attachmentId: string) {
    const target = attachments.find(
      (attachment) => attachment.id === attachmentId,
    );
    const targetLabel = target?.name ?? "attachment";
    if (
      !(await confirmRemove(
        "Delete attachment?",
        `This will remove "${targetLabel}".`,
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
    }
  }

  async function handleRemoveComment(commentId: string) {
    if (
      !(await confirmRemove(
        "Delete comment?",
        "This will permanently remove the comment.",
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
    const isPortalMode = externalRequestMode === "partner_portal";
    if (isPortalMode && !canSendExternalJobToPartner) {
      setExternalError("Send to partner is available on Pro plan.");
      return;
    }
    if (!externalPartnerId) {
      setExternalError("Partner is required.");
      return;
    }
    const partner = activePartners.find(
      (item) => item.id === externalPartnerId,
    );
    if (!partner) {
      setExternalError("Select a valid partner.");
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
        setExternalError(`"${missingRequired.label}" is required.`);
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
              upload.error ?? "Failed to upload partner request files.",
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
        await handleSendToPartner(created.id);
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
      setExternalError("Supabase is not configured.");
      return;
    }
    if (!canSendExternalJobToPartner) {
      setExternalError("Send to partner is available on Pro plan.");
      return;
    }
    setExternalError("");
    setSendingToPartnerJobId(externalJobId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setSendingToPartnerJobId(null);
      setExternalError("Please sign in again.");
      return;
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
        setExternalError("This feature is available on Pro plan.");
      } else {
        setExternalError(payload.error ?? "Failed to send to partner.");
      }
      setSendingToPartnerJobId(null);
      return;
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
      title: "Request sent to partner",
      description: payload.expiresAt
        ? `Secure link expires ${formatDateTime(payload.expiresAt)}`
        : undefined,
      variant: "success",
    });
    setSendingToPartnerJobId(null);
  }

  async function handleExternalStatusChange(
    externalJobId: string,
    status: ExternalJobStatus,
  ) {
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
        "Delete external job?",
        "This will remove the external job from the order.",
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
    const job = orderState.externalJobs?.find(
      (item) => item.id === externalJobId,
    );
    const attachment = job?.attachments?.find(
      (item) => item.id === attachmentId,
    );
    const label = attachment?.name ?? "attachment";
    if (
      !(await confirmRemove(
        "Delete attachment?",
        `This will remove "${label}".`,
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
  }

  async function handleReturnToQueue() {
    if (!orderState) {
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
      assignedEngineerId: null,
      assignedEngineerName: null,
      assignedEngineerAt: null,
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
    const now = new Date().toISOString();
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
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
      status: nextStatus,
      statusChangedBy: name,
      statusChangedByRole: role,
      statusChangedAt: now,
    });
  }

  async function handleAssignEngineer() {
    if (!orderState || !selectedEngineerId) {
      return;
    }
    const engineer = engineers.find((item) => item.id === selectedEngineerId);
    const now = new Date().toISOString();
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            assignedEngineerId: selectedEngineerId,
            assignedEngineerName: engineer?.name ?? prev.assignedEngineerName,
            assignedEngineerAt: now,
          }
        : prev,
    );
    await updateOrder(orderState.id, {
      assignedEngineerId: selectedEngineerId,
      assignedEngineerName: engineer?.name ?? orderState.assignedEngineerName,
      assignedEngineerAt: now,
    });
  }

  async function handleClearEngineer() {
    if (!orderState) {
      return;
    }
    setSelectedEngineerId("");
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            assignedEngineerId: undefined,
            assignedEngineerName: undefined,
            assignedEngineerAt: undefined,
          }
        : prev,
    );
    await updateOrder(orderState.id, {
      assignedEngineerId: "",
      assignedEngineerName: "",
      assignedEngineerAt: "",
    });
  }

  async function handleAssignManager() {
    if (!orderState || !selectedManagerId) {
      return;
    }
    const manager = managers.find((item) => item.id === selectedManagerId);
    const now = new Date().toISOString();
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            assignedManagerId: selectedManagerId,
            assignedManagerName: manager?.name ?? prev.assignedManagerName,
            assignedManagerAt: now,
          }
        : prev,
    );
    await updateOrder(orderState.id, {
      assignedManagerId: selectedManagerId,
      assignedManagerName: manager?.name ?? orderState.assignedManagerName,
      assignedManagerAt: now,
    });
  }

  async function handleClearManager() {
    if (!orderState) {
      return;
    }
    setSelectedManagerId("");
    setOrderState((prev) =>
      prev
        ? {
            ...prev,
            assignedManagerId: undefined,
            assignedManagerName: undefined,
            assignedManagerAt: undefined,
          }
        : prev,
    );
    await updateOrder(orderState.id, {
      assignedManagerId: "",
      assignedManagerName: "",
      assignedManagerAt: "",
    });
  }

  async function handleChecklistToggle(id: string, checked: boolean) {
    const next = { ...checklistState, [id]: checked };
    setChecklistState(next);
    setOrderState((prev) => (prev ? { ...prev, checklist: next } : prev));
    await updateOrder(orderState.id, { checklist: next });
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
        <img
          src={resolvedUrl}
          alt={attachment.name}
          className="h-12 w-12 rounded-md object-cover"
        />
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
    <section className="space-y-0 pt-16 md:space-y-4 md:pt-0">
      <div className="pointer-events-none fixed right-4 top-3 z-40 md:hidden">
        <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
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

      <div className="fixed bottom-[calc(6.75rem+env(safe-area-inset-bottom))] left-4 z-40 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg disabled:opacity-100"
          onClick={() => setIsEditOpen(true)}
          aria-label="Edit order"
          disabled={!canEditOrderRecord}
        >
          <PencilIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="fixed bottom-[calc(6.75rem+env(safe-area-inset-bottom))] right-4 z-40 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg"
          onClick={() => setIsMobileSectionsOpen(true)}
          aria-label="Open order sections"
          aria-haspopup="dialog"
          aria-expanded={isMobileSectionsOpen}
          aria-controls="order-sections-drawer"
        >
          <PanelRightIcon className="h-4 w-4" />
        </Button>
      </div>

      <MobilePageTitle
        title={orderState.orderNumber}
        showCompact={showCompactMobileTitle}
        subtitle={orderState.customerName}
        compactTitle={`${orderState.orderNumber} - ${orderState.customerName}`}
        className="pt-6 pb-6"
      />

      <BottomSheet
        id="order-sections-drawer"
        open={isMobileSectionsOpen}
        onClose={() => setIsMobileSectionsOpen(false)}
        ariaLabel="Order sections"
        closeButtonLabel="Close order sections"
        title="Order sections"
        enableSwipeToClose
        panelClassName="flex max-h-[78dvh] flex-col pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {[
              { value: "overview", label: "Overview" },
              { value: "files", label: "Files & Comments" },
              { value: "details", label: "Order details" },
              { value: "workflow", label: "Workflow" },
              { value: "external", label: "External Jobs" },
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
                  {isActive ? <span className="text-xs">Active</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <div
          className={`desktop-sticky-bleed sticky top-16 z-20 hidden w-full bg-background/90 pb-3 pt-2 backdrop-blur md:block ${
            showDesktopStickyShadow
              ? "desktop-sticky-bleed-shadow"
              : "desktop-sticky-bleed-no-shadow"
          }`}
        >
          <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <div className="pl-6 mr-6">
              <h1 className="text-xl font-semibold">
                {orderState.orderNumber}
              </h1>
              <p className="text-sm text-muted-foreground">
                {orderState.customerName}
              </p>
            </div>
            <div className="flex flex-nowrap py-1 items-center gap-2 overflow-x-auto">
              <Link
                href="/orders"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-(--tabs-border) bg-(--tabs-bg) px-3 text-sm font-medium text-(--tabs-text) shadow-sm transition hover:text-(--tabs-hover-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tabs-ring)"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </Link>
              <TabsList className="min-w-max h-9 shadow-sm **:data-[slot=tabs-trigger]:h-7 **:data-[slot=tabs-trigger]:py-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="files">Files & Comments</TabsTrigger>
                <TabsTrigger value="details">Order details</TabsTrigger>
                <TabsTrigger value="workflow">Workflow</TabsTrigger>
                <TabsTrigger value="external">External Jobs</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Badge variant={priorityVariant}>{orderState.priority}</Badge>
              <Badge variant={statusVariant}>
                {statusLabel(displayStatus)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setIsEditOpen(true)}
                disabled={!canEditOrderRecord}
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-1 md:hidden">
          <Badge variant={priorityVariant}>{orderState.priority}</Badge>
          <Badge variant={statusVariant}>{statusLabel(displayStatus)}</Badge>
        </div>

        <TabsContent value="overview">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">
                      Schedule
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-muted-foreground">Due date</span>
                      <span className="font-medium">
                        {formatDate(orderState.dueDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium">
                        {orderState.quantity ?? "--"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-muted-foreground">
                        Production time
                      </span>
                      <span className="font-medium">
                        {orderState.productionDurationMinutes != null
                          ? formatDuration(orderState.productionDurationMinutes)
                          : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">
                      Hierarchy
                    </div>
                    {activeLevels.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                        No hierarchy levels configured.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeLevels.map((level) => {
                          const valueId = orderState.hierarchy?.[level.id];
                          const valueLabel = valueId
                            ? (nodeLabelMap.get(valueId) ?? valueId)
                            : "--";
                          return (
                            <div
                              key={level.id}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                            >
                              <span className="text-muted-foreground">
                                {level.name}
                              </span>
                              <span className="font-medium">{valueLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order inputs</CardTitle>
                <CardDescription>
                  Sales notes and production scope details.
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
                      No order inputs configured
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Order inputs are used to capture sales details and
                      production scope for each order.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Configure fields in Settings -&gt; Structure -&gt; Order
                      inputs, then return here.
                    </p>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/settings?tab=structure">
                          Open settings
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Array.from(orderInputGroups.entries()).map(
                      ([groupKey, fields]) => (
                        <div key={groupKey} className="space-y-3">
                          <div className="text-sm font-semibold">
                            {groupKey === "production_scope"
                              ? "Production scope"
                              : "Order info"}
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
                )}
                <div className="flex items-center justify-between gap-3">
                  {!canEditOrderInputs && (
                    <span className="text-xs text-muted-foreground">
                      Only Sales and Admin can edit these fields.
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
                    {isSavingOrderInputs ? "Saving..." : "Save inputs"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workflow">
          <div className="space-y-6">
            <div
              className={`grid gap-6 ${
                activeChecklistItems.length > 0
                  ? "lg:grid-cols-[minmax(0,1fr)_360px]"
                  : "lg:grid-cols-1"
              }`}
            >
              <Card className="lg:sticky lg:top-6">
                <CardHeader>
                  <CardTitle>Workflow</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={priorityVariant}>
                      {orderState.priority}
                    </Badge>
                    <Badge variant={statusVariant}>
                      {statusLabel(displayStatus)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canSendToEngineering && (
                      <Button
                        size="sm"
                        disabled={!canAdvanceToEngineering}
                        onClick={() =>
                          handleStatusChange("ready_for_engineering")
                        }
                      >
                        Send to engineering
                      </Button>
                    )}
                    {canStartEngineering && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange("in_engineering")}
                      >
                        Start engineering
                      </Button>
                    )}
                    {canBlockEngineering && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleStatusChange("engineering_blocked")
                        }
                      >
                        Block engineering
                      </Button>
                    )}
                    {canSendToProduction && (
                      <Button
                        size="sm"
                        disabled={!canAdvanceToProduction}
                        onClick={() =>
                          handleStatusChange("ready_for_production")
                        }
                      >
                        {statusLabel("ready_for_production")}
                      </Button>
                    )}
                    {canSendBack && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsReturnOpen(true)}
                      >
                        Send back
                      </Button>
                    )}
                    {canTakeOrder && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTakeOrder}
                      >
                        Take order
                      </Button>
                    )}
                    {canReturnToQueue && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReturnToQueue}
                      >
                        Return to queue
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-muted-foreground">
                    {orderState.assignedManagerName && (
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                          {getInitials(orderState.assignedManagerName)}
                        </div>
                        <span>
                          {managerLabel}: {orderState.assignedManagerName}
                        </span>
                      </div>
                    )}
                    {canAssignManager && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={selectedManagerId || "__none__"}
                          onValueChange={(value) =>
                            setSelectedManagerId(
                              value === "__none__" ? "" : value,
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[220px] rounded-md text-xs">
                            <SelectValue
                              placeholder={`Assign ${managerLabel.toLowerCase()}...`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              Assign {managerLabel.toLowerCase()}...
                            </SelectItem>
                            {managers
                              .filter((manager) => manager.id)
                              .map((manager) => (
                                <SelectItem key={manager.id} value={manager.id}>
                                  {manager.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAssignManager}
                          disabled={!selectedManagerId}
                        >
                          Assign
                        </Button>
                        {orderState.assignedManagerId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearManager}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    )}
                    {orderState.assignedEngineerName && (
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                          {getInitials(orderState.assignedEngineerName)}
                        </div>
                        <span>
                          {engineerLabel}: {orderState.assignedEngineerName}
                        </span>
                      </div>
                    )}
                    {canAssignEngineer && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={selectedEngineerId || "__none__"}
                          onValueChange={(value) =>
                            setSelectedEngineerId(
                              value === "__none__" ? "" : value,
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[220px] rounded-md text-xs">
                            <SelectValue
                              placeholder={`Assign ${engineerLabel.toLowerCase()}...`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              Assign {engineerLabel.toLowerCase()}...
                            </SelectItem>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAssignEngineer}
                          disabled={!selectedEngineerId}
                        >
                          Assign
                        </Button>
                        {orderState.assignedEngineerId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearEngineer}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    )}
                    {orderState.statusChangedAt && (
                      <div>
                        Status updated{" "}
                        {orderState.statusChangedBy
                          ? `by ${orderState.statusChangedBy}`
                          : ""}
                        {orderState.statusChangedByRole
                          ? ` (${orderState.statusChangedByRole})`
                          : ""}
                        {` on ${formatDate(orderState.statusChangedAt.slice(0, 10))}`}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              {activeChecklistItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Preparation Checklist</CardTitle>
                      <div className="text-xs text-muted-foreground">
                        {checklistDoneCount}/{activeChecklistItems.length}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {activeChecklistItems.length === 0 ? (
                      <p className="text-muted-foreground">
                        No checklist items configured.
                      </p>
                    ) : (
                      activeChecklistItems.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                        >
                          <span className="font-medium">{item.label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(checklistState[item.id])}
                            onChange={(event) =>
                              handleChecklistToggle(
                                item.id,
                                event.target.checked,
                              )
                            }
                          />
                        </label>
                      ))
                    )}
                    {canSendToEngineering && !canAdvanceToEngineering && (
                      <p className="text-xs text-muted-foreground">
                        Complete required attachments, comments, and checklist
                        items
                        {rules.requireOrderInputsForEngineering
                          ? ", and required order inputs"
                          : ""}{" "}
                        before sending to engineering.
                      </p>
                    )}
                    {canSendToProduction && !canAdvanceToProduction && (
                      <p className="text-xs text-muted-foreground">
                        Complete required attachments, comments, and checklist
                        items
                        {rules.requireOrderInputsForProduction
                          ? ", and required order inputs"
                          : ""}{" "}
                        before sending to production.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Status History</CardTitle>
                  {statusHistory.length > 5 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAllHistory((prev) => !prev)}
                    >
                      {showAllHistory ? "Show recent" : "Show all"}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {statusHistory.length > 0 ? (
                  <div className="space-y-4">
                    {visibleStatusHistory.map((entry, index) => (
                      <div key={entry.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                          {index < visibleStatusHistory.length - 1 && (
                            <div className="mt-1 h-full w-px bg-border" />
                          )}
                        </div>
                        <div className="flex-1 rounded-md border border-border px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant={`status-${entry.status}`}>
                              {statusLabel(entry.status)}
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(entry.changedAt.slice(0, 10))}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {entry.changedBy}
                            {entry.changedByRole
                              ? ` (${entry.changedByRole})`
                              : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : orderState.statusChangedAt ? (
                  <div className="rounded-md border border-border px-3 py-2">
                    <div className="font-medium">
                      {statusLabel(orderState.status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {orderState.statusChangedBy ?? "Unknown"}
                      {orderState.statusChangedByRole
                        ? ` (${orderState.statusChangedByRole})`
                        : ""}
                      {` on ${formatDate(orderState.statusChangedAt.slice(0, 10))}`}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No status changes yet.
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
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <label className="space-y-2 text-sm font-medium">
                  Category
                  <Select
                    value={attachmentCategory}
                    onValueChange={(value) => {
                      setAttachmentCategory(value);
                      setIsAttachmentCategoryManual(true);
                    }}
                  >
                    <SelectTrigger className="h-10 w-full">
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
                  <span className="text-xs text-muted-foreground">
                    Pick the best bucket before uploading files.
                  </span>
                </label>
                <div className="space-y-2">
                  <div
                    className="flex min-h-[86px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
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
                    <ImageIcon className="h-5 w-5" />
                    <span>Drag files here or click to upload</span>
                    <input
                      id="attachment-file-input"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        if (event.target.files) {
                          handleFilesAdded(event.target.files);
                        }
                        event.target.value = "";
                      }}
                    />
                    <span className="text-[11px]">
                      Max {MAX_FILE_SIZE_MB}MB per file
                    </span>
                  </div>
                  {attachmentError && (
                    <p className="text-xs text-destructive">
                      {attachmentError}
                    </p>
                  )}
                  {attachmentNotice && (
                    <p className="text-xs text-muted-foreground">
                      {attachmentNotice}
                    </p>
                  )}
                </div>

                {attachmentFiles.length > 0 && (
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {attachmentFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                      >
                        <span>{file.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePendingFile(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAddAttachment}
                        disabled={isUploading}
                      >
                        {isUploading ? "Uploading..." : "Upload"}
                      </Button>
                    </div>
                  </div>
                )}

                {attachments.length === 0 ? (
                  <p className="text-muted-foreground">
                    No attachments added yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {attachmentGroups.map((group) => (
                      <div key={group.key} className="space-y-2">
                        <div className="text-xs font-semibold text-muted-foreground">
                          {group.label}
                        </div>
                        {group.items.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              {renderAttachmentPreview(
                                attachment,
                                resolveAttachmentUrl(attachment),
                              )}
                              <div>
                                <div className="font-medium">
                                  {attachment.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Added by {attachment.addedBy}
                                  {attachment.addedByRole
                                    ? ` (${attachment.addedByRole})`
                                    : ""}{" "}
                                  on{" "}
                                  {formatDate(
                                    attachment.createdAt.slice(0, 10),
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {resolveAttachmentUrl(attachment) && (
                                <a
                                  href={resolveAttachmentUrl(attachment)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary underline"
                                >
                                  Open
                                </a>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleRemoveAttachment(attachment.id)
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <textarea
                    value={commentMessage}
                    onChange={(event) => setCommentMessage(event.target.value)}
                    className="min-h-[90px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
                    placeholder="Add a note for the next role..."
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleAddComment}>Add comment</Button>
                  </div>
                </div>
                {comments.length === 0 ? (
                  <p className="text-muted-foreground">No comments yet.</p>
                ) : (
                  <div className="space-y-2">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <div className="text-xs text-muted-foreground">
                          {comment.author}
                          {comment.authorRole
                            ? ` (${comment.authorRole})`
                            : ""}{" "}
                          - {formatDate(comment.createdAt.slice(0, 10))}
                        </div>
                        <div className="mt-1">{comment.message}</div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveComment(comment.id)}
                          >
                            Remove
                          </Button>
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
                <CardTitle>External Jobs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Request mode</div>
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
                      <div className="font-medium">Manual entry</div>
                      <div className="text-xs text-muted-foreground">
                        Partner replies by email, data is entered manually.
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
                      <div className="font-medium">Send via partner portal</div>
                      <div className="text-xs text-muted-foreground">
                        Secure link + structured response form.
                      </div>
                      {!canSendExternalJobToPartner ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Available on Pro.
                        </div>
                      ) : null}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    Partner group
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
                        <SelectItem value="__all__">All groups</SelectItem>
                        {activeGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Partner
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
                        <SelectItem value="__none__">Select partner</SelectItem>
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
                  </label>
                </div>
                {externalRequestMode === "manual" ? (
                  manualExternalJobFields.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid gap-3 lg:grid-cols-2">
                        {manualExternalJobFields.map((field) => {
                          const rawValue = externalJobFieldValues[field.id];
                          if (field.fieldType === "toggle") {
                            return (
                              <label
                                key={field.id}
                                className="flex h-10 items-center gap-2 rounded-lg border border-border bg-input-background px-3 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={rawValue === true}
                                  onChange={(event) =>
                                    setExternalJobFieldValues((prev) => ({
                                      ...prev,
                                      [field.id]: event.target.checked,
                                    }))
                                  }
                                />
                                <span>
                                  {field.label}
                                  {field.isRequired ? " *" : ""}
                                </span>
                              </label>
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
                              <label
                                key={field.id}
                                className="space-y-2 text-sm font-medium"
                              >
                                {field.label}
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
                                      Select value
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
                              </label>
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
                              <label
                                key={field.id}
                                className="space-y-2 text-sm font-medium"
                              >
                                {field.label}
                                <textarea
                                  value={
                                    typeof rawValue === "string" ? rawValue : ""
                                  }
                                  onChange={(event) =>
                                    setExternalJobFieldValues((prev) => ({
                                      ...prev,
                                      [field.id]: event.target.value,
                                    }))
                                  }
                                  className="min-h-[80px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
                                />
                              </label>
                            );
                          }
                          return (
                            <label
                              key={field.id}
                              className="space-y-2 text-sm font-medium"
                            >
                              {field.label}
                              <input
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
                                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
                      <p className="text-sm font-medium">
                        No external job fields configured
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        External Jobs is used to track outsourced work with
                        partners: order details, deadlines, pricing, and
                        delivery notes.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Configure fields in Settings -&gt; Partners -&gt;
                        External job schema, then return here.
                      </p>
                      <div className="mt-3">
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/settings?tab=partners">
                            Open settings
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 px-4 py-3">
                    <label className="space-y-2 text-sm font-medium">
                      Comment for partner (optional)
                      <textarea
                        value={externalPortalComment}
                        onChange={(event) =>
                          setExternalPortalComment(event.target.value)
                        }
                        placeholder="Add request note for partner..."
                        className="min-h-[90px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        Files for partner (optional)
                      </div>
                      <input
                        type="file"
                        multiple
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
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No files selected.
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
                    ? "includes Send to partner."
                    : "supports manual entry only. Send to partner is available on Pro."}
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleAddExternalJob}>
                    {externalRequestMode === "partner_portal"
                      ? "Create portal request"
                      : "Add external job"}
                  </Button>
                </div>

                {visibleExternalJobs.length === 0 ? (
                  <p className="text-muted-foreground">
                    No external jobs added yet.
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
                                  Request note: {job.partnerRequestComment}
                                </div>
                              ) : null}
                              {job.partnerResponseNote ? (
                                <div className="text-xs text-muted-foreground">
                                  Note: {job.partnerResponseNote}
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
                                            ? job.unitPrice
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
                                    ? "Sending..."
                                    : job.requestMode === "partner_portal"
                                      ? "Resend request"
                                      : job.partnerRequestSentAt
                                        ? "Resend request"
                                        : "Send to partner"}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Manual entry (Basic)
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
                                <SelectTrigger className="h-8 w-[160px] rounded-md text-xs">
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
                                Remove
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                Attachments
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  id={`external-files-${job.id}`}
                                  type="file"
                                  multiple
                                  className="hidden"
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
                                  Add files
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
                                    ? "Uploading..."
                                    : "Upload"}
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
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(job.attachments ?? []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No files uploaded yet.
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
                                          Open
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
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              Status history
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
                                      ? "Show less"
                                      : `Show all (${job.statusHistory.length})`}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                No status updates yet.
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

      <OrderModal
        open={isEditOpen && canEditOrderRecord}
        onClose={() => setIsEditOpen(false)}
        onSubmit={async (values) => {
          if (!canEditOrderRecord) {
            return;
          }
          setOrderState((prev) =>
            prev
              ? {
                  ...prev,
                  customerName: values.customerName,
                  productName: values.productName,
                  quantity: values.quantity,
                  hierarchy: values.hierarchy,
                  dueDate: values.dueDate,
                  priority: values.priority,
                }
              : prev,
          );
          await updateOrder(orderState.id, {
            customerName: values.customerName,
            productName: values.productName,
            quantity: values.quantity,
            hierarchy: values.hierarchy,
            dueDate: values.dueDate,
            priority: values.priority,
          });
        }}
        title="Edit Order"
        submitLabel="Save Changes"
        editMode="full"
        initialValues={{
          orderNumber: orderState.orderNumber,
          customerName: orderState.customerName,
          productName: orderState.productName ?? "",
          quantity: orderState.quantity ?? 1,
          dueDate: orderState.dueDate,
          priority: orderState.priority,
          hierarchy: orderState.hierarchy,
        }}
      />

      {isReturnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Send order back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a reason and add a note. The order will return to{" "}
              {statusLabel(returnTargetStatus)}.
            </p>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm font-medium">
                Reason
                <Select
                  value={returnReason || "__none__"}
                  onValueChange={(value) =>
                    setReturnReason(value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select reason</SelectItem>
                    {rules.returnReasons
                      .filter((reason) => reason.trim() !== "")
                      .map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Comment
                <textarea
                  value={returnNote}
                  onChange={(event) => setReturnNote(event.target.value)}
                  className="min-h-[90px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
                  placeholder="Add context for the previous role..."
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsReturnOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const trimmedNote = returnNote.trim();
                  if (!returnReason && !trimmedNote) {
                    return;
                  }
                  const reasonLabel = returnReason || "No reason selected";
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
                Send back
              </Button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </section>
  );
}
