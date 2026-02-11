"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase, supabaseBucket } from "@/lib/supabaseClient";

const productionAttachmentCategory = "production_report";

type QrRow = {
  order_id: string;
  field_id: string;
  row_index: number;
  token: string;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  due_date: string | null;
  priority: string | null;
};

type OrderField = {
  id: string;
  label: string;
  options?: {
    columns?: Array<{ key: string; label: string; unit?: string }>;
  } | null;
};

type AttachmentRow = {
  id: string;
  name: string | null;
  url: string | null;
  created_at: string;
};

type ProductionItemRow = {
  id: string;
  item_name: string;
  qty: number;
  status: string;
  station_id: string | null;
  meta?: Record<string, unknown> | null;
};

function getStoragePathFromUrl(url: string, bucket: string) {
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
}

async function resolveSignedUrl(url: string | null | undefined, bucket: string) {
  if (!supabase || !url) {
    return url ?? null;
  }
  const storagePath = getStoragePathFromUrl(url, bucket);
  if (!storagePath) {
    return url;
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) {
    return url;
  }
  return data.signedUrl;
}

export default function QrTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const user = useCurrentUser();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrRow, setQrRow] = useState<QrRow | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [field, setField] = useState<OrderField | null>(null);
  const [rowData, setRowData] = useState<Record<string, unknown> | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [productionItems, setProductionItems] = useState<ProductionItemRow[]>(
    [],
  );

  useEffect(() => {
    if (!supabase || !params.token) {
      return;
    }
    if (!user.isAuthenticated) {
      setIsLoading(false);
      setError("Please sign in to view this QR code.");
      return;
    }
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const { data: qrData, error: qrError } = await supabase
        .from("production_qr_codes")
        .select("order_id, field_id, row_index, token")
        .eq("token", params.token)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (qrError || !qrData) {
        setError(qrError?.message ?? "QR code not found.");
        setIsLoading(false);
        return;
      }
      setQrRow(qrData);

      const { data: orderData } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, due_date, priority")
        .eq("id", qrData.order_id)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      setOrder(orderData ?? null);

      const { data: fieldData } = await supabase
        .from("order_input_fields")
        .select("id, label, options")
        .eq("id", qrData.field_id)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      setField(fieldData ?? null);

      const { data: valueData } = await supabase
        .from("order_input_values")
        .select("value")
        .eq("order_id", qrData.order_id)
        .eq("field_id", qrData.field_id)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      const values = Array.isArray(valueData?.value) ? valueData?.value : [];
      const rawRow =
        typeof values[qrData.row_index] === "object" &&
        values[qrData.row_index] !== null
          ? (values[qrData.row_index] as Record<string, unknown>)
          : null;
      setRowData(rawRow);

      const { data: attachmentData } = await supabase
        .from("order_attachments")
        .select("id, name, url, created_at")
        .eq("order_id", qrData.order_id)
        .eq("category", productionAttachmentCategory)
        .order("created_at", { ascending: false });
      if (!isMounted) {
        return;
      }
      setAttachments(attachmentData ?? []);

      const { data: assignments } = await supabase
        .from("operator_station_assignments")
        .select("station_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      const stationIds = (assignments ?? [])
        .map((row) => row.station_id)
        .filter(Boolean);

      if (stationIds.length > 0) {
        const { data: items } = await supabase
          .from("production_items")
          .select("id, item_name, qty, status, station_id, meta")
          .eq("order_id", qrData.order_id)
          .in("station_id", stationIds);
        if (!isMounted) {
          return;
        }
        const filtered = (items ?? []).filter((item) => {
          const rowIndex =
            typeof item.meta?.rowIndex === "number"
              ? item.meta?.rowIndex
              : typeof item.meta?.rowIndex === "string"
                ? Number(item.meta?.rowIndex)
                : null;
          return rowIndex === qrData.row_index;
        });
        setProductionItems(filtered);
      }

      setIsLoading(false);
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [params.token, user.id, user.isAuthenticated]);

  useEffect(() => {
    if (!attachments.length) {
      return;
    }
    let isMounted = true;
    const signAll = async () => {
      const results = await Promise.all(
        attachments.map(async (attachment) => {
          const url = await resolveSignedUrl(attachment.url, supabaseBucket);
          return { id: attachment.id, url };
        }),
      );
      if (!isMounted) {
        return;
      }
      const next: Record<string, string> = {};
      results.forEach((entry) => {
        if (entry.url) {
          next[entry.id] = entry.url;
        }
      });
      setSignedUrls(next);
    };
    void signAll();
    return () => {
      isMounted = false;
    };
  }, [attachments]);

  const rowDetails = useMemo(() => {
    if (!field || !rowData) {
      return [] as Array<{ label: string; value: string }>;
    }
    const columns = field.options?.columns ?? [];
    return columns
      .map((column) => {
        const value = rowData[column.key];
        if (value === null || value === undefined || value === "") {
          return null;
        }
        const text = String(value);
        return {
          label: column.label,
          value: column.unit ? `${text} ${column.unit}` : text,
        };
      })
      .filter(Boolean) as Array<{ label: string; value: string }>;
  }, [field, rowData]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">QR Construction</h1>
          <p className="text-sm text-muted-foreground">
            {order?.order_number ? `Order ${order.order_number}` : "Order"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order?.id ? (
            <Link href={`/orders/${order.id}`}>
              <Button variant="outline">Open order</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          Loading QR details...
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-6 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && qrRow ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">Order</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {order?.customer_name ?? "Customer"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Due {order?.due_date ? new Date(order.due_date).toLocaleDateString() : "-"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Priority: {order?.priority ?? "normal"}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">
                {field?.label ?? "Construction"}
              </div>
              {rowDetails.length === 0 ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  No construction details.
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  {rowDetails.map((detail) => (
                    <div key={detail.label} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {detail.label}
                      </span>
                      <span className="font-medium">{detail.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">Production files</div>
              {attachments.length === 0 ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  No production files uploaded.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {file.name ?? "File"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(file.created_at).toLocaleString()}
                        </div>
                      </div>
                      {signedUrls[file.id] ? (
                        <a
                          href={signedUrls[file.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No url
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">My station tasks</div>
              {productionItems.length === 0 ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  No tasks assigned to your stations for this construction.
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  {productionItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border px-3 py-2"
                    >
                      <div className="font-medium">{item.item_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Qty {item.qty} • {item.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-dashed border-border px-4 py-4 text-xs text-muted-foreground">
              QR token: {qrRow.token}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
