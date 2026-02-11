"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/app/orders/OrdersContext";
import { usePartners } from "@/hooks/usePartners";
import type { ExternalJobStatus } from "@/types/orders";
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
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/domain/formatters";

const statusOptions: { value: ExternalJobStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "in_progress", label: "In progress" },
  { value: "delivered", label: "In Stock" },
  { value: "approved", label: "Approved" },
  { value: "cancelled", label: "Cancelled" },
];

const statusLabels: Record<ExternalJobStatus, string> = {
  requested: "Requested",
  ordered: "Ordered",
  in_progress: "In progress",
  delivered: "In Stock",
  approved: "Approved",
  cancelled: "Cancelled",
};

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

export default function ExternalJobsPage() {
  const { orders } = useOrders();
  const { activeGroups, activePartners } = usePartners();
  const user = useCurrentUser();
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
      dueDate: string;
      quantity?: number;
      status: ExternalJobStatus;
      receivedAt?: string | null;
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
    if (!supabase || user.loading || !user.isAuthenticated) {
      setJobs(fallbackJobs.slice(0, pageSize));
      setTotalJobs(fallbackJobs.length);
      return;
    }
    let isMounted = true;

    const fetchPage = async (nextOffset: number, append: boolean) => {
      setIsLoading(true);
      const query = supabase
        .from("external_jobs")
        .select(
          `
          id,
          order_id,
          partner_id,
          partner_name,
          external_order_number,
          quantity,
          due_date,
          status,
          received_at,
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
        query.or(`external_order_number.ilike.${q},partner_name.ilike.${q}`);
      }
      if (overdueOnly) {
        query.lt("due_date", today);
        query.not(
          "status",
          "in",
          '("delivered","approved","cancelled")',
        );
      }

      const { data, count, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setIsLoading(false);
        return;
      }
      const mapped = (data ?? []).map((row) => ({
        id: row.id,
        orderNumber: row.orders?.order_number ?? "-",
        customerName: row.orders?.customer_name ?? "-",
        partnerName: row.partner_name ?? "-",
        partnerId: row.partner_id ?? undefined,
        externalOrderNumber: row.external_order_number,
        dueDate: row.due_date,
        quantity: row.quantity ?? undefined,
        status: row.status,
        receivedAt: row.received_at ?? null,
        statusHistory: (row.external_job_status_history ?? []).map((entry) => ({
          id: entry.id,
          status: entry.status,
          changedBy: entry.changed_by_name ?? "Unknown",
          changedByRole: entry.changed_by_role ?? undefined,
          changedAt: entry.changed_at,
        })),
      }));
      setJobs((prev) => (append ? [...prev, ...mapped] : mapped));
      setTotalJobs(count ?? mapped.length);
      setIsLoading(false);
    };

    void fetchPage(0, false);
    setOffset(0);

    return () => {
      isMounted = false;
    };
  }, [
    activePartners,
    fallbackJobs,
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
          job.dueDate < today &&
          !["delivered", "approved", "cancelled"].includes(job.status),
      ).length;
      const soon = new Date();
      soon.setDate(soon.getDate() + 7);
      const soonStr = soon.toISOString().slice(0, 10);
      const dueSoon = fallbackJobs.filter(
        (job) =>
          job.dueDate >= today &&
          job.dueDate <= soonStr &&
          !["delivered", "approved", "cancelled"].includes(job.status),
      ).length;
      setStats({ total, overdue, dueSoon });
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
      overdueQuery = overdueQuery.lt("due_date", today);
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
      dueSoonQuery = dueSoonQuery.gte("due_date", today);
      dueSoonQuery = dueSoonQuery.lte("due_date", soonStr);
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
  }, [fallbackJobs, today, user.isAuthenticated, user.loading, user.tenantId]);

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

          <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_repeat(4,minmax(140px,0.4fr))_auto] lg:items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Search</label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order, partner, customer..."
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
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
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Order #</th>
                  <th className="px-4 py-2 text-left font-medium">Customer</th>
                  <th className="px-4 py-2 text-left font-medium">Partner</th>
                  <th className="px-4 py-2 text-left font-medium">Ext. Order</th>
                  <th className="px-4 py-2 text-left font-medium">Due date</th>
                  <th className="px-4 py-2 text-left font-medium">Qty</th>
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
                  return (
                    <tr key={job.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/orders/${job.orderNumber}`}
                        className="text-primary underline"
                      >
                        {job.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{job.customerName}</td>
                    <td className="px-4 py-2">{job.partnerName}</td>
                    <td className="px-4 py-2">{job.externalOrderNumber}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          job.dueDate < today &&
                          !["delivered", "approved", "cancelled"].includes(
                            job.status,
                          )
                            ? "text-rose-600 font-medium"
                            : ""
                        }
                      >
                        {job.dueDate}
                      </span>
                    </td>
                    <td className="px-4 py-2">{job.quantity ?? "--"}</td>
                    <td className="px-4 py-2">
                      {job.receivedAt
                        ? formatDate(job.receivedAt.slice(0, 10))
                        : "--"}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {createdBy
                        ? `${createdBy.changedBy}${
                            createdBy.changedByRole
                              ? ` (${createdBy.changedByRole})`
                              : ""
                          }`
                        : "--"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={statusVariant(job.status)}>
                        {statusLabels[job.status]}
                      </Badge>
                    </td>
                  </tr>
                );
                })}
                {filteredJobs.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
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
                        ...fallbackJobs.slice(nextOffset, nextOffset + pageSize),
                      ]);
                      return;
                    }
                    setIsLoading(true);
                    const query = supabase
                      .from("external_jobs")
                      .select(
                        `
                        id,
                        order_id,
                        partner_id,
                        partner_name,
                        external_order_number,
                        quantity,
                        due_date,
                        status,
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
                    if (partnerGroupFilter) {
                      const ids = activePartners
                        .filter((partner) => partner.groupId === partnerGroupFilter)
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
                        `external_order_number.ilike.${q},partner_name.ilike.${q}`,
                      );
                    }
                    if (overdueOnly) {
                      query.lt("due_date", today);
                      query.not(
                        "status",
                        "in",
                        '("delivered","approved","cancelled")',
                      );
                    }
                    query.then(({ data }) => {
                      const mapped = (data ?? []).map((row) => ({
                        id: row.id,
                        orderNumber: row.orders?.order_number ?? "-",
                        customerName: row.orders?.customer_name ?? "-",
                        partnerName: row.partner_name ?? "-",
                        partnerId: row.partner_id ?? undefined,
                        externalOrderNumber: row.external_order_number,
                        dueDate: row.due_date,
                        quantity: row.quantity ?? undefined,
                        status: row.status,
                        statusHistory: (row.external_job_status_history ?? []).map(
                          (entry) => ({
                            id: entry.id,
                            status: entry.status,
                            changedBy: entry.changed_by_name ?? "Unknown",
                            changedByRole: entry.changed_by_role ?? undefined,
                            changedAt: entry.changed_at,
                          }),
                        ),
                      }));
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
