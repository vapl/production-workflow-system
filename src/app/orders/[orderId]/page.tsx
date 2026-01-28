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
  const { role, name } = useCurrentUser();
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

  useEffect(() => {
    setOrderState(order);
    setIsLoadingOrder(false);
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
    orderState.status === "pending"
      ? "status-pending"
      : orderState.status === "in_progress"
        ? "status-in_progress"
        : orderState.status === "completed"
          ? "status-completed"
          : orderState.status === "cancelled"
            ? "status-cancelled"
            : "status-pending";

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

        <div className="flex items-center gap-2">
          <Badge variant={priorityVariant}>{orderState.priority}</Badge>
          <Badge variant={statusVariant}>
            {formatOrderStatus(orderState.status)}
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
    </section>
  );
}
