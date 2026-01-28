"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  Order,
  OrderAttachment,
  OrderComment,
  OrderStatus,
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

  const mapAttachment = (row: {
    id: string;
    name: string;
    url?: string | null;
    added_by_name?: string | null;
    added_by_role?: string | null;
    created_at: string;
    size?: number | null;
    mime_type?: string | null;
  }): OrderAttachment => ({
    id: row.id,
    name: row.name,
    url: row.url ?? undefined,
    addedBy: row.added_by_name ?? "Unknown",
    addedByRole: row.added_by_role ?? undefined,
    createdAt: row.created_at,
    size: row.size ?? undefined,
    mimeType: row.mime_type ?? undefined,
  });

  const mapComment = (row: {
    id: string;
    message: string;
    author_name?: string | null;
    author_role?: string | null;
    created_at: string;
  }): OrderComment => ({
    id: row.id,
    message: row.message,
    author: row.author_name ?? "Unknown",
    authorRole: row.author_role ?? undefined,
    createdAt: row.created_at,
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
    status: OrderStatus;
    source?: "manual" | "accounting" | null;
    external_id?: string | null;
    source_payload?: Record<string, unknown> | null;
    synced_at?: string | null;
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
      author_name?: string | null;
      author_role?: string | null;
      created_at: string;
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
    status: row.status,
    source: row.source ?? undefined,
    externalId: row.external_id ?? undefined,
    sourcePayload: row.source_payload ?? undefined,
    syncedAt: row.synced_at ?? undefined,
    attachments: row.order_attachments?.map(mapAttachment) ?? undefined,
    comments: row.order_comments?.map(mapComment) ?? undefined,
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
          mime_type
        ),
        order_comments (
          id,
          message,
          author_name,
          author_role,
          created_at
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
          status: "pending",
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
        status: "pending",
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
              mime_type
            ),
            order_comments (
              id,
              message,
              author_name,
              author_role,
              created_at
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
              author_name: order.authorName ?? "System",
              author_role: order.authorRole ?? null,
            })
            .select(
              `
              id,
              message,
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
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId ? { ...order, ...patch } : order,
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
        if (existingOrder?.source === "accounting") {
          updatePayload.source = "manual";
        }
        const { data, error: updateError } = await supabase
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
              mime_type
            ),
            order_comments (
              id,
              message,
              author_name,
              author_role,
              created_at
            )
          `,
          )
          .single();
        if (updateError) {
          setError(updateError.message);
          notify({
            title: "Order not updated",
            description: updateError.message,
            variant: "error",
          });
          return null;
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
            mime_type
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
            author_name: comment.author,
            author_role: comment.authorRole ?? null,
          })
          .select(
            `
            id,
            message,
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
