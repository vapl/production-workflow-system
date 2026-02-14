"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/app/orders/OrdersContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/ui/FileField";
import { InputField } from "@/components/ui/InputField";
import { Badge } from "@/components/ui/Badge";
import { supabase } from "@/lib/supabaseClient";
import { uploadExternalJobAttachment } from "@/lib/uploadExternalJobAttachment";
import type { ExternalJobStatus } from "@/types/orders";

type ReceiveJob = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  partnerName: string;
  externalOrderNumber: string;
  dueDate: string;
  quantity?: number;
  status: ExternalJobStatus;
  deliveryNoteNo?: string | null;
};

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

export default function ExternalJobsReceivePage() {
  const { updateExternalJob, addExternalJobAttachment } = useOrders();
  const user = useCurrentUser();
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<ReceiveJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionState, setActionState] = useState<
    Record<
      string,
      { note: string; file?: File; isSaving?: boolean; error?: string }
    >
  >({});

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;
    const fetchJobs = async () => {
      setIsLoading(true);
      if (!supabase) {
        setJobs([]);
        setIsLoading(false);
        return;
      }
      const query = supabase
        .from("external_jobs")
        .select(
          `
          id,
          order_id,
          partner_name,
          external_order_number,
          quantity,
          due_date,
          status,
          delivery_note_no,
          orders (
            order_number,
            customer_name
          )
        `,
        )
        .in("status", ["ordered", "in_progress"])
        .order("created_at", { ascending: false });
      if (user.tenantId) {
        query.eq("tenant_id", user.tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setJobs([]);
        setIsLoading(false);
        return;
      }
      const mapped = (data ?? []).map((row) => ({
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.orders?.[0]?.order_number ?? "-",
        customerName: row.orders?.[0]?.customer_name ?? "-",
        partnerName: row.partner_name ?? "-",
        externalOrderNumber: row.external_order_number,
        dueDate: row.due_date,
        quantity: row.quantity ?? undefined,
        status: row.status,
        deliveryNoteNo: row.delivery_note_no ?? null,
      }));
      setJobs(mapped);
      setIsLoading(false);
    };
    void fetchJobs();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return jobs;
    }
    return jobs.filter(
      (job) =>
        job.externalOrderNumber.toLowerCase().includes(q) ||
        job.partnerName.toLowerCase().includes(q) ||
        job.orderNumber.toLowerCase().includes(q) ||
        job.customerName.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const handleFileChange = (jobId: string, file?: File) => {
    setActionState((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        file,
      },
    }));
  };

  const handleNoteChange = (jobId: string, note: string) => {
    setActionState((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        note,
      },
    }));
  };

  const handleReceive = async (job: ReceiveJob) => {
    const state = actionState[job.id];
    setActionState((prev) => ({
      ...prev,
      [job.id]: {
        ...prev[job.id],
        isSaving: true,
        error: undefined,
      },
    }));
    const deliveryNoteNo = state?.note?.trim() || null;
    const now = new Date().toISOString();
    const updated = await updateExternalJob(job.id, {
      status: "delivered",
      deliveryNoteNo,
      receivedAt: now,
      receivedBy: user.id,
    });
    if (!updated) {
      setActionState((prev) => ({
        ...prev,
        [job.id]: { ...prev[job.id], isSaving: false, error: "Save failed." },
      }));
      return;
    }

    if (state?.file) {
      const upload = await uploadExternalJobAttachment(state.file, job.id);
      if (upload.error || !upload.attachment) {
        setActionState((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            isSaving: false,
            error: upload.error ?? "Upload failed.",
          },
        }));
        return;
      }
      const attachment = await addExternalJobAttachment(job.id, {
        name: upload.attachment.name,
        url: upload.attachment.url,
        size: upload.attachment.size,
        mimeType: upload.attachment.mimeType,
        addedBy: user.name,
        addedByRole: user.role,
        category: "delivery_note",
      });
      if (!attachment) {
        setActionState((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            isSaving: false,
            error: "Failed to attach delivery note.",
          },
        }));
        return;
      }
    }

    setJobs((prev) => prev.filter((item) => item.id !== job.id));
    setActionState((prev) => ({
      ...prev,
      [job.id]: { note: "", isSaving: false },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">External Jobs - Receive</h1>
          <p className="text-sm text-muted-foreground">
            Mark delivered items as In Stock and attach delivery notes.
          </p>
        </div>
        <Link href="/orders/external">
          <Button variant="outline" size="sm">
            Back to External Jobs
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <InputField
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order #, partner, customer, external order..."
            className="h-10 text-sm"
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Loading external jobs...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No external jobs waiting for receive.
          </div>
        ) : (
          filteredJobs.map((job) => {
            const state = actionState[job.id];
            return (
              <Card key={job.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {job.orderNumber && job.orderNumber !== "-"
                          ? `${job.orderNumber} / ${job.externalOrderNumber}`
                          : job.externalOrderNumber}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.customerName && job.customerName !== "-"
                          ? `${job.customerName} • ${job.partnerName}`
                          : job.partnerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Due: {job.dueDate}{" "}
                        {job.quantity ? `• Qty ${job.quantity}` : ""}
                      </div>
                    </div>
                    <Badge variant={statusVariant(job.status)}>
                      {statusLabels[job.status]}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <InputField
                      label="Delivery note #"
                      labelClassName="text-xs font-medium"
                      value={state?.note ?? job.deliveryNoteNo ?? ""}
                      onChange={(event) =>
                        handleNoteChange(job.id, event.target.value)
                      }
                      placeholder="e.g. DN-2026-001"
                      className="h-9 text-sm"
                    />
                    <FileField
                      label="Delivery note file (optional)"
                      onChange={(event) =>
                        handleFileChange(job.id, event.target.files?.[0])
                      }
                      className="text-xs"
                      labelClassName="text-xs font-medium"
                    />
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => handleReceive(job)}
                        disabled={state?.isSaving}
                      >
                        {state?.isSaving ? "Saving..." : "Mark In Stock"}
                      </Button>
                      {state?.error ? (
                        <span className="text-xs text-destructive">
                          {state.error}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
