"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  Order,
  OrderAttachment,
  OrderComment,
  OrderStatus,
  OrderStatusEntry,
  ExternalJob,
  ExternalJobAttachment,
  ExternalJobStatus,
  ExternalJobStatusEntry,
} from "@/types/orders";
import { mockOrders } from "@/lib/data/mockData";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useNotifications } from "@/components/ui/Notifications";
import { getAccountingAdapter } from "@/lib/integrations/accounting/getAdapter";
import { useHierarchy } from "@/app/settings/HierarchyContext";

interface OrdersContextValue {
  orders: Order[];
  isLoading: boolean;
  error?: string | null;
  refreshOrders: () => Promise<void>;
  importOrdersFromExcel: (rows: OrderImportPayload[]) => Promise<{
    inserted: number;
    updated: number;
  }>;
  addOrder: (order: {
    orderNumber: string;
    customerName: string;
    productName?: string;
    quantity?: number;
    hierarchy?: Record<string, string>;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    status: OrderStatus;
    notes?: string;
    authorName?: string;
    authorRole?: string;
    assignedManagerId?: string;
    assignedManagerName?: string;
    assignedManagerAt?: string;
  }) => Promise<Order | null>;
  updateOrder: (
    orderId: string,
    patch: Partial<{
      customerName: string;
      productName?: string;
      quantity?: number;
      hierarchy?: Record<string, string>;
      dueDate: string;
      priority: "low" | "normal" | "high" | "urgent";
      status: OrderStatus;
      assignedEngineerId?: string;
      assignedEngineerName?: string;
      assignedEngineerAt?: string;
      assignedManagerId?: string;
      assignedManagerName?: string;
      assignedManagerAt?: string;
      statusChangedBy?: string;
      statusChangedByRole?: string;
      statusChangedAt?: string;
      checklist?: Record<string, boolean>;
    }>,
  ) => Promise<Order | null>;
  removeOrder: (orderId: string) => Promise<boolean>;
  addOrderAttachment: (
    orderId: string,
    attachment: Omit<OrderAttachment, "id" | "createdAt">,
  ) => Promise<OrderAttachment | null>;
  removeOrderAttachment: (
    orderId: string,
    attachmentId: string,
  ) => Promise<boolean>;
  addOrderComment: (
    orderId: string,
    comment: Omit<OrderComment, "id" | "createdAt">,
  ) => Promise<OrderComment | null>;
  removeOrderComment: (orderId: string, commentId: string) => Promise<boolean>;
  addExternalJob: (
    orderId: string,
    payload: {
      partnerId?: string;
      partnerName: string;
      partnerEmail?: string;
      requestMode?: "manual" | "partner_portal";
      partnerRequestComment?: string;
      externalOrderNumber: string;
      quantity?: number;
      dueDate: string;
      status: ExternalJobStatus;
    },
  ) => Promise<ExternalJob | null>;
  updateExternalJob: (
    externalJobId: string,
    patch: Partial<{
      partnerId?: string;
      partnerName: string;
      partnerEmail?: string;
      partnerRequestComment?: string;
      partnerResponseNote?: string | null;
      externalOrderNumber: string;
      quantity?: number;
      dueDate: string;
      status: ExternalJobStatus;
      deliveryNoteNo?: string | null;
      receivedAt?: string | null;
      receivedBy?: string | null;
    }>,
  ) => Promise<ExternalJob | null>;
  removeExternalJob: (externalJobId: string) => Promise<boolean>;
  addExternalJobAttachment: (
    externalJobId: string,
    attachment: Omit<ExternalJobAttachment, "id" | "createdAt">,
  ) => Promise<ExternalJobAttachment | null>;
  removeExternalJobAttachment: (
    externalJobId: string,
    attachmentId: string,
  ) => Promise<boolean>;
  syncAccountingOrders: () => Promise<number>;
}

interface OrderImportPayload {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  productName?: string;
  quantity?: number;
  dueDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: OrderStatus;
  notes?: string;
  hierarchy?: Record<string, string>;
  sourcePayload?: Record<string, unknown>;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const { notify } = useNotifications();
  const { levels } = useHierarchy();
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeOrderStatus = (value: string): OrderStatus => {
    switch (value) {
      case "draft":
      case "ready_for_engineering":
      case "in_engineering":
      case "engineering_blocked":
      case "ready_for_production":
      case "in_production":
        return value;
      case "pending":
        return "draft";
      case "in_progress":
        return "in_engineering";
      case "completed":
        return "ready_for_production";
      case "cancelled":
        return "engineering_blocked";
      default:
        return "draft";
    }
  };

  const mapAttachment = (row: {
    id: string;
    name: string;
    url?: string | null;
    added_by_name?: string | null;
    added_by_role?: string | null;
    created_at: string;
    size?: number | null;
    mime_type?: string | null;
    category?: string | null;
  }): OrderAttachment => ({
    id: row.id,
    name: row.name,
    url: row.url ?? undefined,
    addedBy: row.added_by_name ?? "Unknown",
    addedByRole: row.added_by_role ?? undefined,
    createdAt: row.created_at,
    size: row.size ?? undefined,
    mimeType: row.mime_type ?? undefined,
    category: row.category ?? undefined,
  });

  const mapExternalJobAttachment = (row: {
    id: string;
    name: string;
    url?: string | null;
    added_by_name?: string | null;
    added_by_role?: string | null;
    created_at: string;
    size?: number | null;
    mime_type?: string | null;
    category?: string | null;
  }): ExternalJobAttachment => ({
    id: row.id,
    name: row.name,
    url: row.url ?? undefined,
    addedBy: row.added_by_name ?? "Unknown",
    addedByRole: row.added_by_role ?? undefined,
    createdAt: row.created_at,
    size: row.size ?? undefined,
    mimeType: row.mime_type ?? undefined,
    category: row.category ?? undefined,
  });

  const mapExternalJobStatusEntry = (row: {
    id: string;
    status: ExternalJobStatus;
    changed_by_name?: string | null;
    changed_by_role?: string | null;
    changed_at: string;
  }): ExternalJobStatusEntry => ({
    id: row.id,
    status: row.status,
    changedBy: row.changed_by_name ?? "Unknown",
    changedByRole: row.changed_by_role ?? undefined,
    changedAt: row.changed_at,
  });

  const mapComment = (row: {
    id: string;
    message: string;
    author?: string | null;
    author_name?: string | null;
    author_role?: string | null;
    created_at: string;
  }): OrderComment => ({
    id: row.id,
    message: row.message,
    authorId: row.author ?? undefined,
    author: row.author_name ?? "Unknown",
    authorRole: row.author_role ?? undefined,
    createdAt: row.created_at,
  });

  const mapStatusEntry = (row: {
    id: string;
    status: string;
    changed_by_name?: string | null;
    changed_by_role?: string | null;
    changed_at: string;
  }): OrderStatusEntry => ({
    id: row.id,
    status: normalizeOrderStatus(row.status),
    changedBy: row.changed_by_name ?? "Unknown",
    changedByRole: row.changed_by_role ?? undefined,
    changedAt: row.changed_at,
  });

  const mapExternalJob = (row: {
    id: string;
    order_id: string;
    partner_id?: string | null;
    partner_name?: string | null;
    partner_email?: string | null;
    external_order_number: string;
    quantity?: number | null;
    due_date: string;
    status: ExternalJobStatus;
    request_mode?: "manual" | "partner_portal" | null;
    partner_request_comment?: string | null;
    partner_request_sent_at?: string | null;
    partner_request_viewed_at?: string | null;
    partner_response_submitted_at?: string | null;
    partner_response_order_number?: string | null;
    partner_response_due_date?: string | null;
    partner_response_note?: string | null;
    delivery_note_no?: string | null;
    received_at?: string | null;
    received_by?: string | null;
    created_at: string;
    external_job_status_history?: Array<{
      id: string;
      status: ExternalJobStatus;
      changed_by_name?: string | null;
      changed_by_role?: string | null;
      changed_at: string;
    }>;
    external_job_attachments?: Array<{
      id: string;
      name: string;
      url?: string | null;
      added_by_name?: string | null;
      added_by_role?: string | null;
      created_at: string;
      size?: number | null;
      mime_type?: string | null;
      category?: string | null;
    }>;
  }): ExternalJob => ({
    id: row.id,
    orderId: row.order_id,
    partnerId: row.partner_id ?? undefined,
    partnerName: row.partner_name ?? "Partner",
    partnerEmail: row.partner_email ?? undefined,
    externalOrderNumber: row.external_order_number,
    quantity: row.quantity ?? undefined,
    dueDate: row.due_date,
    status: row.status,
    requestMode: row.request_mode ?? undefined,
    partnerRequestComment: row.partner_request_comment ?? undefined,
    partnerRequestSentAt: row.partner_request_sent_at ?? undefined,
    partnerRequestViewedAt: row.partner_request_viewed_at ?? undefined,
    partnerResponseSubmittedAt: row.partner_response_submitted_at ?? undefined,
    partnerResponseOrderNumber: row.partner_response_order_number ?? undefined,
    partnerResponseDueDate: row.partner_response_due_date ?? undefined,
    partnerResponseNote: row.partner_response_note ?? undefined,
    deliveryNoteNo: row.delivery_note_no ?? undefined,
    receivedAt: row.received_at ?? undefined,
    receivedBy: row.received_by ?? undefined,
    createdAt: row.created_at,
    statusHistory:
      row.external_job_status_history?.map(mapExternalJobStatusEntry) ??
      undefined,
    attachments:
      row.external_job_attachments?.map(mapExternalJobAttachment) ?? undefined,
  });

  const mapOrder = (row: {
    id: string;
    order_number: string;
    customer_name: string;
    product_name?: string | null;
    quantity?: number | null;
    hierarchy?: Record<string, string> | null;
    due_date: string;
    priority: "low" | "normal" | "high" | "urgent";
    status: string;
    assigned_engineer_id?: string | null;
    assigned_engineer_name?: string | null;
    assigned_engineer_at?: string | null;
    assigned_manager_id?: string | null;
    assigned_manager_name?: string | null;
    assigned_manager_at?: string | null;
    status_changed_by?: string | null;
    status_changed_by_role?: string | null;
    status_changed_at?: string | null;
    checklist?: Record<string, boolean> | null;
    source?: "manual" | "accounting" | null;
    external_id?: string | null;
    source_payload?: Record<string, unknown> | null;
    synced_at?: string | null;
    production_duration_minutes?: number | null;
    order_attachments?: Array<{
      id: string;
      name: string;
      url?: string | null;
      added_by_name?: string | null;
      added_by_role?: string | null;
      created_at: string;
      size?: number | null;
      mime_type?: string | null;
    }>;
    order_comments?: Array<{
      id: string;
      message: string;
      author?: string | null;
      author_name?: string | null;
      author_role?: string | null;
      created_at: string;
    }>;
    order_status_history?: Array<{
      id: string;
      status: string;
      changed_by_name?: string | null;
      changed_by_role?: string | null;
      changed_at: string;
    }>;
    external_jobs?: Array<{
      id: string;
      order_id: string;
      partner_id?: string | null;
      partner_name?: string | null;
      partner_email?: string | null;
      external_order_number: string;
      quantity?: number | null;
      due_date: string;
      status: ExternalJobStatus;
      request_mode?: "manual" | "partner_portal" | null;
      partner_request_comment?: string | null;
      partner_request_sent_at?: string | null;
      partner_request_viewed_at?: string | null;
      partner_response_submitted_at?: string | null;
      partner_response_order_number?: string | null;
      partner_response_due_date?: string | null;
      partner_response_note?: string | null;
      created_at: string;
      external_job_attachments?: Array<{
        id: string;
        name: string;
        url?: string | null;
        added_by_name?: string | null;
        added_by_role?: string | null;
        created_at: string;
        size?: number | null;
        mime_type?: string | null;
      }>;
    }>;
  }): Order => ({
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    productName: row.product_name ?? undefined,
    quantity: row.quantity ?? undefined,
    hierarchy: row.hierarchy ?? undefined,
    dueDate: row.due_date,
    priority: row.priority,
    status: normalizeOrderStatus(row.status),
    assignedEngineerId: row.assigned_engineer_id ?? undefined,
    assignedEngineerName: row.assigned_engineer_name ?? undefined,
    assignedEngineerAt: row.assigned_engineer_at ?? undefined,
    assignedManagerId: row.assigned_manager_id ?? undefined,
    assignedManagerName: row.assigned_manager_name ?? undefined,
    assignedManagerAt: row.assigned_manager_at ?? undefined,
    statusChangedBy: row.status_changed_by ?? undefined,
    statusChangedByRole: row.status_changed_by_role ?? undefined,
    statusChangedAt: row.status_changed_at ?? undefined,
    checklist: row.checklist ?? undefined,
    source: row.source ?? undefined,
    externalId: row.external_id ?? undefined,
    sourcePayload: row.source_payload ?? undefined,
    syncedAt: row.synced_at ?? undefined,
    productionDurationMinutes: row.production_duration_minutes ?? undefined,
    attachments: row.order_attachments?.map(mapAttachment) ?? undefined,
    comments: row.order_comments?.map(mapComment) ?? undefined,
    statusHistory: row.order_status_history?.map(mapStatusEntry) ?? undefined,
    externalJobs: row.external_jobs?.map(mapExternalJob) ?? undefined,
  });

  const refreshOrders = async () => {
    if (!supabase) {
      setOrders(mockOrders);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        product_name,
        quantity,
        hierarchy,
        due_date,
        priority,
        status,
        assigned_engineer_id,
        assigned_engineer_name,
        assigned_engineer_at,
        assigned_manager_id,
        assigned_manager_name,
        assigned_manager_at,
        status_changed_by,
        status_changed_by_role,
        status_changed_at,
        checklist,
        order_status_history (
          id,
          status,
          changed_by_name,
          changed_by_role,
          changed_at
        ),
        source,
        external_id,
        source_payload,
        synced_at,
        production_duration_minutes,
        order_attachments (
          id,
          name,
          url,
          added_by_name,
          added_by_role,
          created_at,
          size,
          mime_type,
          category
        ),
        order_comments (
          id,
          message,
          author,
          author_name,
          author_role,
          created_at
        )
        ,
        external_jobs (
          id,
          order_id,
          partner_id,
          partner_name,
          partner_email,
          external_order_number,
          quantity,
          due_date,
          status,
          request_mode,
          partner_request_comment,
          partner_request_sent_at,
          partner_request_viewed_at,
          partner_response_submitted_at,
          partner_response_order_number,
          partner_response_due_date,
          partner_response_note,
          delivery_note_no,
          received_at,
          received_by,
          created_at,
          external_job_status_history (
            id,
            status,
            changed_by_name,
            changed_by_role,
            changed_at
          ),
          external_job_attachments (
            id,
            name,
            url,
            added_by_name,
            added_by_role,
            created_at,
            size,
            mime_type,
            category
          )
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }
    setOrders((data ?? []).map(mapOrder));
    setIsLoading(false);
  };

  useEffect(() => {
    if (!supabase) {
      setOrders(mockOrders);
      return;
    }
    if (user.loading) {
      return;
    }
    if (!user.isAuthenticated) {
      setOrders([]);
      return;
    }
    void refreshOrders();
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const syncAccountingOrders = async () => {
    const adapter = getAccountingAdapter();
    const accountingOrders = await adapter.fetchOrders();

    if (accountingOrders.length === 0) {
      notify({
        title: "No accounting orders found",
        variant: "info",
      });
      return 0;
    }

    const contractLevel = levels.find((level) => level.key === "contract");
    const categoryLevel = levels.find((level) => level.key === "category");
    const productLevel = levels.find((level) => level.key === "product");

    if (!supabase) {
      const mapped: Order[] = accountingOrders.map((order) => {
        const hierarchy: Record<string, string> = {};
        if (order.contract && contractLevel?.id) {
          hierarchy[contractLevel.id] = order.contract;
        }
        if (order.category && categoryLevel?.id) {
          hierarchy[categoryLevel.id] = order.category;
        }
        if (order.product && productLevel?.id) {
          hierarchy[productLevel.id] = order.product;
        }
        return {
          id: `acc-${order.externalId}`,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          productName: order.productName ?? order.product ?? undefined,
          quantity: order.quantity ?? undefined,
          hierarchy: Object.keys(hierarchy).length > 0 ? hierarchy : undefined,
          dueDate: order.dueDate,
          priority: order.priority ?? "normal",
          status: "draft",
          source: "accounting",
          externalId: order.externalId,
          sourcePayload: order.sourcePayload,
          syncedAt: new Date().toISOString(),
        };
      });
      setOrders((prev) => {
        const existing = new Map(prev.map((order) => [order.orderNumber, order]));
        mapped.forEach((order) => {
          existing.set(order.orderNumber, order);
        });
        return Array.from(existing.values());
      });
      return mapped.length;
    }

    if (!user.tenantId) {
      setError("Missing tenant assignment for this user.");
      notify({
        title: "Accounting sync failed",
        description: "Missing tenant assignment.",
        variant: "error",
      });
      return 0;
    }

    const orderNumbers = accountingOrders.map((order) => order.orderNumber);
    const { data: existingRows, error: existingError } = await supabase
      .from("orders")
      .select("order_number, source")
      .in("order_number", orderNumbers);
    if (existingError) {
      setError(existingError.message);
      notify({
        title: "Accounting sync failed",
        description: existingError.message,
        variant: "error",
      });
      return 0;
    }
    const blockedOrders = new Set(
      (existingRows ?? [])
        .filter((row) => row.source === "manual" || row.source === "excel")
        .map((row) => row.order_number),
    );

    const rows = accountingOrders
      .filter((order) => !blockedOrders.has(order.orderNumber))
      .map((order) => {
      const hierarchy: Record<string, string> = {};
      if (order.contract && contractLevel?.id) {
        hierarchy[contractLevel.id] = order.contract;
      }
      if (order.category && categoryLevel?.id) {
        hierarchy[categoryLevel.id] = order.category;
      }
      if (order.product && productLevel?.id) {
        hierarchy[productLevel.id] = order.product;
      }
      return {
        tenant_id: user.tenantId,
        order_number: order.orderNumber,
        customer_name: order.customerName,
        product_name: order.productName ?? order.product ?? null,
        quantity: order.quantity ?? null,
        hierarchy: Object.keys(hierarchy).length > 0 ? hierarchy : null,
        due_date: order.dueDate,
        priority: order.priority ?? "normal",
        status: "draft",
        source: "accounting",
        external_id: order.externalId,
        source_payload: order.sourcePayload ?? null,
        synced_at: new Date().toISOString(),
      };
      });

    if (rows.length === 0) {
      notify({
        title: "Accounting sync skipped",
        description: "All accounting orders have manual overrides.",
        variant: "info",
      });
      return 0;
    }

    const { error: upsertError } = await supabase
      .from("orders")
      .upsert(rows, { onConflict: "order_number" });

    if (upsertError) {
      setError(upsertError.message);
      notify({
        title: "Accounting sync failed",
        description: upsertError.message,
        variant: "error",
      });
      return 0;
    }

    await refreshOrders();
    notify({
      title: `Synced ${rows.length} accounting orders`,
      variant: "success",
    });
    return rows.length;
  };

  const importOrdersFromExcel = async (rows: OrderImportPayload[]) => {
    if (rows.length === 0) {
      notify({
        title: "No rows to import",
        variant: "info",
      });
      return { inserted: 0, updated: 0 };
    }

    const uniqueRows = new Map<string, OrderImportPayload>();
    rows.forEach((row) => uniqueRows.set(row.orderNumber, row));
    const dedupedRows = Array.from(uniqueRows.values());

    if (!supabase) {
      const merged = dedupedRows.map((row) => ({
        id: `excel-${row.orderNumber}`,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        productName: row.productName,
        quantity: row.quantity,
        hierarchy: row.hierarchy,
        dueDate: row.dueDate,
        priority: row.priority,
        status: row.status,
        source: "excel" as const,
      }));
      setOrders((prev) => {
        const next = new Map(prev.map((order) => [order.orderNumber, order]));
        merged.forEach((order) => next.set(order.orderNumber, order));
        return Array.from(next.values());
      });
      return { inserted: merged.length, updated: 0 };
    }

    if (!user.tenantId) {
      setError("Missing tenant assignment for this user.");
      notify({
        title: "Excel import failed",
        description: "Missing tenant assignment.",
        variant: "error",
      });
      return { inserted: 0, updated: 0 };
    }

    const orderNumbers = dedupedRows.map((row) => row.orderNumber);
    const { data: existingRows, error: existingError } = await supabase
      .from("orders")
      .select("id, order_number")
      .in("order_number", orderNumbers);

    if (existingError) {
      notify({
        title: "Excel import failed",
        description: existingError.message,
        variant: "error",
      });
      return { inserted: 0, updated: 0 };
    }

    const existingSet = new Set(
      (existingRows ?? []).map((row) => row.order_number),
    );

    const upsertRows = dedupedRows.map((row) => ({
      tenant_id: user.tenantId,
      order_number: row.orderNumber,
      customer_name: row.customerName,
      product_name: row.productName ?? null,
      quantity: row.quantity ?? null,
      hierarchy: row.hierarchy ?? null,
      due_date: row.dueDate,
      priority: row.priority,
      status: row.status,
      source: "excel",
      external_id: null,
      source_payload: row.sourcePayload ?? null,
      synced_at: new Date().toISOString(),
    }));

    const { data: upserted, error: upsertError } = await supabase
      .from("orders")
      .upsert(upsertRows, { onConflict: "order_number" })
      .select("id, order_number");

    if (upsertError) {
      notify({
        title: "Excel import failed",
        description: upsertError.message,
        variant: "error",
      });
      return { inserted: 0, updated: 0 };
    }

    const updated = (upserted ?? []).filter((row) =>
      existingSet.has(row.order_number),
    ).length;
    const inserted = (upserted ?? []).length - updated;

    const orderIdByNumber = new Map(
      (upserted ?? []).map((row) => [row.order_number, row.id]),
    );
    const commentRows = dedupedRows
      .filter((row) => row.notes?.trim())
      .map((row) => ({
        order_id: orderIdByNumber.get(row.orderNumber),
        tenant_id: user.tenantId,
        message: row.notes?.trim() ?? "",
        author_name: user.name ?? "System",
        author_role: user.role ?? null,
      }))
      .filter((row) => row.order_id);

    if (commentRows.length > 0) {
      await supabase.from("order_comments").insert(commentRows);
    }

    await refreshOrders();
    notify({
      title: `Imported ${inserted + updated} orders`,
      description:
        updated > 0 ? `${updated} updated, ${inserted} inserted.` : undefined,
      variant: "success",
    });
    return { inserted, updated };
  };

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      isLoading,
      error,
      refreshOrders,
      importOrdersFromExcel,
      addOrder: async (order) => {
        if (!supabase) {
          const fallback: Order = {
            id: `o-${Date.now()}`,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            productName: order.productName,
            quantity: order.quantity,
            hierarchy: order.hierarchy,
            dueDate: order.dueDate,
            priority: order.priority,
            status: order.status,
            assignedManagerId:
              order.assignedManagerId ??
              (user.role === "Sales" || user.isAdmin ? user.id : undefined),
            assignedManagerName:
              order.assignedManagerName ??
              (user.role === "Sales" || user.isAdmin
                ? user.name ?? "Manager"
                : undefined),
            assignedManagerAt:
              order.assignedManagerAt ??
              (user.role === "Sales" || user.isAdmin
                ? new Date().toISOString()
                : undefined),
            source: "manual",
            comments: order.notes
              ? [
                  {
                    id: `cmt-${Date.now()}`,
                    message: order.notes,
                    author: order.authorName ?? "System",
                    authorRole: order.authorRole,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : undefined,
          };
          setOrders((prev) => [fallback, ...prev]);
          return fallback;
        }
        if (!user.tenantId) {
          setError("Missing tenant assignment for this user.");
          notify({
            title: "Order not created",
            description: "Missing tenant assignment.",
            variant: "error",
          });
          return null;
        }
        const { data, error: insertError } = await supabase
          .from("orders")
          .insert({
            tenant_id: user.tenantId,
            order_number: order.orderNumber,
            customer_name: order.customerName,
            product_name: order.productName ?? null,
            quantity: order.quantity ?? null,
            hierarchy: order.hierarchy ?? null,
            due_date: order.dueDate,
            priority: order.priority,
            status: order.status,
            assigned_manager_id: order.assignedManagerId ?? (user.role === "Sales" || user.isAdmin ? user.id : null),
            assigned_manager_name: order.assignedManagerName ?? (user.role === "Sales" || user.isAdmin ? user.name : null),
            assigned_manager_at: order.assignedManagerAt ?? (user.role === "Sales" || user.isAdmin ? new Date().toISOString() : null),
            source: "manual",
          })
          .select(
            `
            id,
            order_number,
            customer_name,
            product_name,
            quantity,
            hierarchy,
            due_date,
            priority,
            status,
            assigned_engineer_id,
            assigned_engineer_name,
            assigned_engineer_at,
            assigned_manager_id,
            assigned_manager_name,
            assigned_manager_at,
            status_changed_by,
            status_changed_by_role,
            status_changed_at,
            checklist,
            order_status_history (
              id,
              status,
              changed_by_name,
              changed_by_role,
              changed_at
            ),
            source,
            external_id,
            source_payload,
            synced_at,
              order_attachments (
                id,
                name,
                url,
                added_by_name,
                added_by_role,
                created_at,
                size,
                mime_type,
                category
              ),
        order_comments (
          id,
          message,
          author,
          author_name,
          author_role,
          created_at
        )
        ,
        external_jobs (
          id,
          order_id,
          partner_id,
          partner_name,
          partner_email,
          external_order_number,
          quantity,
          due_date,
          status,
          request_mode,
          partner_request_comment,
          partner_request_sent_at,
          partner_request_viewed_at,
          partner_response_submitted_at,
          partner_response_order_number,
          partner_response_due_date,
          partner_response_note,
          delivery_note_no,
          received_at,
          received_by,
          created_at,
          external_job_status_history (
            id,
            status,
            changed_by_name,
            changed_by_role,
            changed_at
          ),
          external_job_attachments (
            id,
            name,
            url,
            added_by_name,
            added_by_role,
            created_at,
            size,
            mime_type,
            category
          )
        )
      `,
          )
          .single();
        if (insertError) {
          setError(insertError.message);
          notify({
            title: "Order not created",
            description: insertError.message,
            variant: "error",
          });
          return null;
        }
        let mapped = mapOrder(data);
        if (order.notes?.trim()) {
          const { data: commentData, error: commentError } = await supabase
            .from("order_comments")
            .insert({
              order_id: mapped.id,
              tenant_id: user.tenantId,
              message: order.notes.trim(),
              author: user.id ?? null,
              author_name: order.authorName ?? "System",
              author_role: order.authorRole ?? null,
            })
            .select(
              `
              id,
              message,
              author,
              author_name,
              author_role,
              created_at
            `,
            )
            .single();
          if (!commentError && commentData) {
            const newComment = mapComment(commentData);
            mapped = {
              ...mapped,
              comments: [newComment, ...(mapped.comments ?? [])],
            };
          }
        }
        setOrders((prev) => [mapped, ...prev]);
        await refreshOrders();
        notify({
          title: `Order ${mapped.orderNumber} created`,
          variant: "success",
        });
        return mapped;
      },
      updateOrder: async (orderId, patch) => {
        if (!supabase) {
          const nextHistory: OrderStatusEntry[] =
            patch.status !== undefined
              ? [
                  {
                    id: `hst-${Date.now()}`,
                    status: patch.status,
                    changedBy: user.name ?? "System",
                    changedByRole: user.role ?? undefined,
                    changedAt: new Date().toISOString(),
                  },
                ]
              : [];
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    ...patch,
                    statusHistory: patch.status
                      ? [
                          ...nextHistory,
                          ...(order.statusHistory ?? []),
                        ]
                      : order.statusHistory,
                  }
                : order,
            ),
          );
          return orders.find((order) => order.id === orderId) ?? null;
        }
        const existingOrder = orders.find((order) => order.id === orderId);
        const updatePayload: Record<string, unknown> = {};
        if (patch.customerName !== undefined) {
          updatePayload.customer_name = patch.customerName;
        }
        if (patch.productName !== undefined) {
          updatePayload.product_name = patch.productName;
        }
        if (patch.quantity !== undefined) {
          updatePayload.quantity = patch.quantity;
        }
        if (patch.hierarchy !== undefined) {
          updatePayload.hierarchy = patch.hierarchy;
        }
        if (patch.dueDate !== undefined) {
          updatePayload.due_date = patch.dueDate;
        }
        if (patch.priority !== undefined) {
          updatePayload.priority = patch.priority;
        }
        if (patch.status !== undefined) {
          updatePayload.status = patch.status;
        }
        if (patch.statusChangedBy !== undefined) {
          updatePayload.status_changed_by = patch.statusChangedBy;
        }
        if (patch.statusChangedByRole !== undefined) {
          updatePayload.status_changed_by_role = patch.statusChangedByRole;
        }
        if (patch.statusChangedAt !== undefined) {
          updatePayload.status_changed_at =
            patch.statusChangedAt === "" ? null : patch.statusChangedAt;
        }
        if (patch.checklist !== undefined) {
          updatePayload.checklist = patch.checklist;
        }
        if (patch.assignedEngineerId !== undefined) {
          updatePayload.assigned_engineer_id =
            patch.assignedEngineerId === "" ? null : patch.assignedEngineerId;
        }
        if (patch.assignedEngineerName !== undefined) {
          updatePayload.assigned_engineer_name =
            patch.assignedEngineerName === ""
              ? null
              : patch.assignedEngineerName;
        }
        if (patch.assignedEngineerAt !== undefined) {
          updatePayload.assigned_engineer_at =
            patch.assignedEngineerAt === "" ? null : patch.assignedEngineerAt;
        }
        if (patch.assignedManagerId !== undefined) {
          updatePayload.assigned_manager_id =
            patch.assignedManagerId === "" ? null : patch.assignedManagerId;
        }
        if (patch.assignedManagerName !== undefined) {
          updatePayload.assigned_manager_name =
            patch.assignedManagerName === "" ? null : patch.assignedManagerName;
        }
        if (patch.assignedManagerAt !== undefined) {
          updatePayload.assigned_manager_at =
            patch.assignedManagerAt === "" ? null : patch.assignedManagerAt;
        }
        if (existingOrder?.source === "accounting") {
          updatePayload.source = "manual";
        }
        const { data: updatedRows, error: updateError } = await supabase
          .from("orders")
          .update(updatePayload)
          .eq("id", orderId)
          .select(
            `
            id,
            order_number,
            customer_name,
            product_name,
            quantity,
            hierarchy,
            due_date,
            priority,
            status,
            assigned_engineer_id,
            assigned_engineer_name,
            assigned_engineer_at,
            assigned_manager_id,
            assigned_manager_name,
            assigned_manager_at,
            status_changed_by,
            status_changed_by_role,
            status_changed_at,
            checklist,
            order_status_history (
              id,
              status,
              changed_by_name,
              changed_by_role,
              changed_at
            ),
            source,
            external_id,
            source_payload,
            synced_at,
              order_attachments (
                id,
                name,
                url,
                added_by_name,
                added_by_role,
                created_at,
                size,
                mime_type,
                category
              ),
        order_comments (
          id,
          message,
          author,
          author_name,
          author_role,
          created_at
        )
        ,
        external_jobs (
          id,
          order_id,
          partner_id,
          partner_name,
          partner_email,
          external_order_number,
          quantity,
          due_date,
          status,
          request_mode,
          partner_request_comment,
          partner_request_sent_at,
          partner_request_viewed_at,
          partner_response_submitted_at,
          partner_response_order_number,
          partner_response_due_date,
          partner_response_note,
          delivery_note_no,
          received_at,
          received_by,
          created_at,
          external_job_status_history (
            id,
            status,
            changed_by_name,
            changed_by_role,
            changed_at
          ),
          external_job_attachments (
            id,
            name,
            url,
            added_by_name,
            added_by_role,
            created_at,
            size,
            mime_type,
            category
          )
        )
      `,
          )
        if (updateError) {
          setError(updateError.message);
          notify({
            title: "Order not updated",
            description: updateError.message,
            variant: "error",
          });
          return null;
        }
        const data = updatedRows?.[0] ?? null;
        if (!data) {
          const description = "Order was not found or no access to update.";
          setError(description);
          notify({
            title: "Order not updated",
            description,
            variant: "error",
          });
          return null;
        }
        if (patch.status !== undefined && user.tenantId) {
          await supabase.from("order_status_history").insert({
            order_id: orderId,
            tenant_id: user.tenantId,
            status: patch.status,
            changed_by_name: user.name ?? "System",
            changed_by_role: user.role ?? null,
            changed_at: patch.statusChangedAt ?? new Date().toISOString(),
          });
        }
        const mapped = mapOrder(data);
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? mapped : order)),
        );
        await refreshOrders();
        notify({
          title: `Order ${mapped.orderNumber} updated`,
          variant: "success",
        });
        return mapped;
      },
      removeOrder: async (orderId) => {
        if (!supabase) {
          setOrders((prev) => prev.filter((order) => order.id !== orderId));
          return true;
        }
        const { error: deleteError } = await supabase
          .from("orders")
          .delete()
          .eq("id", orderId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Order not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return false;
        }
        setOrders((prev) => prev.filter((order) => order.id !== orderId));
        await refreshOrders();
        notify({
          title: "Order deleted",
          variant: "success",
        });
        return true;
      },
      addOrderAttachment: async (orderId, attachment) => {
        if (!supabase) {
          const fallback: OrderAttachment = {
            ...attachment,
            id: `att-${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    attachments: [fallback, ...(order.attachments ?? [])],
                  }
                : order,
            ),
          );
          return fallback;
        }
        if (!user.tenantId) {
          setError("Missing tenant assignment for this user.");
          return null;
        }
        const { data, error: insertError } = await supabase
          .from("order_attachments")
          .insert({
            order_id: orderId,
            tenant_id: user.tenantId,
            name: attachment.name,
            url: attachment.url ?? null,
            added_by_name: attachment.addedBy,
            added_by_role: attachment.addedByRole ?? null,
            size: attachment.size ?? null,
            mime_type: attachment.mimeType ?? null,
            category: attachment.category ?? "order_documents",
          })
          .select(
            `
            id,
            name,
            url,
            added_by_name,
            added_by_role,
            created_at,
            size,
            mime_type,
            category
            `,
          )
          .single();
        if (insertError) {
          setError(insertError.message);
          return null;
        }
        const mapped = mapAttachment(data);
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  attachments: [mapped, ...(order.attachments ?? [])],
                }
              : order,
          ),
        );
        return mapped;
      },
      removeOrderAttachment: async (orderId, attachmentId) => {
        if (!supabase) {
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    attachments: (order.attachments ?? []).filter(
                      (attachment) => attachment.id !== attachmentId,
                    ),
                  }
                : order,
            ),
          );
          return true;
        }
        const { error: deleteError } = await supabase
          .from("order_attachments")
          .delete()
          .eq("id", attachmentId);
        if (deleteError) {
          setError(deleteError.message);
          return false;
        }
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  attachments: (order.attachments ?? []).filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                }
              : order,
          ),
        );
        return true;
      },
      addOrderComment: async (orderId, comment) => {
        if (!supabase) {
          const fallback: OrderComment = {
            ...comment,
            authorId: user.id ?? undefined,
            id: `cmt-${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    comments: [fallback, ...(order.comments ?? [])],
                  }
                : order,
            ),
          );
          return fallback;
        }
        if (!user.tenantId) {
          setError("Missing tenant assignment for this user.");
          return null;
        }
        const { data, error: insertError } = await supabase
          .from("order_comments")
          .insert({
            order_id: orderId,
            tenant_id: user.tenantId,
            message: comment.message,
            author: user.id ?? null,
            author_name: comment.author,
            author_role: comment.authorRole ?? null,
          })
          .select(
            `
            id,
            message,
            author,
            author_name,
            author_role,
            created_at
          `,
          )
          .single();
        if (insertError) {
          setError(insertError.message);
          return null;
        }
        const mapped = mapComment(data);
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  comments: [mapped, ...(order.comments ?? [])],
                }
              : order,
          ),
        );
        return mapped;
      },
      removeOrderComment: async (orderId, commentId) => {
        const order = orders.find((item) => item.id === orderId);
        const comment = order?.comments?.find((item) => item.id === commentId);
        const canRemove =
          user.isAdmin || user.isOwner || comment?.authorId === user.id;
        if (!canRemove) {
          setError("You can only remove your own comments.");
          return false;
        }
        if (!supabase) {
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    comments: (order.comments ?? []).filter(
                      (comment) => comment.id !== commentId,
                    ),
                  }
                : order,
            ),
          );
          return true;
        }
        const { error: deleteError } = await supabase
          .from("order_comments")
          .delete()
          .eq("id", commentId);
        if (deleteError) {
          setError(deleteError.message);
          return false;
        }
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  comments: (order.comments ?? []).filter(
                    (comment) => comment.id !== commentId,
                  ),
                }
              : order,
          ),
        );
        return true;
      },
      addExternalJob: async (orderId, payload) => {
        if (!supabase || !user.tenantId) {
          const fallback: ExternalJob = {
            id: `ext-${Date.now()}`,
            orderId,
            partnerId: payload.partnerId,
            partnerName: payload.partnerName,
            partnerEmail: payload.partnerEmail,
            requestMode: payload.requestMode ?? "manual",
            partnerRequestComment: payload.partnerRequestComment,
            externalOrderNumber: payload.externalOrderNumber,
            quantity: payload.quantity,
            dueDate: payload.dueDate,
            status: payload.status,
            createdAt: new Date().toISOString(),
            statusHistory: [
              {
                id: `ext-h-${Date.now()}`,
                status: payload.status,
                changedBy: user.name || "User",
                changedByRole: user.role,
                changedAt: new Date().toISOString(),
              },
            ],
            attachments: [],
          };
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    externalJobs: [fallback, ...(order.externalJobs ?? [])],
                  }
                : order,
            ),
          );
          return fallback;
        }

        const { data, error: insertError } = await supabase
          .from("external_jobs")
          .insert({
            tenant_id: user.tenantId,
            order_id: orderId,
            partner_id: payload.partnerId ?? null,
            partner_name: payload.partnerName,
            partner_email: payload.partnerEmail ?? null,
            request_mode: payload.requestMode ?? "manual",
            partner_request_comment: payload.partnerRequestComment ?? null,
            external_order_number: payload.externalOrderNumber,
            quantity: payload.quantity ?? null,
            due_date: payload.dueDate,
            status: payload.status,
          })
          .select(
            `
            id,
            order_id,
            partner_id,
            partner_name,
            partner_email,
            request_mode,
            partner_request_comment,
            external_order_number,
            quantity,
            due_date,
            status,
            created_at
          `,
          )
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add external job.");
          return null;
        }
        await supabase.from("external_job_status_history").insert({
          tenant_id: user.tenantId,
          external_job_id: data.id,
          status: payload.status,
          changed_by_name: user.name,
          changed_by_role: user.role,
        });
        const mapped = mapExternalJob({
          ...data,
          external_job_status_history: [
            {
              id: `ext-h-${Date.now()}`,
              status: payload.status,
              changed_by_name: user.name,
              changed_by_role: user.role,
              changed_at: new Date().toISOString(),
            },
          ],
          external_job_attachments: [],
        });
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  externalJobs: [mapped, ...(order.externalJobs ?? [])],
                }
              : order,
          ),
        );
        return mapped;
      },
      updateExternalJob: async (externalJobId, patch) => {
        if (!supabase) {
          let updated: ExternalJob | null = null;
          setOrders((prev) =>
            prev.map((order) => ({
              ...order,
              externalJobs: (order.externalJobs ?? []).map((job) => {
                if (job.id !== externalJobId) {
                  return job;
                }
                updated = {
                  ...job,
                  ...patch,
                  statusHistory:
                    patch.status && patch.status !== job.status
                      ? [
                          {
                            id: `ext-h-${Date.now()}`,
                            status: patch.status,
                            changedBy: user.name || "User",
                            changedByRole: user.role,
                            changedAt: new Date().toISOString(),
                          },
                          ...(job.statusHistory ?? []),
                        ]
                      : job.statusHistory,
                } as ExternalJob;
                return updated;
              }),
            })),
          );
          return updated;
        }

        const updatePayload: Record<string, unknown> = {};
        if (patch.partnerId !== undefined)
          updatePayload.partner_id = patch.partnerId || null;
        if (patch.partnerName !== undefined)
          updatePayload.partner_name = patch.partnerName;
        if (patch.partnerEmail !== undefined)
          updatePayload.partner_email = patch.partnerEmail || null;
        if (patch.partnerRequestComment !== undefined)
          updatePayload.partner_request_comment =
            patch.partnerRequestComment || null;
        if (patch.partnerResponseNote !== undefined)
          updatePayload.partner_response_note =
            patch.partnerResponseNote || null;
        if (patch.externalOrderNumber !== undefined)
          updatePayload.external_order_number = patch.externalOrderNumber;
        if (patch.quantity !== undefined) updatePayload.quantity = patch.quantity;
        if (patch.dueDate !== undefined) updatePayload.due_date = patch.dueDate;
        if (patch.status !== undefined) updatePayload.status = patch.status;
        if (patch.deliveryNoteNo !== undefined)
          updatePayload.delivery_note_no = patch.deliveryNoteNo;
        if (patch.receivedAt !== undefined)
          updatePayload.received_at = patch.receivedAt;
        if (patch.receivedBy !== undefined)
          updatePayload.received_by = patch.receivedBy;

        const { data, error: updateError } = await supabase
          .from("external_jobs")
          .update(updatePayload)
          .eq("id", externalJobId)
          .select(
            `
            id,
            order_id,
            partner_id,
            partner_name,
            partner_email,
            external_order_number,
            quantity,
            due_date,
            status,
            request_mode,
            partner_request_comment,
            partner_request_sent_at,
            partner_request_viewed_at,
            partner_response_submitted_at,
            partner_response_order_number,
            partner_response_due_date,
            partner_response_note,
            delivery_note_no,
            received_at,
            received_by,
            created_at,
            external_job_attachments (
              id,
              name,
              url,
              added_by_name,
              added_by_role,
              created_at,
              size,
              mime_type,
              category
            )
          `,
          )
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update external job.");
          return null;
        }
        if (patch.status !== undefined) {
          await supabase.from("external_job_status_history").insert({
            tenant_id: user.tenantId,
            external_job_id: externalJobId,
            status: patch.status,
            changed_by_name: user.name,
            changed_by_role: user.role,
          });
        }
        const mapped = mapExternalJob(data);
        setOrders((prev) =>
          prev.map((order) => ({
            ...order,
            externalJobs: (order.externalJobs ?? []).map((job) =>
              job.id === externalJobId ? mapped : job,
            ),
          })),
        );
        return mapped;
      },
      removeExternalJob: async (externalJobId) => {
        if (!supabase) {
          setOrders((prev) =>
            prev.map((order) => ({
              ...order,
              externalJobs: (order.externalJobs ?? []).filter(
                (job) => job.id !== externalJobId,
              ),
            })),
          );
          return true;
        }
        const { error: deleteError } = await supabase
          .from("external_jobs")
          .delete()
          .eq("id", externalJobId);
        if (deleteError) {
          setError(deleteError.message);
          return false;
        }
        setOrders((prev) =>
          prev.map((order) => ({
            ...order,
            externalJobs: (order.externalJobs ?? []).filter(
              (job) => job.id !== externalJobId,
            ),
          })),
        );
        return true;
      },
      addExternalJobAttachment: async (externalJobId, attachment) => {
        if (!supabase || !user.tenantId) {
          const fallback: ExternalJobAttachment = {
            id: `ext-att-${Date.now()}`,
            name: attachment.name,
            url: attachment.url,
            addedBy: attachment.addedBy,
            addedByRole: attachment.addedByRole,
            createdAt: new Date().toISOString(),
            size: attachment.size,
            mimeType: attachment.mimeType,
            category: attachment.category,
          };
          setOrders((prev) =>
            prev.map((order) => ({
              ...order,
              externalJobs: (order.externalJobs ?? []).map((job) =>
                job.id === externalJobId
                  ? {
                      ...job,
                      attachments: [fallback, ...(job.attachments ?? [])],
                    }
                  : job,
              ),
            })),
          );
          return fallback;
        }

        const { data, error: insertError } = await supabase
          .from("external_job_attachments")
          .insert({
            tenant_id: user.tenantId,
            external_job_id: externalJobId,
            name: attachment.name,
            url: attachment.url ?? null,
            size: attachment.size ?? null,
            mime_type: attachment.mimeType ?? null,
            added_by_name: attachment.addedBy,
            added_by_role: attachment.addedByRole ?? null,
            category: attachment.category ?? null,
          })
          .select(
            `
            id,
            name,
            url,
            added_by_name,
            added_by_role,
            created_at,
            size,
            mime_type,
            category
          `,
          )
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add attachment.");
          return null;
        }
        const mapped = mapExternalJobAttachment(data);
        setOrders((prev) =>
          prev.map((order) => ({
            ...order,
            externalJobs: (order.externalJobs ?? []).map((job) =>
              job.id === externalJobId
                ? {
                    ...job,
                    attachments: [mapped, ...(job.attachments ?? [])],
                  }
                : job,
            ),
          })),
        );
        return mapped;
      },
      removeExternalJobAttachment: async (externalJobId, attachmentId) => {
        if (!supabase) {
          setOrders((prev) =>
            prev.map((order) => ({
              ...order,
              externalJobs: (order.externalJobs ?? []).map((job) =>
                job.id === externalJobId
                  ? {
                      ...job,
                      attachments: (job.attachments ?? []).filter(
                        (file) => file.id !== attachmentId,
                      ),
                    }
                  : job,
              ),
            })),
          );
          return true;
        }
        const { error: deleteError } = await supabase
          .from("external_job_attachments")
          .delete()
          .eq("id", attachmentId);
        if (deleteError) {
          setError(deleteError.message);
          return false;
        }
        setOrders((prev) =>
          prev.map((order) => ({
            ...order,
            externalJobs: (order.externalJobs ?? []).map((job) =>
              job.id === externalJobId
                ? {
                    ...job,
                    attachments: (job.attachments ?? []).filter(
                      (file) => file.id !== attachmentId,
                    ),
                  }
                : job,
            ),
          })),
        );
        return true;
      },
      syncAccountingOrders,
    }),
    [
      orders,
      isLoading,
      error,
      user.tenantId,
      user.name,
      user.role,
      levels,
      syncAccountingOrders,
      importOrdersFromExcel,
    ],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error("useOrders must be used within OrdersProvider");
  }
  return context;
}

