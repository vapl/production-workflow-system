"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OrdersTable } from "./components/OrdersTable";
import { OrdersCards } from "./components/OrdersCards";
import { OrdersToolbar } from "./components/OrdersToolbar";
import type { Order, OrderStatus } from "@/types/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "lucide-react";
import { OrderModal } from "./components/OrderModal";
import { useOrders } from "@/app/orders/OrdersContext";
import { useHierarchy } from "@/app/settings/HierarchyContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { buildOrdersTemplate } from "@/lib/excel/ordersExcel";
import { ImportWizard } from "./components/ImportWizard";
import { usePartners } from "@/hooks/usePartners";
import { supabase, supabaseAvatarBucket } from "@/lib/supabaseClient";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatOrderStatus } from "@/lib/domain/formatters";
import { useRbac } from "@/contexts/RbacContext";

export default function OrdersPage() {
  const {
    orders,
    addOrder,
    updateOrder,
    removeOrder,
    error,
    syncAccountingOrders,
  } = useOrders();
  const { nodes, levels } = useHierarchy();
  const user = useCurrentUser();
  const { hasPermission } = useRbac();
  const { rules } = useWorkflowRules();
  const { activeGroups, partners } = usePartners();
  const canEditOrDeleteOrders = hasPermission("orders.manage");
  const engineerLabel = rules.assignmentLabels?.engineer ?? "Engineer";
  const managerLabel = rules.assignmentLabels?.manager ?? "Manager";
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const roleStatusOptions = useMemo(() => {
    const engineeringStatuses: OrderStatus[] = [
      "ready_for_engineering",
      "in_engineering",
      "engineering_blocked",
      "ready_for_production",
      "in_production",
    ];
    const salesStatuses: OrderStatus[] = [
      "draft",
      "ready_for_engineering",
      "in_engineering",
      "engineering_blocked",
      "ready_for_production",
      "in_production",
    ];
    const productionStatuses: OrderStatus[] = [
      "ready_for_production",
      "in_production",
    ];
    const build = (statuses: OrderStatus[]) =>
      statuses
        .filter((status) => rules.orderStatusConfig?.[status]?.isActive ?? true)
        .map((status) => ({
          value: status,
          label: rules.statusLabels?.[status] ?? formatOrderStatus(status),
        }));

    if (user.role === "Engineering") {
      return build(engineeringStatuses);
    }
    if (user.role === "Production") {
      return build(productionStatuses);
    }
    if (user.role === "Sales") {
      return [
        { value: "all", label: "All" },
        ...build(salesStatuses),
      ];
    }
    return [
      { value: "all", label: "All" },
      ...build(salesStatuses),
    ];
  }, [rules.orderStatusConfig, rules.statusLabels, user.role]);
  const defaultStatusFilter =
    roleStatusOptions[0]?.value ?? ("all" as const);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">(
    defaultStatusFilter,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);
  const [groupByContract, setGroupByContract] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncStartedRef = useRef(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const [partnerGroupFilter, setPartnerGroupFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"queue" | "my">(
    "queue",
  );
  const [visibleOrders, setVisibleOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listOffset, setListOffset] = useState(0);
  const pageSize = 20;

  const getStoragePathFromUrl = (url: string, bucket: string) => {
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
  };

  const resolveSignedAvatarUrl = async (url?: string | null) => {
    if (!supabase || !url) {
      return url ?? null;
    }
    const storagePath = getStoragePathFromUrl(url, supabaseAvatarBucket);
    if (!storagePath) {
      return url;
    }
    const { data } = await supabase.storage
      .from(supabaseAvatarBucket)
      .createSignedUrl(storagePath, 60 * 60);
    return data?.signedUrl ?? url;
  };

  const resolveOrderAvatars = async (rows: Order[]) => {
    if (!supabase) {
      return rows;
    }
    const ids = new Set<string>();
    rows.forEach((order) => {
      if (order.assignedEngineerId) {
        ids.add(order.assignedEngineerId);
      }
      if (order.assignedManagerId) {
        ids.add(order.assignedManagerId);
      }
    });
    if (ids.size === 0) {
      return rows;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", Array.from(ids));
    if (!data) {
      return rows;
    }
    const avatarMap = new Map<string, string | null>();
    await Promise.all(
      data.map(async (profile) => {
        const resolved = await resolveSignedAvatarUrl(profile.avatar_url);
        avatarMap.set(profile.id, resolved ?? null);
      }),
    );
    return rows.map((order) => ({
      ...order,
      assignedEngineerAvatarUrl: order.assignedEngineerId
        ? avatarMap.get(order.assignedEngineerId) ?? undefined
        : undefined,
      assignedManagerAvatarUrl: order.assignedManagerId
        ? avatarMap.get(order.assignedManagerId) ?? undefined
        : undefined,
    }));
  };

  const applyProductionStatus = async (rows: Order[]) => {
    if (!supabase) {
      return rows;
    }
    const orderIds = rows.map((row) => row.id).filter(Boolean);
    if (orderIds.length === 0) {
      return rows;
    }
    const { data, error: prodError } = await supabase
      .from("production_items")
      .select("order_id, status")
      .in("order_id", orderIds);
    if (prodError || !data) {
      return rows;
    }
    const counts = new Map<string, { total: number; done: number }>();
    data.forEach((item) => {
      const entry = counts.get(item.order_id) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (item.status === "done") {
        entry.done += 1;
      }
      counts.set(item.order_id, entry);
    });
    return rows.map((row) => {
      const stat = counts.get(row.id);
      if (!stat || stat.total === 0) {
        return row;
      }
      const displayStatus =
        stat.done > 0 && stat.done === stat.total ? "done" : "in_production";
      return {
        ...row,
        statusDisplay: displayStatus,
      };
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("pws-orders-view");
    if (stored === "table" || stored === "cards") {
      setViewMode(stored);
      return;
    }
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    setViewMode(isMobile ? "cards" : "table");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("pws-orders-view", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (syncStartedRef.current) {
      return;
    }
    if (levels.length === 0) {
      return;
    }
    syncStartedRef.current = true;
    void syncAccountingOrders();
  }, [levels, syncAccountingOrders]);

  useEffect(() => {
    if (!isImportMenuOpen) {
      return;
    }
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (importMenuRef.current && !importMenuRef.current.contains(target)) {
        setIsImportMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isImportMenuOpen]);

  useEffect(() => {
    setStatusFilter(defaultStatusFilter);
  }, [defaultStatusFilter]);
  useEffect(() => {
    if (user.role === "Engineering") {
      setAssignmentFilter("queue");
    }
  }, [user.role]);

  const [statusCounts, setStatusCounts] = useState<
    Partial<Record<OrderStatus | "all", number>>
  >({});

  const contractLevel = useMemo(
    () => levels.find((level) => level.key === "contract"),
    [levels],
  );
  const contractLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((node) => {
      map.set(node.id, node.label);
    });
    return map;
  }, [nodes]);
  const groupedOrders = useMemo(() => {
    if (!groupByContract || !contractLevel) {
      return [];
    }
    const groups = new Map<string, Order[]>();
    visibleOrders.forEach((order) => {
      const contractId = order.hierarchy?.[contractLevel.id] ?? "none";
      const label =
        contractId === "none"
          ? "No contract"
          : contractLabelMap.get(contractId) ?? contractId;
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)?.push(order);
    });
    return Array.from(groups.entries()).map(([label, orders]) => ({
      label,
      orders,
    }));
  }, [contractLabelMap, contractLevel, visibleOrders, groupByContract]);

  async function getOrderIdsForPartnerGroup(groupId: string) {
    if (!supabase || !user.tenantId) {
      return [];
    }
    const partnerIds = partners
      .filter((partner) => partner.groupId === groupId)
      .map((partner) => partner.id);
    if (partnerIds.length === 0) {
      return [];
    }
    const { data, error } = await supabase
      .from("external_jobs")
      .select("order_id")
      .in("partner_id", partnerIds)
      .eq("tenant_id", user.tenantId);
    if (error || !data) {
      return [];
    }
    return Array.from(new Set(data.map((row) => row.order_id)));
  }

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      const localFiltered =
        user.role === "Engineering"
          ? orders.filter((order) =>
              assignmentFilter === "queue"
                ? !order.assignedEngineerId
                : order.assignedEngineerId === user.id,
            )
          : orders;
      setVisibleOrders(localFiltered);
      setTotalOrders(localFiltered.length);
      const fallbackCounts: Partial<Record<OrderStatus | "all", number>> = {};
      roleStatusOptions.forEach((option) => {
        if (option.value === "all") {
          fallbackCounts.all = localFiltered.length;
          return;
        }
        fallbackCounts[option.value] = localFiltered.filter(
          (order) => order.status === option.value,
        ).length;
      });
      setStatusCounts(fallbackCounts);
      return;
    }
    let isMounted = true;

    const fetchOrdersPage = async (offset: number, append: boolean) => {
      setIsListLoading(true);
      try {
        const query = supabase
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
            assigned_manager_id,
            assigned_manager_name,
            order_attachments ( id ),
            order_comments ( id ),
            external_jobs ( partner_id, due_date, status )
          `,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (user.tenantId) {
          query.eq("tenant_id", user.tenantId);
        }
        if (statusFilter !== "all") {
          query.eq("status", statusFilter);
        }
        if (user.role === "Engineering") {
          if (assignmentFilter === "queue") {
            query.is("assigned_engineer_id", null);
          } else {
            query.eq("assigned_engineer_id", user.id);
          }
        }
        if (searchQuery.trim().length > 0) {
          const q = `%${searchQuery.trim()}%`;
          query.or(
            `order_number.ilike.${q},customer_name.ilike.${q},product_name.ilike.${q}`,
          );
        }
        if (partnerGroupFilter) {
          const orderIds = await getOrderIdsForPartnerGroup(partnerGroupFilter);
          if (orderIds.length === 0) {
            setVisibleOrders([]);
            setTotalOrders(0);
            return;
          }
          query.in("id", orderIds);
        }

        const { data, error: fetchError, count } = await query;
        if (!isMounted) {
          return;
        }
        if (fetchError) {
          return;
        }
        const mapped = (data ?? []).map((row) => ({
          id: row.id,
          orderNumber: row.order_number,
          customerName: row.customer_name,
          productName: row.product_name ?? undefined,
          quantity: row.quantity ?? undefined,
          hierarchy: row.hierarchy ?? undefined,
          dueDate: row.due_date,
          priority: row.priority,
          status: row.status,
          assignedEngineerId: row.assigned_engineer_id ?? undefined,
          assignedEngineerName: row.assigned_engineer_name ?? undefined,
          assignedManagerId: row.assigned_manager_id ?? undefined,
          assignedManagerName: row.assigned_manager_name ?? undefined,
          attachments: row.order_attachments?.map((item) => ({
            id: item.id,
            name: "Attachment",
            addedBy: "",
            createdAt: "",
          })),
          comments: row.order_comments?.map((item) => ({
            id: item.id,
            message: "",
            author: "",
            createdAt: "",
          })),
          attachmentCount: row.order_attachments?.length ?? 0,
          commentCount: row.order_comments?.length ?? 0,
          externalJobs: row.external_jobs?.map((job, index) => ({
            id: `${row.id}-ext-${index}`,
            orderId: row.id,
            partnerName: "Partner",
            externalOrderNumber: "",
            dueDate: job.due_date,
            status: job.status,
            createdAt: "",
            partnerId: job.partner_id ?? undefined,
          })),
        })) as Order[];
        const withProduction = await applyProductionStatus(mapped);
        const enriched = await resolveOrderAvatars(withProduction);
        setVisibleOrders((prev) =>
          append ? [...prev, ...enriched] : enriched,
        );
        setTotalOrders(count ?? mapped.length);
      } finally {
        if (isMounted) {
          setIsListLoading(false);
        }
      }
    };

    void fetchOrdersPage(0, false);
    setListOffset(0);

    return () => {
      isMounted = false;
    };
  }, [
    orders,
    assignmentFilter,
    partnerGroupFilter,
    partners,
    searchQuery,
    roleStatusOptions,
    statusFilter,
    user.isAuthenticated,
    user.loading,
    user.tenantId,
    user.role,
    user.id,
  ]);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;

    const fetchCounts = async () => {
      const baseQuery = supabase.from("orders");
      const counts: Partial<Record<OrderStatus | "all", number>> = {};
      const tasks = roleStatusOptions.map(async (option) => {
        if (option.value === "all") {
          let query = baseQuery
            .select("id", { count: "exact", head: true })
            .order("created_at", { ascending: false });
          if (user.tenantId) {
            query = query.eq("tenant_id", user.tenantId);
          }
          const { count } = await query;
          counts.all = count ?? 0;
          return;
        }
        let query = baseQuery
          .select("id", { count: "exact", head: true })
          .eq("status", option.value);
        if (user.tenantId) {
          query = query.eq("tenant_id", user.tenantId);
        }
        const { count } = await query;
        counts[option.value] = count ?? 0;
      });

      await Promise.all(tasks);
      if (!isMounted) {
        return;
      }
      setStatusCounts(counts);
    };

    void fetchCounts();

    return () => {
      isMounted = false;
    };
  }, [roleStatusOptions, user.isAuthenticated, user.loading, user.tenantId]);

  async function handleCreateOrder(values: {
    orderNumber: string;
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
    hierarchy?: Record<string, string>;
  }) {
    const newOrder = {
      orderNumber: values.orderNumber,
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
      hierarchy: values.hierarchy,
      dueDate: values.dueDate,
      priority: values.priority,
      status: "draft" as const,
      notes: values.notes,
      authorName: user.name,
      authorRole: user.role,
    };

    await addOrder(newOrder);
  }

  async function handleEditOrder(values: {
    orderNumber: string;
    customerName: string;
    customerEmail?: string;
    productName: string;
    quantity: number;
    dueDate: string;
    priority: "low" | "normal" | "high" | "urgent";
    notes?: string;
    hierarchy?: Record<string, string>;
  }) {
    if (!editingOrder || !canEditOrDeleteOrders) {
      return;
    }
    await updateOrder(editingOrder.id, {
      customerName: values.customerName,
      productName: values.productName,
      quantity: values.quantity,
      hierarchy: values.hierarchy,
      dueDate: values.dueDate,
      priority: values.priority,
    });
    setEditingOrder(null);
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Customer Orders</CardTitle>
          <div className="flex items-center gap-2">
            <Link href="/orders/external">
              <Button variant="outline">External Jobs</Button>
            </Link>
            <Button
              variant="outline"
              onClick={async () => {
                setIsSyncing(true);
                await syncAccountingOrders();
                setIsSyncing(false);
              }}
              disabled={isSyncing}
            >
              {isSyncing ? "Syncing..." : "Sync Accounting"}
            </Button>
            <div className="relative" ref={importMenuRef}>
              <Button
                variant="outline"
                onClick={() => setIsImportMenuOpen((prev) => !prev)}
              >
                Import
              </Button>
              {isImportMenuOpen && (
                <div className="absolute right-0 top-11 z-50 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => {
                      const levelNames = levels.map((level) => level.name);
                      const blob = buildOrdersTemplate(levelNames);
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = "pws-orders-template.xlsx";
                      anchor.click();
                      URL.revokeObjectURL(url);
                      setIsImportMenuOpen(false);
                    }}
                  >
                    Download template
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => {
                      setIsImportOpen(true);
                      setIsImportMenuOpen(false);
                    }}
                  >
                    Import Excel
                  </button>
                </div>
              )}
            </div>
            <Button
              className="gap-2"
              onClick={() => {
                setEditingOrder(null);
                setIsModalOpen(true);
              }}
              disabled={!canEditOrDeleteOrders}
            >
              <PlusIcon className="h-4 w-4" />
              New Order
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <OrdersToolbar
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onSearchChange={setSearchQuery}
            onStatusChange={setStatusFilter}
            groupByContract={groupByContract}
            onToggleGroupByContract={() =>
              setGroupByContract((prev) => !prev)
            }
            statusCounts={statusCounts}
            statusOptions={roleStatusOptions}
            partnerGroupOptions={activeGroups.map((group) => ({
              value: group.id,
              label: group.name,
            }))}
            partnerGroupFilter={partnerGroupFilter}
            onPartnerGroupChange={setPartnerGroupFilter}
            assignmentFilter={
              user.role === "Engineering" ? assignmentFilter : undefined
            }
            onAssignmentChange={
              user.role === "Engineering" ? setAssignmentFilter : undefined
            }
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
          {viewMode === "cards" ? (
            <OrdersCards
              orders={visibleOrders}
              groups={groupByContract ? groupedOrders : undefined}
              dueSoonDays={rules.dueSoonDays}
              dueIndicatorEnabled={rules.dueIndicatorEnabled}
              dueIndicatorStatuses={rules.dueIndicatorStatuses}
              engineerLabel={engineerLabel}
              managerLabel={managerLabel}
              onEdit={
                canEditOrDeleteOrders
                  ? (order) => {
                      setEditingOrder(order);
                      setIsModalOpen(true);
                    }
                  : undefined
              }
              onDelete={
                canEditOrDeleteOrders
                  ? (order) => {
                      setPendingDelete(order);
                    }
                  : undefined
              }
            />
          ) : (
            <OrdersTable
              orders={visibleOrders}
              groups={groupByContract ? groupedOrders : undefined}
              dueSoonDays={rules.dueSoonDays}
              dueIndicatorEnabled={rules.dueIndicatorEnabled}
              dueIndicatorStatuses={rules.dueIndicatorStatuses}
              engineerLabel={engineerLabel}
              managerLabel={managerLabel}
              onEdit={
                canEditOrDeleteOrders
                  ? (order) => {
                      setEditingOrder(order);
                      setIsModalOpen(true);
                    }
                  : undefined
              }
              onDelete={
                canEditOrDeleteOrders
                  ? (order) => {
                      setPendingDelete(order);
                    }
                  : undefined
              }
            />
          )}
          {isListLoading ? (
            <LoadingSpinner label="Loading orders..." />
          ) : (
            visibleOrders.length < totalOrders && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const nextOffset = listOffset + pageSize;
                    setListOffset(nextOffset);
                    setIsListLoading(true);
                    try {
                      if (!supabase || user.loading || !user.isAuthenticated) {
                        return;
                      }
                      const query = supabase
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
                          assigned_manager_id,
                          assigned_manager_name,
                          order_attachments ( id ),
                          order_comments ( id ),
                          external_jobs ( partner_id, due_date, status )
                        `,
                          { count: "exact" },
                        )
                        .order("created_at", { ascending: false })
                        .range(nextOffset, nextOffset + pageSize - 1);
                      if (user.tenantId) {
                        query.eq("tenant_id", user.tenantId);
                      }
                      if (statusFilter !== "all") {
                        query.eq("status", statusFilter);
                      }
                      if (user.role === "Engineering") {
                        if (assignmentFilter === "queue") {
                          query.is("assigned_engineer_id", null);
                        } else {
                          query.eq("assigned_engineer_id", user.id);
                        }
                      }
                      if (searchQuery.trim().length > 0) {
                        const q = `%${searchQuery.trim()}%`;
                        query.or(
                          `order_number.ilike.${q},customer_name.ilike.${q},product_name.ilike.${q}`,
                        );
                      }
                      if (partnerGroupFilter) {
                        const orderIds = await getOrderIdsForPartnerGroup(
                          partnerGroupFilter,
                        );
                        if (orderIds.length === 0) {
                          return;
                        }
                        query.in("id", orderIds);
                      }
                      const { data } = await query;
                      const mapped = (data ?? []).map((row) => ({
                        id: row.id,
                        orderNumber: row.order_number,
                        customerName: row.customer_name,
                        productName: row.product_name ?? undefined,
                        quantity: row.quantity ?? undefined,
                        hierarchy: row.hierarchy ?? undefined,
                        dueDate: row.due_date,
                        priority: row.priority,
                        status: row.status,
                        assignedEngineerId: row.assigned_engineer_id ?? undefined,
                        assignedEngineerName: row.assigned_engineer_name ?? undefined,
                        assignedManagerId: row.assigned_manager_id ?? undefined,
                        assignedManagerName: row.assigned_manager_name ?? undefined,
                        attachments: row.order_attachments?.map((item) => ({
                          id: item.id,
                          name: "Attachment",
                          addedBy: "",
                          createdAt: "",
                        })),
                        comments: row.order_comments?.map((item) => ({
                          id: item.id,
                          message: "",
                          author: "",
                          createdAt: "",
                        })),
                        attachmentCount: row.order_attachments?.length ?? 0,
                        commentCount: row.order_comments?.length ?? 0,
                        externalJobs: row.external_jobs?.map((job, index) => ({
                          id: `${row.id}-ext-${index}`,
                          orderId: row.id,
                          partnerName: "Partner",
                          externalOrderNumber: "",
                          dueDate: job.due_date,
                          status: job.status,
                          createdAt: "",
                          partnerId: job.partner_id ?? undefined,
                        })),
                      })) as Order[];
                      const withProduction = await applyProductionStatus(mapped);
                      const enriched = await resolveOrderAvatars(withProduction);
                      setVisibleOrders((prev) => [...prev, ...enriched]);
                    } finally {
                      setIsListLoading(false);
                    }
                  }}
                >
                  Load more
                </Button>
              </div>
            )
          )}
        </CardContent>
      </Card>
      <OrderModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingOrder(null);
        }}
        onSubmit={editingOrder ? handleEditOrder : handleCreateOrder}
        title={editingOrder ? "Edit Order" : "Create New Order"}
        submitLabel={editingOrder ? "Save Changes" : "Create Order"}
        editMode="full"
        initialValues={
          editingOrder
            ? {
                orderNumber: editingOrder.orderNumber,
                customerName: editingOrder.customerName,
                productName: editingOrder.productName ?? "",
                quantity: editingOrder.quantity ?? 1,
                dueDate: editingOrder.dueDate,
                priority: editingOrder.priority,
                hierarchy: editingOrder.hierarchy,
              }
            : undefined
        }
        existingOrderNumbers={orders.map((order) => order.orderNumber)}
      />
      <ImportWizard
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete order?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {`This will remove ${pendingDelete.orderNumber} from the list.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              {canEditOrDeleteOrders ? (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await removeOrder(pendingDelete.id);
                    setPendingDelete(null);
                  }}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
