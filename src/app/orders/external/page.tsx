"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { useOrders } from "@/app/orders/OrdersContext";
import { usePartners } from "@/hooks/usePartners";
import type {
  ExternalJobFieldRole,
  ExternalJobFieldType,
  ExternalJobStatus,
} from "@/types/orders";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { SelectField } from "@/components/ui/SelectField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { FilterOptionSelector } from "@/components/ui/StatusChipsFilter";
import { DataTable } from "@/components/ui/DataTable";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/domain/formatters";
import { getStatusBadgeColorClass } from "@/lib/domain/statusBadgeColor";

const defaultExternalStatusLabels: Record<ExternalJobStatus, string> = {
  requested: "Requested",
  ordered: "Ordered",
  in_progress: "In progress",
  delivered: "In Stock",
  approved: "Approved",
  cancelled: "Cancelled",
};
const externalStatusValues: ExternalJobStatus[] = [
  "requested",
  "ordered",
  "in_progress",
  "delivered",
  "approved",
  "cancelled",
];

const statusVariant = (status: ExternalJobStatus) => {
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

const externalJobsSelect = `
          id,
          order_id,
          partner_id,
          partner_name,
          external_order_number,
          request_mode,
          partner_response_order_number,
          quantity,
          due_date,
          partner_response_due_date,
          status,
          received_at,
          partner_request_sender_name,
          external_job_status_history (
            id,
            status,
            changed_by_name,
            changed_by_role,
            changed_at
          ),
          orders (
            order_number,
            customer_name
          )
        `;

type ExternalListField = {
  id: string;
  key: string;
  label: string;
  fieldType: ExternalJobFieldType;
  fieldRole?: ExternalJobFieldRole;
  showInTable?: boolean;
  aiEnabled?: boolean;
  aiMatchOnly?: boolean;
  aiAliases?: string[];
  unit?: string;
  sortOrder: number;
  semantic: "external_order" | "due_date" | "unit_price" | "other";
};

type ExternalTableColumnSetting = {
  id: string;
  visible: boolean;
  label?: string;
};

type ExternalJobOrderJoin =
  | {
      order_number?: string | null;
      customer_name?: string | null;
    }
  | Array<{
      order_number?: string | null;
      customer_name?: string | null;
    }>
  | null
  | undefined;

function normalizeFieldToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getFieldSemantic(field: { key: string; label: string }) {
  const tokens = new Set([
    normalizeFieldToken(field.key),
    normalizeFieldToken(field.label),
  ]);
  if (
    tokens.has("external_order_number") ||
    tokens.has("external_order_no") ||
    tokens.has("order_number") ||
    tokens.has("ext_order")
  ) {
    return "external_order" as const;
  }
  if (tokens.has("due_date") || tokens.has("due")) {
    return "due_date" as const;
  }
  if (
    tokens.has("unit_price") ||
    tokens.has("price") ||
    tokens.has("sum_without_vat") ||
    tokens.has("amount_ex_vat")
  ) {
    return "unit_price" as const;
  }
  return "other" as const;
}

function inferPriceRole(field: { key: string; label: string }) {
  const key = normalizeFieldToken(field.key);
  const label = normalizeFieldToken(field.label);
  const token = `${key} ${label}`;
  const isInvoice =
    token.includes("invoice") ||
    token.includes("received_price") ||
    token.includes("facture") ||
    token.includes("rechnung");
  if (isInvoice) {
    return "invoice_price" as const;
  }
  const isPlanned =
    token.includes("unit_price") ||
    token.includes("without_vat") ||
    token.includes("planned_price") ||
    token.includes("target_price");
  if (isPlanned) {
    return "planned_price" as const;
  }
  return "none" as const;
}

function isEmptyValue(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  );
}

export default function ExternalJobsPage() {
  const { orders } = useOrders();
  const { activeGroups, activePartners } = usePartners();
  const user = useCurrentUser();
  const { rules } = useWorkflowRules();
  const externalStatusLabels = useMemo(
    () => ({
      ...defaultExternalStatusLabels,
      ...rules.externalJobStatusLabels,
    }),
    [rules.externalJobStatusLabels],
  );
  const visibleExternalStatuses = useMemo(
    () =>
      externalStatusValues.filter(
        (status) => rules.externalJobStatusConfig?.[status]?.isActive ?? true,
      ),
    [rules.externalJobStatusConfig],
  );
  const statusOptions = useMemo(
    () => [
      { value: "all" as const, label: "All" },
      ...visibleExternalStatuses.map((status) => ({
        value: status,
        label:
          externalStatusLabels[status] ?? defaultExternalStatusLabels[status],
      })),
    ],
    [externalStatusLabels, visibleExternalStatuses],
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExternalJobStatus | "all">(
    "all",
  );
  const [partnerGroupFilter, setPartnerGroupFilter] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [jobs, setJobs] = useState<
    Array<{
      id: string;
      orderNumber: string;
      customerName: string;
      partnerName: string;
      partnerId?: string;
      externalOrderNumber: string;
      requestMode?: "manual" | "partner_portal";
      partnerResponseOrderNumber?: string;
      dueDate: string;
      partnerResponseDueDate?: string;
      quantity?: number;
      status: ExternalJobStatus;
      receivedAt?: string | null;
      partnerRequestSenderName?: string;
      statusHistory?: Array<{
        id: string;
        status: ExternalJobStatus;
        changedBy: string;
        changedByRole?: string;
        changedAt: string;
      }>;
    }>
  >([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const pageSize = 20;
  const [stats, setStats] = useState({
    total: 0,
    overdue: 0,
    dueSoon: 0,
  });
  const [externalListFields, setExternalListFields] = useState<
    ExternalListField[]
  >([]);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [externalFieldValuesByJobId, setExternalFieldValuesByJobId] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [priceReconciliationEnabled, setPriceReconciliationEnabled] =
    useState(false);
  const [externalTableColumnsConfig, setExternalTableColumnsConfig] = useState<
    ExternalTableColumnSetting[]
  >([]);
  const mapExternalJobRow = (row: {
    id: string;
    partner_id?: string | null;
    partner_name?: string | null;
    external_order_number: string;
    request_mode?: "manual" | "partner_portal" | null;
    partner_response_order_number?: string | null;
    due_date: string;
    partner_response_due_date?: string | null;
    quantity?: number | null;
    status: ExternalJobStatus;
    received_at?: string | null;
    partner_request_sender_name?: string | null;
    external_job_status_history?: Array<{
      id: string;
      status: ExternalJobStatus;
      changed_by_name?: string | null;
      changed_by_role?: string | null;
      changed_at: string;
    }>;
    orders?: ExternalJobOrderJoin;
  }) => {
    const order = Array.isArray(row.orders)
      ? row.orders[0]
      : (row.orders ?? undefined);
    return {
      id: row.id,
      orderNumber: order?.order_number ?? "-",
      customerName: order?.customer_name ?? "-",
      partnerName: row.partner_name ?? "-",
      partnerId: row.partner_id ?? undefined,
      externalOrderNumber: row.external_order_number,
      requestMode: row.request_mode ?? undefined,
      partnerResponseOrderNumber:
        row.partner_response_order_number ?? undefined,
      dueDate: row.due_date,
      partnerResponseDueDate: row.partner_response_due_date ?? undefined,
      quantity: row.quantity ?? undefined,
      status: row.status,
      receivedAt: row.received_at ?? null,
      partnerRequestSenderName: row.partner_request_sender_name ?? undefined,
      statusHistory: (row.external_job_status_history ?? []).map((entry) => ({
        id: entry.id,
        status: entry.status,
        changedBy: entry.changed_by_name ?? "Unknown",
        changedByRole: entry.changed_by_role ?? undefined,
        changedAt: entry.changed_at,
      })),
    };
  };
  const getEffectiveDueDate = useCallback(
    (job: { dueDate: string; partnerResponseDueDate?: string }) =>
      job.partnerResponseDueDate || job.dueDate,
    [],
  );
  const getDisplayExternalOrder = useCallback((job: (typeof jobs)[number]) => {
    if (job.requestMode === "partner_portal") {
      return (
        job.partnerResponseOrderNumber || `pending from ${job.partnerName}`
      );
    }
    return job.externalOrderNumber || "--";
  }, []);
  const getDisplayDueDate = useCallback(
    (job: (typeof jobs)[number]) => {
      if (job.requestMode === "partner_portal" && !job.partnerResponseDueDate) {
        return `pending from ${job.partnerName}`;
      }
      const dateValue = getEffectiveDueDate(job);
      return dateValue ? formatDate(dateValue) : "--";
    },
    [getEffectiveDueDate],
  );
  const getFieldDisplayValue = useCallback(
    (job: (typeof jobs)[number], field: ExternalListField) => {
      const rawValue = externalFieldValuesByJobId[job.id]?.[field.id];
      const isPortal = job.requestMode === "partner_portal";
      const pendingLabel = `pending from ${job.partnerName}`;
      if (field.semantic === "external_order") {
        const fallback = isPortal
          ? job.partnerResponseOrderNumber
          : job.externalOrderNumber;
        const value = isEmptyValue(rawValue) ? fallback : rawValue;
        if (isEmptyValue(value)) {
          return isPortal ? pendingLabel : "--";
        }
        return String(value);
      }
      if (field.semantic === "due_date") {
        const fallback = isPortal ? job.partnerResponseDueDate : job.dueDate;
        const value = isEmptyValue(rawValue) ? fallback : rawValue;
        if (isEmptyValue(value)) {
          return isPortal ? pendingLabel : "--";
        }
        return formatDate(String(value));
      }
      if (isEmptyValue(rawValue)) {
        if (isPortal && field.semantic === "unit_price") {
          return pendingLabel;
        }
        return "--";
      }
      if (field.fieldType === "toggle") {
        return rawValue === true ? "Yes" : "No";
      }
      if (field.fieldType === "date") {
        return formatDate(String(rawValue));
      }
      const text = String(rawValue);
      return field.unit ? `${text} ${field.unit}` : text;
    },
    [externalFieldValuesByJobId],
  );

  const parseAmount = useCallback((value: unknown): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const text = String(value).trim();
    if (!text) {
      return null;
    }
    const normalized = text
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const priceFieldsByRole = useMemo(() => {
    const explicitPlanned = externalListFields.find(
      (field) => field.fieldRole === "planned_price",
    );
    const explicitInvoice = externalListFields.find(
      (field) => field.fieldRole === "invoice_price",
    );
    const planned =
      explicitPlanned ??
      externalListFields.find(
        (field) => inferPriceRole({ key: field.key, label: field.label }) === "planned_price",
      );
    const invoice =
      explicitInvoice ??
      externalListFields.find(
        (field) => inferPriceRole({ key: field.key, label: field.label }) === "invoice_price",
      );
    return { planned, invoice };
  }, [externalListFields]);

  const showPriceDifferenceColumn = useMemo(
    () =>
      priceReconciliationEnabled &&
      Boolean(priceFieldsByRole.planned) &&
      Boolean(priceFieldsByRole.invoice),
    [priceFieldsByRole.invoice, priceFieldsByRole.planned, priceReconciliationEnabled],
  );

  const tableColumnDefs = useMemo(() => {
    const defs: Array<{ id: string; label: string }> = [
      { id: "sys.order_number", label: "Order #" },
      { id: "sys.customer_name", label: "Customer" },
      { id: "sys.partner_name", label: "Partner" },
      ...externalListFields.map((field) => ({
        id: `field.${field.id}`,
        label: field.label,
      })),
    ];
    if (showPriceDifferenceColumn) {
      defs.push({ id: "cmp.price_diff", label: "Price diff" });
    }
    defs.push(
      { id: "sys.received_at", label: "Received" },
      { id: "sys.added_by", label: "Added by" },
      { id: "sys.status", label: "Status" },
    );
    return defs;
  }, [externalListFields, showPriceDifferenceColumn]);
  const externalFieldById = useMemo(
    () => Object.fromEntries(externalListFields.map((field) => [field.id, field])),
    [externalListFields],
  );

  const visibleTableColumnDefs = useMemo(() => {
    const byId = new Map(tableColumnDefs.map((column) => [column.id, column]));
    if (externalTableColumnsConfig.length === 0) {
      return tableColumnDefs;
    }
    const ordered: Array<{ id: string; label: string; visible: boolean }> =
      externalTableColumnsConfig
        .map((config) => {
          const found = byId.get(config.id);
          if (!found) {
            return null;
          }
          return {
            ...found,
            label: config.label?.trim() ? config.label.trim() : found.label,
            visible: config.visible !== false,
          };
        })
        .filter((item): item is { id: string; label: string; visible: boolean } =>
          Boolean(item),
        );
    const missing = tableColumnDefs
      .filter((column) => !ordered.some((item) => item.id === column.id))
      .map((column) => ({ ...column, visible: true }));
    return [...ordered, ...missing].filter((column) => column.visible);
  }, [externalTableColumnsConfig, tableColumnDefs]);

  const fallbackJobs = useMemo(() => {
    return orders.flatMap((order) =>
      (order.externalJobs ?? []).map((job) => ({
        ...job,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
      })),
    );
  }, [orders]);

  const today = new Date().toISOString().slice(0, 10);

  const filteredJobs = useMemo(() => jobs, [jobs]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= 768) {
        setShowCompactMobileTitle(false);
        return;
      }
      setShowCompactMobileTitle(window.scrollY > 90);
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
    if (!supabase || user.loading || !user.isAuthenticated || !user.tenantId) {
      queueMicrotask(() => {
        setExternalListFields([]);
      });
      return;
    }
    const sb = supabase;
    let isMounted = true;
    const loadFields = async () => {
      const { data } = await sb
        .from("external_job_fields")
        .select(
          "id, key, label, field_type, field_role, show_in_table, ai_enabled, ai_match_only, ai_aliases, unit, sort_order, is_active",
        )
        .eq("tenant_id", user.tenantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted) {
        return;
      }
      const list = (data ?? []).map((field) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        fieldType: field.field_type as ExternalJobFieldType,
        fieldRole: (field.field_role ?? "none") as ExternalJobFieldRole,
        showInTable: field.show_in_table ?? true,
        aiEnabled: field.ai_enabled ?? false,
        aiMatchOnly: field.ai_match_only ?? false,
        aiAliases: field.ai_aliases ?? undefined,
        unit: field.unit ?? undefined,
        sortOrder: field.sort_order ?? 0,
        semantic: getFieldSemantic({ key: field.key, label: field.label }),
      }));
      const deduped = list
        .filter((field) => field.showInTable ?? true)
        .filter((field, index, all) => {
        if (field.semantic === "other") {
          return true;
        }
        return all.findIndex((candidate) => {
          if (candidate.semantic !== field.semantic) {
            return false;
          }
          return (candidate.fieldRole ?? "none") === (field.fieldRole ?? "none");
        }) === index;
        });
      setExternalListFields(deduped);
    };
    void loadFields();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated || !user.tenantId) {
      queueMicrotask(() => {
        setPriceReconciliationEnabled(false);
      });
      return;
    }
    const sb = supabase;
    let isMounted = true;
    const loadTenantPricing = async () => {
      const { data } = await sb
        .from("tenant_settings")
        .select(
          "external_price_reconciliation_enabled, external_table_columns",
        )
        .eq("tenant_id", user.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      setPriceReconciliationEnabled(
        data?.external_price_reconciliation_enabled === true,
      );
      if (Array.isArray(data?.external_table_columns)) {
        setExternalTableColumnsConfig(
          data.external_table_columns
            .map((item) => {
              if (
                item &&
                typeof item === "object" &&
                "id" in item &&
                typeof (item as { id?: unknown }).id === "string"
              ) {
                return {
                  id: (item as { id: string }).id,
                  visible:
                    (item as { visible?: unknown }).visible !== false,
                  label:
                    typeof (item as { label?: unknown }).label === "string"
                      ? (item as { label: string }).label
                      : undefined,
                } as ExternalTableColumnSetting;
              }
              return null;
            })
            .filter(
              (item): item is ExternalTableColumnSetting => Boolean(item),
            ),
        );
      } else {
        setExternalTableColumnsConfig([]);
      }
    };
    void loadTenantPricing();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const loadFieldValuesForJobs = useCallback(
    async (jobIds: string[], append: boolean) => {
      if (!supabase || !user.tenantId || externalListFields.length === 0) {
        if (!append) {
          setExternalFieldValuesByJobId({});
        }
        return;
      }
      const sb = supabase;
      if (jobIds.length === 0) {
        if (!append) {
          setExternalFieldValuesByJobId({});
        }
        return;
      }
      const fieldIds = externalListFields.map((field) => field.id);
      const { data } = await sb
        .from("external_job_field_values")
        .select("external_job_id, field_id, value")
        .eq("tenant_id", user.tenantId)
        .in("external_job_id", jobIds)
        .in("field_id", fieldIds);
      const grouped = (data ?? []).reduce<
        Record<string, Record<string, unknown>>
      >((acc, row) => {
        if (!acc[row.external_job_id]) {
          acc[row.external_job_id] = {};
        }
        acc[row.external_job_id][row.field_id] = row.value;
        return acc;
      }, {});
      setExternalFieldValuesByJobId((prev) =>
        append ? { ...prev, ...grouped } : grouped,
      );
    },
    [externalListFields, user.tenantId],
  );

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      queueMicrotask(() => {
        setJobs(fallbackJobs.slice(0, pageSize));
        setTotalJobs(fallbackJobs.length);
      });
      return;
    }
    const sb = supabase;
    let isMounted = true;

    const fetchPage = async (nextOffset: number, append: boolean) => {
      setIsLoading(true);
      const query = sb
        .from("external_jobs")
        .select(externalJobsSelect, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(nextOffset, nextOffset + pageSize - 1);
      if (user.tenantId) {
        query.eq("tenant_id", user.tenantId);
      }
      if (statusFilter !== "all") {
        query.eq("status", statusFilter);
      }
      if (partnerGroupFilter) {
        const ids = activePartners
          .filter((partner) => partner.groupId === partnerGroupFilter)
          .map((partner) => partner.id);
        if (ids.length > 0) {
          query.in("partner_id", ids);
        } else {
          setJobs([]);
          setTotalJobs(0);
          setIsLoading(false);
          return;
        }
      }
      if (partnerFilter) {
        query.eq("partner_id", partnerFilter);
      }
      if (search.trim().length > 0) {
        const q = `%${search.trim()}%`;
        query.or(
          `external_order_number.ilike.${q},partner_response_order_number.ilike.${q},partner_name.ilike.${q}`,
        );
      }
      if (overdueOnly) {
        query.or(
          `partner_response_due_date.lt.${today},and(partner_response_due_date.is.null,due_date.lt.${today})`,
        );
        query.not("status", "in", '("delivered","approved","cancelled")');
      }

      const { data, count, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setIsLoading(false);
        return;
      }
      const mapped = (data ?? []).map(mapExternalJobRow);
      await loadFieldValuesForJobs(
        mapped.map((item) => item.id),
        append,
      );
      setJobs((prev) => (append ? [...prev, ...mapped] : mapped));
      setTotalJobs(count ?? mapped.length);
      setIsLoading(false);
    };

    void fetchPage(0, false);
    queueMicrotask(() => {
      setOffset(0);
    });

    return () => {
      isMounted = false;
    };
  }, [
    activePartners,
    externalListFields,
    fallbackJobs,
    loadFieldValuesForJobs,
    overdueOnly,
    partnerFilter,
    partnerGroupFilter,
    search,
    statusFilter,
    today,
    user.isAuthenticated,
    user.loading,
    user.tenantId,
  ]);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      const total = fallbackJobs.length;
      const overdue = fallbackJobs.filter(
        (job) =>
          getEffectiveDueDate(job) < today &&
          !["delivered", "approved", "cancelled"].includes(job.status),
      ).length;
      const soon = new Date();
      soon.setDate(soon.getDate() + 7);
      const soonStr = soon.toISOString().slice(0, 10);
      const dueSoon = fallbackJobs.filter(
        (job) =>
          getEffectiveDueDate(job) >= today &&
          getEffectiveDueDate(job) <= soonStr &&
          !["delivered", "approved", "cancelled"].includes(job.status),
      ).length;
      queueMicrotask(() => {
        setStats({ total, overdue, dueSoon });
      });
      return;
    }
    const sb = supabase;
    let isMounted = true;
    const loadStats = async () => {
      const base = sb.from("external_jobs");
      let baseQuery = base.select("id", { count: "exact", head: true });
      if (user.tenantId) {
        baseQuery = baseQuery.eq("tenant_id", user.tenantId);
      }
      const { count: total } = await baseQuery;

      let overdueQuery = base.select("id", { count: "exact", head: true });
      if (user.tenantId) {
        overdueQuery = overdueQuery.eq("tenant_id", user.tenantId);
      }
      overdueQuery = overdueQuery.or(
        `partner_response_due_date.lt.${today},and(partner_response_due_date.is.null,due_date.lt.${today})`,
      );
      overdueQuery = overdueQuery.not(
        "status",
        "in",
        '("delivered","approved","cancelled")',
      );
      const { count: overdue } = await overdueQuery;

      const soon = new Date();
      soon.setDate(soon.getDate() + 7);
      const soonStr = soon.toISOString().slice(0, 10);
      let dueSoonQuery = base.select("id", { count: "exact", head: true });
      if (user.tenantId) {
        dueSoonQuery = dueSoonQuery.eq("tenant_id", user.tenantId);
      }
      dueSoonQuery = dueSoonQuery.or(
        `and(partner_response_due_date.gte.${today},partner_response_due_date.lte.${soonStr}),and(partner_response_due_date.is.null,due_date.gte.${today},due_date.lte.${soonStr})`,
      );
      dueSoonQuery = dueSoonQuery.not(
        "status",
        "in",
        '("delivered","approved","cancelled")',
      );
      const { count: dueSoon } = await dueSoonQuery;

      if (!isMounted) {
        return;
      }
      setStats({
        total: total ?? 0,
        overdue: overdue ?? 0,
        dueSoon: dueSoon ?? 0,
      });
    };
    void loadStats();
    return () => {
      isMounted = false;
    };
  }, [
    fallbackJobs,
    getEffectiveDueDate,
    today,
    user.isAuthenticated,
    user.loading,
    user.tenantId,
  ]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setPartnerGroupFilter("");
    setPartnerFilter("");
    setOverdueOnly(false);
  }, []);

  const renderFilterControls = (showTopToggle: boolean) => (
    <div className="space-y-3">
      {showTopToggle ? (
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            checked={statusFilter === "delivered"}
            onChange={(event) =>
              setStatusFilter(event.target.checked ? "delivered" : "all")
            }
            label="In Stock"
          />
          <Checkbox
            checked={overdueOnly}
            onChange={(event) => setOverdueOnly(event.target.checked)}
            label="Overdue only"
          />
        </div>
      ) : null}
      <FilterOptionSelector
        title="Status"
        value={statusFilter}
        onChange={(value) =>
          setStatusFilter(value as ExternalJobStatus | "all")
        }
        options={statusOptions.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
      <SelectField
        label="Partner group"
        value={partnerGroupFilter || "__all__"}
        onValueChange={(value) =>
          setPartnerGroupFilter(value === "__all__" ? "" : value)
        }
      >
        <Select
          value={partnerGroupFilter || "__all__"}
          onValueChange={(value) =>
            setPartnerGroupFilter(value === "__all__" ? "" : value)
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
      </SelectField>
      <SelectField
        label="Partner"
        value={partnerFilter || "__all__"}
        onValueChange={(value) =>
          setPartnerFilter(value === "__all__" ? "" : value)
        }
      >
        <Select
          value={partnerFilter || "__all__"}
          onValueChange={(value) =>
            setPartnerFilter(value === "__all__" ? "" : value)
          }
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All partners</SelectItem>
            {activePartners
              .filter((partner) =>
                partnerGroupFilter
                  ? partner.groupId === partnerGroupFilter
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
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={resetFilters}>
          Clear filters
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 md:hidden">
        <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
          <Link href="/orders">
            <Button variant="ghost" size="icon" aria-label="Back to orders">
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-30 md:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              aria-label="Open external filters"
              onClick={() => setIsMobileFiltersOpen(true)}
            >
              <SlidersHorizontalIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-card shadow-lg"
              aria-label="Open external search"
              onClick={() => setIsMobileSearchOpen(true)}
            >
              <SearchIcon className="h-5 w-5" />
            </Button>
          </div>
          <Link href="/orders/external/receive">
            <Button className="h-12 rounded-full px-5 text-sm shadow-lg">
              Receive
            </Button>
          </Link>
        </div>
      </div>

      <BottomSheet
        open={isMobileFiltersOpen}
        onClose={() => setIsMobileFiltersOpen(false)}
        ariaLabel="External order filters"
        closeButtonLabel="Close filters"
        title="Filters"
        enableSwipeToClose
      >
        <div className="p-4">{renderFilterControls(true)}</div>
      </BottomSheet>

      <BottomSheet
        open={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
        ariaLabel="Search external orders"
        closeButtonLabel="Close search"
        title="Search"
        enableSwipeToClose
      >
        <div className="px-4 pt-3">
          <Input
            type="search"
            icon="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order, partner, customer..."
            className="text-[16px] md:text-sm"
          />
        </div>
      </BottomSheet>

      <section className="space-y-0 pt-16 md:space-y-4 md:pt-0">
        <MobilePageTitle
          title="Partner Orders"
          showCompact={showCompactMobileTitle}
          subtitle="Track outsourced partner orders, delivery dates, and receive flow."
          className="pt-6 pb-6"
        />
        <DesktopPageHeader
          sticky
          title="Partner Orders"
          subtitle="Track outsourced partner orders, delivery dates, and receive flow."
          className="md:z-20"
          actions={
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/orders/external/receive">
                <Button>Receive</Button>
              </Link>
              <Link href="/orders">
                <Button variant="outline">Back to Orders</Button>
              </Link>
            </div>
          }
        />

        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-3">
            <div className="rounded-lg border border-border px-4 py-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-2xl font-semibold">{stats.total}</div>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <div className="text-xs text-muted-foreground">Overdue</div>
              <div className="text-2xl font-semibold text-rose-600">
                {stats.overdue}
              </div>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <div className="text-xs text-muted-foreground">Due in 7 days</div>
              <div className="text-2xl font-semibold">{stats.dueSoon}</div>
            </div>
          </div>

          <div className="hidden flex-wrap items-end gap-3 md:flex">
            <div className="min-w-65 flex-1">
              <InputField
                label="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order, partner, customer..."
                className="h-10 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={statusFilter === "delivered"}
                onChange={(event) =>
                  setStatusFilter(event.target.checked ? "delivered" : "all")
                }
                label="In Stock"
              />
              <Checkbox
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
                label="Overdue only"
              />
              <FiltersDropdown contentClassName="w-[360px]">
                {renderFilterControls(false)}
              </FiltersDropdown>
            </div>
          </div>

          <DataTable
            columns={visibleTableColumnDefs}
            rows={filteredJobs}
            getRowId={(job) => job.id}
            tableClassName="w-max min-w-full"
            emptyState="No partner orders found."
            renderCell={(job, column) => {
              const createdBy = job.statusHistory
                ? [...job.statusHistory].sort((a, b) =>
                    a.changedAt.localeCompare(b.changedAt),
                  )[0]
                : undefined;
              const effectiveDueDate = getEffectiveDueDate(job);
              const isOverdue =
                effectiveDueDate < today &&
                !["delivered", "approved", "cancelled"].includes(job.status);

              if (column.id === "sys.order_number") {
                return (
                  <Link
                    href={`/orders/${job.orderNumber}`}
                    className="font-medium text-primary underline"
                  >
                    {job.orderNumber}
                  </Link>
                );
              }
              if (column.id === "sys.customer_name") {
                return job.customerName;
              }
              if (column.id === "sys.partner_name") {
                return job.partnerName;
              }
              if (column.id.startsWith("field.")) {
                const fieldId = column.id.slice(6);
                const field = externalFieldById[fieldId];
                if (!field) {
                  return "--";
                }
                return (
                  <span
                    className={
                      field.semantic === "due_date" && isOverdue
                        ? "font-medium text-rose-600"
                        : ""
                    }
                  >
                    {field.semantic === "external_order"
                      ? getDisplayExternalOrder(job)
                      : field.semantic === "due_date"
                        ? getDisplayDueDate(job)
                        : getFieldDisplayValue(job, field)}
                  </span>
                );
              }
              if (column.id === "cmp.price_diff") {
                const plannedField = priceFieldsByRole.planned;
                const invoiceField = priceFieldsByRole.invoice;
                if (!plannedField || !invoiceField) {
                  return "--";
                }
                const plannedRaw =
                  externalFieldValuesByJobId[job.id]?.[plannedField.id];
                const invoiceRaw =
                  externalFieldValuesByJobId[job.id]?.[invoiceField.id];
                const planned = parseAmount(plannedRaw);
                const invoice = parseAmount(invoiceRaw);
                if (planned === null || invoice === null) {
                  return "--";
                }
                const diff = invoice - planned;
                const sign = diff > 0 ? "+" : "";
                const value = `${sign}${diff.toFixed(2)} ${
                  plannedField.unit ?? invoiceField.unit ?? ""
                }`.trim();
                const abs = Math.abs(diff);
                if (abs < 0.005) {
                  return (
                    <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {value}
                    </span>
                  );
                }
                const isLargeVariance = abs >= 100;
                return (
                  <span
                    className={
                      isLargeVariance
                        ? "inline-flex whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                        : "inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                    }
                  >
                    {value}
                  </span>
                );
              }
              if (column.id === "sys.received_at") {
                return job.receivedAt
                  ? formatDate(job.receivedAt.slice(0, 10))
                  : "--";
              }
              if (column.id === "sys.added_by") {
                return job.partnerRequestSenderName
                  ? job.partnerRequestSenderName
                  : createdBy
                    ? `${createdBy.changedBy}${
                        createdBy.changedByRole
                          ? ` (${createdBy.changedByRole})`
                          : ""
                      }`
                    : "--";
              }
              if (column.id === "sys.status") {
                return (
                  <Badge
                    variant={statusVariant(job.status)}
                    className={getStatusBadgeColorClass(
                      rules.externalJobStatusConfig[job.status]?.color,
                    )}
                  >
                    {externalStatusLabels[job.status]}
                  </Badge>
                );
              }
              return "--";
            }}
          />
          {isLoading ? (
            <LoadingSpinner label="Loading partner orders..." />
          ) : (
            filteredJobs.length < totalJobs && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    const nextOffset = offset + pageSize;
                    setOffset(nextOffset);
                    if (!supabase || user.loading || !user.isAuthenticated) {
                      setJobs((prev) => [
                        ...prev,
                        ...fallbackJobs.slice(
                          nextOffset,
                          nextOffset + pageSize,
                        ),
                      ]);
                      return;
                    }
                    const sb = supabase;
                    setIsLoading(true);
                    const query = sb
                      .from("external_jobs")
                      .select(externalJobsSelect, { count: "exact" })
                      .order("created_at", { ascending: false })
                      .range(nextOffset, nextOffset + pageSize - 1);
                    if (user.tenantId) {
                      query.eq("tenant_id", user.tenantId);
                    }
                    if (statusFilter !== "all") {
                      query.eq("status", statusFilter);
                    }
                    if (partnerGroupFilter) {
                      const ids = activePartners
                        .filter(
                          (partner) => partner.groupId === partnerGroupFilter,
                        )
                        .map((partner) => partner.id);
                      if (ids.length > 0) {
                        query.in("partner_id", ids);
                      } else {
                        setIsLoading(false);
                        return;
                      }
                    }
                    if (partnerFilter) {
                      query.eq("partner_id", partnerFilter);
                    }
                    if (search.trim().length > 0) {
                      const q = `%${search.trim()}%`;
                      query.or(
                        `external_order_number.ilike.${q},partner_response_order_number.ilike.${q},partner_name.ilike.${q}`,
                      );
                    }
                    if (overdueOnly) {
                      query.or(
                        `partner_response_due_date.lt.${today},and(partner_response_due_date.is.null,due_date.lt.${today})`,
                      );
                      query.not(
                        "status",
                        "in",
                        '("delivered","approved","cancelled")',
                      );
                    }
                    query.then(async ({ data }) => {
                      const mapped = (data ?? []).map(mapExternalJobRow);
                      await loadFieldValuesForJobs(
                        mapped.map((item) => item.id),
                        true,
                      );
                      setJobs((prev) => [...prev, ...mapped]);
                      setIsLoading(false);
                    });
                  }}
                >
                  Load more
                </Button>
              </div>
            )
          )}
        </div>
      </section>
    </>
  );
}
