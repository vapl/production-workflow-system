"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OrdersTable } from "./components/OrdersTable";
import { OrdersCards } from "./components/OrdersCards";
import { OrdersToolbar, type StatusOption } from "./components/OrdersToolbar";
import type { Order, OrderStatus } from "@/types/orders";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  PanelRightIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
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
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Checkbox } from "@/components/ui/Checkbox";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { ViewModeToggle } from "./components/ViewModeToggle";
import { FilterOptionSelector } from "@/components/ui/StatusChipsFilter";
import { Input } from "@/components/ui/Input";

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
  const isEngineeringUser = user.role.toLowerCase().startsWith("engineer");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const roleStatusOptions = useMemo<StatusOption[]>(() => {
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
    const build = (statuses: OrderStatus[]): StatusOption[] =>
      statuses
        .filter((status) => rules.orderStatusConfig?.[status]?.isActive ?? true)
        .map((status) => ({
          value: status,
          label: rules.statusLabels?.[status] ?? formatOrderStatus(status),
        }));

    if (isEngineeringUser) {
      return [{ value: "all", label: "All" }, ...build(engineeringStatuses)];
    }
    if (user.role === "Production") {
      return build(productionStatuses);
    }
    if (user.role === "Sales") {
      return [{ value: "all", label: "All" }, ...build(salesStatuses)];
    }
    return [{ value: "all", label: "All" }, ...build(salesStatuses)];
  }, [
    isEngineeringUser,
    rules.orderStatusConfig,
    rules.statusLabels,
    user.role,
  ]);
  const defaultStatusFilter: OrderStatus | "all" =
    roleStatusOptions[0]?.value ?? "all";
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
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
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
        ? (avatarMap.get(order.assignedEngineerId) ?? undefined)
        : undefined,
      assignedManagerAvatarUrl: order.assignedManagerId
        ? (avatarMap.get(order.assignedManagerId) ?? undefined)
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
      const displayStatus: OrderStatus =
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
    const media = window.matchMedia("(max-width: 767px)");
    const applyDefault = () => {
      if (media.matches) {
        setViewMode("cards");
        return;
      }
      const stored = window.localStorage.getItem("pws-orders-view");
      if (stored === "table" || stored === "cards") {
        setViewMode(stored);
      } else {
        setViewMode("table");
      }
    };
    applyDefault();
    media.addEventListener("change", applyDefault);
    return () => media.removeEventListener("change", applyDefault);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.matchMedia("(max-width: 767px)").matches) {
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
    if (!isMobileActionsOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileActionsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileActionsOpen]);

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

  useEffect(() => {
    if (!isMobileSearchOpen && !isMobileFiltersOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSearchOpen(false);
        setIsMobileFiltersOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileSearchOpen, isMobileFiltersOpen]);

  useEffect(() => {
    const hasMobileDrawerOpen = isMobileActionsOpen || isMobileFiltersOpen;
    if (!hasMobileDrawerOpen) {
      return;
    }
    if (window.innerWidth >= 768) {
      return;
    }

    const scrollY = window.scrollY;
    const {
      overflow: previousOverflow,
      position: previousPosition,
      top: previousTop,
      left: previousLeft,
      right: previousRight,
      width: previousWidth,
    } = document.body.style;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.left = previousLeft;
      document.body.style.right = previousRight;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isMobileActionsOpen, isMobileSearchOpen, isMobileFiltersOpen]);

  useEffect(() => {
    setStatusFilter(defaultStatusFilter);
  }, [defaultStatusFilter]);
  useEffect(() => {
    if (isEngineeringUser) {
      setAssignmentFilter("queue");
    }
  }, [isEngineeringUser]);

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
          : (contractLabelMap.get(contractId) ?? contractId);
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

  const getLocalFilteredOrders = (source: Order[]) => {
    let filtered = source;
    if (isEngineeringUser) {
      filtered = filtered.filter((order) =>
        assignmentFilter === "queue"
          ? !order.assignedEngineerId
          : order.assignedEngineerId === user.id,
      );
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q.length > 0) {
      filtered = filtered.filter((order) =>
        [order.orderNumber, order.customerName, order.productName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (partnerGroupFilter) {
      const groupPartnerIds = new Set(
        partners
          .filter((partner) => partner.groupId === partnerGroupFilter)
          .map((partner) => partner.id),
      );
      filtered = filtered.filter((order) =>
        (order.externalJobs ?? []).some(
          (job) => !!job.partnerId && groupPartnerIds.has(job.partnerId),
        ),
      );
    }
    return filtered;
  };

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
      const localFiltered = getLocalFilteredOrders(orders);
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

    const sb = supabase;
    const fetchOrdersPage = async (offset: number, append: boolean) => {
      setIsListLoading(true);
      try {
        if (!sb) {
          return;
        }
        const query = sb
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
        if (isEngineeringUser) {
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
          const fallback = getLocalFilteredOrders(orders);
          setVisibleOrders(fallback);
          setTotalOrders(fallback.length);
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
        if (!append && enriched.length === 0 && orders.length > 0) {
          const fallback = getLocalFilteredOrders(orders);
          setVisibleOrders(fallback);
          setTotalOrders(fallback.length);
          return;
        }
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
    isEngineeringUser,
    user.id,
  ]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;

    const fetchCounts = async () => {
      const baseQuery = sb.from("orders");
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
    <section className="space-y-0 pt-16 md:space-y-4 md:pt-0">
      <MobilePageTitle
        title="Customer Orders"
        showCompact={showCompactMobileTitle}
        subtitle="Plan customer orders, sync accounting data, and manage delivery workflow."
        className="pt-6 pb-6"
      />

      <BottomSheet
        id="orders-actions-drawer"
        open={isMobileActionsOpen}
        onClose={() => setIsMobileActionsOpen(false)}
        ariaLabel="Customer order actions"
        closeButtonLabel="Close customer orders actions"
        title="Order actions"
        enableSwipeToClose
      >
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            <Link
              href="/orders/external"
              onClick={() => setIsMobileActionsOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground hover:bg-muted/60"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Partner Orders
            </Link>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={async () => {
                setIsSyncing(true);
                await syncAccountingOrders();
                setIsSyncing(false);
                setIsMobileActionsOpen(false);
              }}
              disabled={isSyncing}
            >
              <RefreshCwIcon
                className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "Syncing..." : "Sync Accounting"}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                const levelNames = levels.map((level) => level.name);
                const blob = buildOrdersTemplate(levelNames);
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "pws-orders-template.xlsx";
                anchor.click();
                URL.revokeObjectURL(url);
                setIsMobileActionsOpen(false);
              }}
            >
              <DownloadIcon className="h-4 w-4" />
              Download template
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                setIsImportOpen(true);
                setIsMobileActionsOpen(false);
              }}
            >
              <FileSpreadsheetIcon className="h-4 w-4" />
              Import Excel
            </Button>
            <div className="pt-2">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                View mode
              </div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
        ariaLabel="Search orders"
        closeButtonLabel="Close search"
        title="Search"
        enableSwipeToClose
      >
        <div className="px-4 pt-3">
          <label className="ui-field">
            <span className="sr-only">Search</span>
            <Input
              type="search"
              icon="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search orders, customers, products..."
              className="text-[16px] md:text-sm"
              endAdornment={
                searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                    }}
                    aria-label="Clear search"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                ) : null
              }
            />
          </label>
        </div>
      </BottomSheet>

      <BottomSheet
        open={isMobileFiltersOpen}
        onClose={() => setIsMobileFiltersOpen(false)}
        ariaLabel="Order filters"
        closeButtonLabel="Close filters"
        title="Filters"
        enableSwipeToClose
      >
        <div className="space-y-4 px-4 pt-3">
          <div>
            <FilterOptionSelector
              title="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={roleStatusOptions.map((option) => ({
                value: option.value,
                label: option.label,
                count: statusCounts[option.value] ?? 0,
              }))}
            />
          </div>
          {isEngineeringUser ? (
            <div>
              <FilterOptionSelector
                title="Engineering"
                value={assignmentFilter}
                onChange={(value) =>
                  setAssignmentFilter(value as "queue" | "my")
                }
                options={[
                  { value: "queue", label: "Queue" },
                  { value: "my", label: "My work" },
                ]}
              />
            </div>
          ) : null}
          <Checkbox
            checked={groupByContract}
            onChange={() => setGroupByContract((prev) => !prev)}
            label="Group by Contract"
          />
        </div>
      </BottomSheet>

      <DesktopPageHeader
        sticky
        title="Customer Orders"
        subtitle="Plan customer orders, sync accounting data, and manage delivery workflow."
        className="md:z-20"
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/orders/external">
              <Button variant="outline" className="gap-2">
                <ExternalLinkIcon className="h-4 w-4" />
                Partner Orders
              </Button>
            </Link>
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                setIsSyncing(true);
                await syncAccountingOrders();
                setIsSyncing(false);
              }}
              disabled={isSyncing}
            >
              <RefreshCwIcon
                className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "Syncing..." : "Sync Accounting"}
            </Button>
            <div className="relative" ref={importMenuRef}>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setIsImportMenuOpen((prev) => !prev)}
              >
                <UploadIcon className="h-4 w-4" />
                Import
              </Button>
              {isImportMenuOpen && (
                <div className="absolute right-0 top-11 z-50 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
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
                    <DownloadIcon className="h-4 w-4" />
                    Download template
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => {
                      setIsImportOpen(true);
                      setIsImportMenuOpen(false);
                    }}
                  >
                    <FileSpreadsheetIcon className="h-4 w-4" />
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
        }
      />

      <Card className="rounded-none border-0 bg-transparent shadow-none">
        <CardContent className="space-y-4 px-0">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="hidden md:block">
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
                isEngineeringUser ? assignmentFilter : undefined
              }
              onAssignmentChange={
                isEngineeringUser ? setAssignmentFilter : undefined
              }
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
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
                      if (isEngineeringUser) {
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
                        const orderIds =
                          await getOrderIdsForPartnerGroup(partnerGroupFilter);
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
                        assignedEngineerId:
                          row.assigned_engineer_id ?? undefined,
                        assignedEngineerName:
                          row.assigned_engineer_name ?? undefined,
                        assignedManagerId: row.assigned_manager_id ?? undefined,
                        assignedManagerName:
                          row.assigned_manager_name ?? undefined,
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
                      const withProduction =
                        await applyProductionStatus(mapped);
                      const enriched =
                        await resolveOrderAvatars(withProduction);
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
      <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-30 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={() => setIsMobileFiltersOpen(true)}
              aria-label="Open filters"
            >
              <SlidersHorizontalIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={() => setIsMobileSearchOpen(true)}
              aria-label="Open search"
            >
              <SearchIcon className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              onClick={() => setIsMobileActionsOpen(true)}
              aria-label="Open customer orders actions"
              aria-haspopup="dialog"
              aria-expanded={isMobileActionsOpen}
              aria-controls="orders-actions-drawer"
            >
              <PanelRightIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-[calc(10.75rem+env(safe-area-inset-bottom))] z-30 flex justify-end md:hidden">
        <Button
          className="h-11 max-w-full rounded-full px-4 shadow-lg"
          onClick={() => {
            setEditingOrder(null);
            setIsModalOpen(true);
          }}
          disabled={!canEditOrDeleteOrders}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          New Order
        </Button>
      </div>
    </section>
  );
}
