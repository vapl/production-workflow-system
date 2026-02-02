"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/Tabs";
import { formatDate, formatOrderStatus } from "@/lib/domain/formatters";
import type { Batch } from "@/types/batch";
import type {
  ExternalJobAttachment,
  ExternalJobStatus,
  OrderAttachment,
  OrderComment,
  OrderStatus,
} from "@/types/orders";
import Link from "next/link";
import {
  ArrowLeftIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PencilIcon,
} from "lucide-react";
import { OrderModal } from "@/app/orders/components/OrderModal";
import { useOrders } from "@/app/orders/OrdersContext";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { useBatches } from "@/contexts/BatchesContext";
import { uploadOrderAttachment } from "@/lib/uploadOrderAttachment";
import { uploadExternalJobAttachment } from "@/lib/uploadExternalJobAttachment";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { usePartners } from "@/hooks/usePartners";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const defaultAttachmentCategories = [
  { id: "order_documents", label: "Order documents" },
  { id: "technical_docs", label: "Technical documentation" },
  { id: "photos", label: "Site photos" },
  { id: "other", label: "Other" },
];

export default function OrderDetailPage() {
  const params = useParams<{ orderId?: string }>();
  const normalizeId = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

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
  const { batches } = useBatches();
  const { levels, nodes } = useHierarchy();
  const { role, isAdmin, name, id: userId, tenantId } = useCurrentUser();
  const { rules } = useWorkflowRules();
  const { activePartners, activeGroups } = usePartners();
  const engineerLabel = rules.assignmentLabels?.engineer ?? "Engineer";
  const managerLabel = rules.assignmentLabels?.manager ?? "Manager";
  const attachmentCategories = useMemo(
    () =>
      rules.attachmentCategories && rules.attachmentCategories.length > 0
        ? rules.attachmentCategories
        : defaultAttachmentCategories,
    [rules.attachmentCategories],
  );
  const attachmentCategoryLabels = useMemo(
    () =>
      attachmentCategories.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.label;
        return acc;
      }, {}),
    [attachmentCategories],
  );
  const defaultAttachmentRole = isAdmin ? "Admin" : role;
  const defaultAttachmentCategory =
    rules.attachmentCategoryDefaults?.[defaultAttachmentRole] ??
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentCategory, setAttachmentCategory] =
    useState<string>(defaultAttachmentCategory);
  const [isAttachmentCategoryManual, setIsAttachmentCategoryManual] =
    useState(false);
  const [commentMessage, setCommentMessage] = useState("");
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [engineers, setEngineers] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [checklistState, setChecklistState] = useState<
    Record<string, boolean>
  >({});
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [externalPartnerId, setExternalPartnerId] = useState("");
  const [externalPartnerGroupId, setExternalPartnerGroupId] = useState("");
  const [externalOrderNumber, setExternalOrderNumber] = useState("");
  const [externalQuantity, setExternalQuantity] = useState("");
  const [externalDueDate, setExternalDueDate] = useState("");
  const [externalStatus, setExternalStatus] =
    useState<ExternalJobStatus>("requested");
  const [externalError, setExternalError] = useState("");
  const [externalJobFiles, setExternalJobFiles] = useState<
    Record<string, File[]>
  >({});
  const [externalJobUpload, setExternalJobUpload] = useState<
    Record<string, { isUploading: boolean; error?: string }>
  >({});
  const [expandedExternalHistory, setExpandedExternalHistory] = useState<
    Record<string, boolean>
  >({});
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<
    Record<string, string>
  >({});
  const [signedExternalAttachmentUrls, setSignedExternalAttachmentUrls] =
    useState<Record<string, string>>({});

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
  const canAssignManager = role === "Sales" || isAdmin;
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

  const activeChecklistItems = rules.checklistItems.filter(
    (item) => item.isActive,
  );
  const requiredForEngineering = activeChecklistItems.filter((item) =>
    item.requiredFor.includes("ready_for_engineering"),
  );
  const requiredForProduction = activeChecklistItems.filter((item) =>
    item.requiredFor.includes("ready_for_production"),
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
  const comments = orderState?.comments ?? [];
  useEffect(() => {
    if (!supabase) {
      return;
    }
    const pending = attachments.filter(
      (attachment) =>
        attachment.url && !signedAttachmentUrls[attachment.id],
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
  const canAdvanceToEngineering =
    meetsEngineeringChecklist &&
    meetsEngineeringAttachments &&
    meetsEngineeringComment;
  const canAdvanceToProduction =
    meetsProductionChecklist &&
    meetsProductionAttachments &&
    meetsProductionComment;

  if (!orderState && isLoadingOrder) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Loading order...</h1>
        <p className="text-sm text-muted-foreground">
          Fetching order details.
        </p>
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

  const batchesForOrder: Batch[] = batches.filter(
    (batch) => batch.orderId === orderState.id,
  );
  const priorityVariant =
    orderState.priority === "low"
      ? "priority-low"
      : orderState.priority === "high"
        ? "priority-high"
        : orderState.priority === "urgent"
          ? "priority-urgent"
          : "priority-normal";
  const statusVariant =
    orderState.status === "draft"
      ? "status-draft"
      : orderState.status === "ready_for_engineering"
        ? "status-ready_for_engineering"
        : orderState.status === "in_engineering"
          ? "status-in_engineering"
          : orderState.status === "engineering_blocked"
            ? "status-engineering_blocked"
            : "status-ready_for_production";
  const externalJobStatusLabels: Record<ExternalJobStatus, string> = {
    requested: "Requested",
    ordered: "Ordered",
    in_progress: "In progress",
    delivered: "Delivered",
    approved: "Approved",
    cancelled: "Cancelled",
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

  function handleRemovePendingFile(index: number) {
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
          setAttachmentError(result.error ?? "Upload failed.");
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

  async function handleRemoveAttachment(attachmentId: string) {
    const target = attachments.find((attachment) => attachment.id === attachmentId);
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
    const removed = await removeOrderComment(orderState.id, commentId);
    if (removed) {
      const nextComments = comments.filter((comment) => comment.id !== commentId);
      setOrderState((prev) =>
        prev ? { ...prev, comments: nextComments } : prev,
      );
    }
  }

  async function handleAddExternalJob() {
    const trimmedOrderNumber = externalOrderNumber.trim();
    if (!externalPartnerId || !trimmedOrderNumber || !externalDueDate) {
      setExternalError("Partner, order number, and due date are required.");
      return;
    }
    const partner = activePartners.find((item) => item.id === externalPartnerId);
    if (!partner) {
      setExternalError("Select a valid partner.");
      return;
    }
    setExternalError("");
    const created = await addExternalJob(orderState.id, {
      partnerId: partner.id,
      partnerName: partner.name,
      externalOrderNumber: trimmedOrderNumber,
      quantity: externalQuantity ? Number(externalQuantity) : undefined,
      dueDate: externalDueDate,
      status: externalStatus,
    });
    if (created) {
      setOrderState((prev) =>
        prev
          ? {
              ...prev,
              externalJobs: [created, ...(prev.externalJobs ?? [])],
            }
          : prev,
      );
      setExternalPartnerId("");
      setExternalPartnerGroupId("");
      setExternalOrderNumber("");
      setExternalQuantity("");
      setExternalDueDate("");
      setExternalStatus("requested");
    }
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
    const removed = await removeExternalJob(externalJobId);
    if (removed) {
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
                        attachments: [
                          created,
                          ...(job.attachments ?? []),
                        ],
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
      | "ready_for_production",
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

  const nextGate =
    orderState.status === "draft"
      ? "engineering"
      : orderState.status === "in_engineering"
        ? "production"
        : null;
  const nextChecklistItems =
    nextGate === "engineering"
      ? requiredForEngineering
      : nextGate === "production"
        ? requiredForProduction
        : [];
  const nextChecklistDone = nextChecklistItems.filter(
    (item) => checklistState[item.id],
  ).length;
  const nextChecklistTotal = nextChecklistItems.length;
  const nextMinAttachments =
    nextGate === "engineering"
      ? rules.minAttachmentsForEngineering
      : nextGate === "production"
        ? rules.minAttachmentsForProduction
        : 0;
  const nextRequireComment =
    nextGate === "engineering"
      ? rules.requireCommentForEngineering
      : nextGate === "production"
        ? rules.requireCommentForProduction
        : false;

  return (
    <section className="space-y-6">
      <Tabs defaultValue="overview" className="gap-4">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          <Link
            href="/orders"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--tabs-border)] bg-[var(--tabs-bg)] px-3 text-sm font-medium text-[var(--tabs-text)] shadow-sm transition hover:text-[var(--tabs-hover-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tabs-ring)]"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Orders
          </Link>
          <TabsList className="min-w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="files">Files & Comments</TabsTrigger>
            <TabsTrigger value="external">External Jobs</TabsTrigger>
            <TabsTrigger value="production">Production</TabsTrigger>
          </TabsList>
        </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{orderState.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {orderState.customerName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={priorityVariant}>{orderState.priority}</Badge>
          <Badge variant={statusVariant}>
            {statusLabel(orderState.status)}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setIsEditOpen(true)}
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

        <TabsContent value="overview">
          <div className="space-y-6">
            <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due date</span>
                <span>{formatDate(orderState.dueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span>{orderState.quantity ?? "--"}</span>
              </div>
            </CardContent>
            </Card>
            <Card>
            <CardHeader>
              <CardTitle>Hierarchy Details</CardTitle>
            </CardHeader>
            <CardContent>
              {activeLevels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hierarchy levels configured.
                </p>
              ) : (
                <div className="grid gap-2 text-sm">
                  {activeLevels.map((level) => {
                    const valueId = orderState.hierarchy?.[level.id];
                    const valueLabel = valueId
                      ? nodeLabelMap.get(valueId) ?? valueId
                      : "--";
                    return (
                      <div
                        key={level.id}
                        className="flex items-center justify-between"
                      >
                        <span className="text-muted-foreground">{level.name}</span>
                        <span className="font-medium">{valueLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workflow">
          <div className="space-y-6">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={priorityVariant}>{orderState.priority}</Badge>
                <Badge variant={statusVariant}>
                  {statusLabel(orderState.status)}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canSendToEngineering && (
                  <Button
                    size="sm"
                    disabled={!canAdvanceToEngineering}
                    onClick={() => handleStatusChange("ready_for_engineering")}
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
                    onClick={() => handleStatusChange("engineering_blocked")}
                  >
                    Block engineering
                  </Button>
                )}
                {canSendToProduction && (
                  <Button
                    size="sm"
                    disabled={!canAdvanceToProduction}
                    onClick={() => handleStatusChange("ready_for_production")}
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
                    <select
                      value={selectedManagerId}
                      onChange={(event) =>
                        setSelectedManagerId(event.target.value)
                      }
                      className="h-8 rounded-md border border-border bg-input-background px-2 text-xs text-foreground"
                    >
                      <option value="">Assign {managerLabel.toLowerCase()}...</option>
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.name}
                        </option>
                      ))}
                    </select>
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
                    <select
                      value={selectedEngineerId}
                      onChange={(event) =>
                        setSelectedEngineerId(event.target.value)
                      }
                      className="h-8 rounded-md border border-border bg-input-background px-2 text-xs text-foreground"
                    >
                      <option value="">Assign {engineerLabel.toLowerCase()}...</option>
                      {engineers.map((engineer) => (
                        <option key={engineer.id} value={engineer.id}>
                          {engineer.name}
                        </option>
                      ))}
                    </select>
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

              {nextGate && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">
                    Next step readiness
                  </div>
                  <div className="mt-2 space-y-1">
                    <div>
                      Checklist: {nextChecklistDone}/{nextChecklistTotal || 0}
                    </div>
                    <div>
                      Attachments: {attachments.length}/{nextMinAttachments}
                    </div>
                    <div>
                      Comment:{" "}
                      {nextRequireComment
                        ? comments.length > 0
                          ? "Added"
                          : "Required"
                        : "Optional"}
                    </div>
                  </div>
                </div>
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
                <select
                  value={attachmentCategory}
                  onChange={(event) => {
                    setAttachmentCategory(event.target.value);
                    setIsAttachmentCategoryManual(true);
                  }}
                  className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                >
                  {attachmentCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
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
                  <p className="text-xs text-destructive">{attachmentError}</p>
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
                    <Button onClick={handleAddAttachment} disabled={isUploading}>
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
                              <div className="font-medium">{attachment.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Added by {attachment.addedBy}
                                {attachment.addedByRole
                                  ? ` (${attachment.addedByRole})`
                                  : ""}{" "}
                                on {formatDate(attachment.createdAt.slice(0, 10))}
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
                              onClick={() => handleRemoveAttachment(attachment.id)}
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
                        {comment.authorRole ? ` (${comment.authorRole})` : ""} -{" "}
                        {formatDate(comment.createdAt.slice(0, 10))}
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
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Partner group
                  <select
                    value={externalPartnerGroupId}
                    onChange={(event) =>
                      setExternalPartnerGroupId(event.target.value)
                    }
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  >
                    <option value="">All groups</option>
                    {activeGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Partner
                  <select
                    value={externalPartnerId}
                    onChange={(event) =>
                      setExternalPartnerId(event.target.value)
                    }
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  >
                    <option value="">Select partner</option>
                    {activePartners
                      .filter((partner) =>
                        externalPartnerGroupId
                          ? partner.groupId === externalPartnerGroupId
                          : true,
                      )
                      .map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  External order #
                  <input
                    value={externalOrderNumber}
                    onChange={(event) =>
                      setExternalOrderNumber(event.target.value)
                    }
                    placeholder="BG-5512"
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Quantity
                  <input
                    type="number"
                    min={0}
                    value={externalQuantity}
                    onChange={(event) => setExternalQuantity(event.target.value)}
                    placeholder="1"
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Due date
                  <input
                    type="date"
                    value={externalDueDate}
                    onChange={(event) => setExternalDueDate(event.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Status
                  <select
                    value={externalStatus}
                    onChange={(event) =>
                      setExternalStatus(event.target.value as ExternalJobStatus)
                    }
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  >
                    {Object.entries(externalJobStatusLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              {externalError && (
                <p className="text-xs text-destructive">{externalError}</p>
              )}
              <div className="flex justify-end">
                <Button onClick={handleAddExternalJob}>Add external job</Button>
              </div>

              {(orderState.externalJobs ?? []).length === 0 ? (
                <p className="text-muted-foreground">
                  No external jobs added yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {(orderState.externalJobs ?? []).map((job) => {
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
                              <div className="font-medium">{job.partnerName}</div>
                              {partnerGroupName ? (
                                <span className="text-xs text-muted-foreground">
                                  {partnerGroupName}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {job.externalOrderNumber} • Due{" "}
                              {formatDate(job.dueDate)}
                            </div>
                            {job.quantity !== undefined && (
                              <div className="text-xs text-muted-foreground">
                                Qty: {job.quantity}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={externalJobStatusVariant(job.status)}>
                              {externalJobStatusLabels[job.status]}
                            </Badge>
                            <select
                              value={job.status}
                              onChange={(event) =>
                                handleExternalStatusChange(
                                  job.id,
                                  event.target.value as ExternalJobStatus,
                                )
                              }
                              className="h-8 rounded-md border border-border bg-input-background px-2 text-xs text-foreground"
                            >
                              {Object.entries(externalJobStatusLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
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
                                onClick={() => handleUploadExternalFiles(job.id)}
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
                                        handleRemoveExternalFile(job.id, file.id)
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
                          {job.statusHistory && job.statusHistory.length > 0 ? (
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

        <TabsContent value="workflow">
          <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {orderState.statusHistory && orderState.statusHistory.length > 0 ? (
                <div className="space-y-4">
                  {orderState.statusHistory.map((entry, index) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                        {index < orderState.statusHistory.length - 1 && (
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
                          {entry.changedByRole ? ` (${entry.changedByRole})` : ""}
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
                <p className="text-muted-foreground">No status changes yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preparation Checklist</CardTitle>
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
                        handleChecklistToggle(item.id, event.target.checked)
                      }
                    />
                  </label>
                ))
              )}
              {canSendToEngineering && !canAdvanceToEngineering && (
                <p className="text-xs text-muted-foreground">
                  Complete required attachments, comments, and checklist items
                  before sending to engineering.
                </p>
              )}
              {canSendToProduction && !canAdvanceToProduction && (
                <p className="text-xs text-muted-foreground">
                  Complete required attachments, comments, and checklist items
                  before sending to production.
                </p>
              )}
            </CardContent>
          </Card>

          </div>
        </TabsContent>

        <TabsContent value="production">
          <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Production Batches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {batchesForOrder.length === 0 ? (
                <p className="text-muted-foreground">
                  No production batches created yet.
                </p>
              ) : (
                batchesForOrder.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <div className="font-medium">{batch.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Station: {batch.workstation}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>
                        {batch.actualHours ?? 0}h / {batch.estimatedHours}h
                      </div>
                      <div>{batch.status.replace("_", " ")}</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          </div>
        </TabsContent>
      </Tabs>

      <OrderModal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSubmit={async (values) => {
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
                <select
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                >
                  <option value="">Select reason</option>
                  {rules.returnReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
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
    </section>
  );
}
