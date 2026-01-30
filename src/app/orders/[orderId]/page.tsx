"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate, formatOrderStatus } from "@/lib/domain/formatters";
import type { Batch } from "@/types/batch";
import type { OrderAttachment, OrderComment } from "@/types/orders";
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
import { supabase } from "@/lib/supabaseClient";
import { useWorkflowRules } from "@/contexts/WorkflowContext";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

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
  } = useOrders();
  const { batches } = useBatches();
  const { levels, nodes } = useHierarchy();
  const { role, name, id: userId, tenantId } = useCurrentUser();
  const { rules } = useWorkflowRules();
  const activeLevels = useMemo(
    () => levels.filter((level) => level.isActive).sort((a, b) => a.order - b.order),
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
  const [commentMessage, setCommentMessage] = useState("");
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [engineers, setEngineers] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [checklistState, setChecklistState] = useState<
    Record<string, boolean>
  >({});
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");

  const canTakeOrder =
    role === "Engineering" &&
    !orderState?.assignedEngineerId &&
    orderState?.status === "ready_for_engineering";
  const canSendToEngineering =
    role === "Sales" && orderState?.status === "draft";
  const canStartEngineering =
    role === "Engineering" && orderState?.status === "ready_for_engineering";
  const canBlockEngineering =
    role === "Engineering" && orderState?.status === "in_engineering";
  const canSendToProduction =
    role === "Engineering" && orderState?.status === "in_engineering";
  const canAssignEngineer = ["Sales", "Admin"].includes(role);
  const canSendBack =
    (role === "Sales" &&
      (orderState?.status === "ready_for_engineering" ||
        orderState?.status === "in_engineering" ||
        orderState?.status === "engineering_blocked")) ||
    (role === "Engineering" && orderState?.status === "ready_for_production");
  const returnTargetStatus =
    role === "Engineering" && orderState?.status === "ready_for_production"
      ? "in_engineering"
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
    if (!supabase) {
      setEngineers([
        { id: "eng-1", name: "Engineer 1" },
        { id: "eng-2", name: "Engineer 2" },
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
          name: row.full_name ?? "Engineer",
        })),
      );
    };

    fetchEngineers();
    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  useEffect(() => {
    setOrderState(order);
    setIsLoadingOrder(false);
    setChecklistState(order?.checklist ?? {});
  }, [order]);

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
  const attachments = orderState.attachments ?? [];
  const comments = orderState.comments ?? [];
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

  async function handleChecklistToggle(id: string, checked: boolean) {
    const next = { ...checklistState, [id]: checked };
    setChecklistState(next);
    setOrderState((prev) => (prev ? { ...prev, checklist: next } : prev));
    await updateOrder(orderState.id, { checklist: next });
  }

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
  const canAdvanceToEngineering =
    meetsEngineeringChecklist &&
    meetsEngineeringAttachments &&
    meetsEngineeringComment;
  const canAdvanceToProduction =
    meetsProductionChecklist &&
    meetsProductionAttachments &&
    meetsProductionComment;

  function renderAttachmentPreview(attachment: OrderAttachment) {
    const lowerName = attachment.name.toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const isImage =
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".gif") ||
      lowerName.endsWith(".webp");

    if (isImage && attachment.url) {
      return (
        <img
          src={attachment.url}
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
    <section className="space-y-6">
      <div>
        <Link href="/orders">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Orders
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{orderState.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {orderState.customerName}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={priorityVariant}>{orderState.priority}</Badge>
            <Badge variant={statusVariant}>
              {formatOrderStatus(orderState.status)}
            </Badge>
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
                Ready for production
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
          <div className="text-xs text-muted-foreground space-y-2">
            {orderState.assignedEngineerName && (
              <div>Engineer: {orderState.assignedEngineerName}</div>
            )}
            {canAssignEngineer && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                  value={selectedEngineerId}
                  onChange={(event) => setSelectedEngineerId(event.target.value)}
                  className="h-8 rounded-md border border-border bg-input-background px-2 text-xs text-foreground"
                >
                  <option value="">Assign engineer...</option>
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
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        {renderAttachmentPreview(attachment)}
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
                        {attachment.url && (
                          <a
                            href={attachment.url}
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
              )}
            </CardContent>
          </Card>

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
                            {formatOrderStatus(entry.status)}
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
                    {formatOrderStatus(orderState.status)}
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
      </div>

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
              {formatOrderStatus(returnTargetStatus)}.
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
