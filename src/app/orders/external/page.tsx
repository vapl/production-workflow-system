"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SlidersHorizontalIcon } from "lucide-react";
import { useOrders } from "@/app/orders/OrdersContext";
import { usePartners } from "@/hooks/usePartners";
import type { ExternalJobFieldType, ExternalJobStatus } from "@/types/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/domain/formatters";

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
  unit?: string;
  sortOrder: number;
  semantic: "external_order" | "due_date" | "unit_price" | "other";
};

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
  const statusOptions = useMemo(
    () => [
      { value: "all" as const, label: "All" },
      ...externalStatusValues.map((status) => ({
        value: status,
        label: externalStatusLabels[status] ?? defaultExternalStatusLabels[status],
      })),
    ],
    [externalStatusLabels],
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
  const [externalFieldValuesByJobId, setExternalFieldValuesByJobId] = useState<
    Record<string, Record<string, unknown>>
  >({});
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
    orders?: {
      order_number?: string | null;
      customer_name?: string | null;
    } | null;
  }) => ({
    id: row.id,
    orderNumber: row.orders?.order_number ?? "-",
    customerName: row.orders?.customer_name ?? "-",
    partnerName: row.partner_name ?? "-",
    partnerId: row.partner_id ?? undefined,
    externalOrderNumber: row.external_order_number,
    requestMode: row.request_mode ?? undefined,
    partnerResponseOrderNumber: row.partner_response_order_number ?? undefined,
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
  });
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
    if (!supabase || user.loading || !user.isAuthenticated || !user.tenantId) {
      queueMicrotask(() => {
        setExternalListFields([]);
      });
      return;
    }
    let isMounted = true;
    const loadFields = async () => {
      const { data } = await supabase
        .from("external_job_fields")
        .select("id, key, label, field_type, unit, sort_order, is_active")
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
        unit: field.unit ?? undefined,
        sortOrder: field.sort_order ?? 0,
        semantic: getFieldSemantic({ key: field.key, label: field.label }),
      }));
      const deduped = list.filter((field, index, all) => {
        if (field.semantic === "other") {
          return true;
        }
        return (
          all.findIndex(
            (candidate) => candidate.semantic === field.semantic,
          ) === index
        );
      });
      setExternalListFields(deduped);
    };
    void loadFields();
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
      if (jobIds.length === 0) {
        if (!append) {
          setExternalFieldValuesByJobId({});
        }
        return;
      }
      const fieldIds = externalListFields.map((field) => field.id);
      const { data } = await supabase
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
    let isMounted = true;

    const fetchPage = async (nextOffset: number, append: boolean) => {
      setIsLoading(true);
      const query = supabase
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
    let isMounted = true;
    const loadStats = async () => {
      const base = supabase.from("external_jobs");
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

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>External Jobs</CardTitle>
          <div className="flex items-center gap-2">
            <Link href="/orders/external/receive">
              <Button variant="outline">Receive</Button>
            </Link>
            <Link href="/orders">
              <Button variant="outline">Back to Orders</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
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

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1 space-y-2">
              <label className="text-sm font-medium">Search</label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order, partner, customer..."
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={statusFilter === "delivered" ? "default" : "outline"}
                onClick={() =>
                  setStatusFilter((prev) =>
                    prev === "delivered" ? "all" : "delivered",
                  )
                }
              >
                In Stock
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(event) => setOverdueOnly(event.target.checked)}
                />
                Overdue only
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline">
                    <SlidersHorizontalIcon className="h-4 w-4" />
                    Filters
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] space-y-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select
                      value={statusFilter}
                      onValueChange={(value) =>
                        setStatusFilter(value as ExternalJobStatus | "all")
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Partner group</label>
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Partner</label>
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
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                        setPartnerGroupFilter("");
                        setPartnerFilter("");
                        setOverdueOnly(false);
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Order #</th>
                  <th className="px-4 py-2 text-left font-medium">Customer</th>
                  <th className="px-4 py-2 text-left font-medium">Partner</th>
                  {externalListFields.map((field) => (
                    <th
                      key={field.id}
                      className="px-4 py-2 text-left font-medium"
                    >
                      {field.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left font-medium">Received</th>
                  <th className="px-4 py-2 text-left font-medium">Added by</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const createdBy = job.statusHistory
                    ? [...job.statusHistory].sort((a, b) =>
                        a.changedAt.localeCompare(b.changedAt),
                      )[0]
                    : undefined;
                  const effectiveDueDate = getEffectiveDueDate(job);
                  const isOverdue =
                    effectiveDueDate < today &&
                    !["delivered", "approved", "cancelled"].includes(
                      job.status,
                    );
                  return (
                    <tr key={job.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium text-nowrap">
                        <Link
                          href={`/orders/${job.orderNumber}`}
                          className="text-primary underline"
                        >
                          {job.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{job.customerName}</td>
                      <td className="px-4 py-2">{job.partnerName}</td>
                      {externalListFields.map((field) => (
                        <td key={`${job.id}-${field.id}`} className="px-4 py-2">
                          <span
                            className={
                              field.semantic === "due_date" && isOverdue
                                ? "text-rose-600 font-medium"
                                : ""
                            }
                          >
                            {field.semantic === "external_order"
                              ? getDisplayExternalOrder(job)
                              : field.semantic === "due_date"
                                ? getDisplayDueDate(job)
                                : getFieldDisplayValue(job, field)}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-2">
                        {job.receivedAt
                          ? formatDate(job.receivedAt.slice(0, 10))
                          : "--"}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {job.partnerRequestSenderName
                          ? job.partnerRequestSenderName
                          : createdBy
                            ? `${createdBy.changedBy}${
                                createdBy.changedByRole
                                  ? ` (${createdBy.changedByRole})`
                                  : ""
                              }`
                            : "--"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={statusVariant(job.status)}>
                          {externalStatusLabels[job.status]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {filteredJobs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6 + externalListFields.length}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No external jobs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {isLoading ? (
            <LoadingSpinner label="Loading external jobs..." />
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
                    setIsLoading(true);
                    const query = supabase
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
        </CardContent>
      </Card>
    </section>
  );
}
