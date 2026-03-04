"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabaseClient";
import type { OrderItemBomLineType } from "@/types/orderItemBomLines";

type OrderItemDetailRow = {
  id: string;
  order_id: string;
  position: string | null;
  item_name: string;
  item_type: string | null;
  qty: number | null;
  material: string | null;
  dimensions: string | null;
  attributes: Record<string, unknown> | null;
  source_row_id: string;
  created_at?: string;
  updated_at?: string;
};

type OrderItemBomLineRow = {
  id: string;
  order_item_id: string;
  line_no: number;
  component_code?: string | null;
  component_name: string;
  component_type: OrderItemBomLineType;
  qty: number | null;
  unit: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  attributes?: Record<string, unknown> | null;
};

type BomCategory = "Materials" | "Hardware" | "Profiles" | "Glass" | "Other";

function mapBomCategory(type: OrderItemBomLineType): BomCategory {
  if (type === "profile") {
    return "Profiles";
  }
  if (type === "glass") {
    return "Glass";
  }
  if (["hardware", "fitting", "accessory", "gasket"].includes(type)) {
    return "Hardware";
  }
  if (["panel", "sheet", "edge_band"].includes(type)) {
    return "Materials";
  }
  return "Other";
}

function formatDimensions(line: OrderItemBomLineRow) {
  const parts = [line.length, line.width, line.height]
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" × ") : "-";
}

export default function OrderItemDetailPage() {
  const params = useParams<{ orderId: string; itemId: string }>();
  const orderId = params?.orderId;
  const itemId = params?.itemId;
  const [item, setItem] = useState<OrderItemDetailRow | null>(null);
  const [bomLines, setBomLines] = useState<OrderItemBomLineRow[]>([]);
  const [activeTab, setActiveTab] = useState<"items" | "bom">("items");
  const [error, setError] = useState("");

  useEffect(() => {
    const sb = supabase;
    if (!sb || !orderId || !itemId) {
      return;
    }
    let mounted = true;
    const load = async () => {
      const [{ data: itemData, error: itemError }, { data: bomData, error: bomError }] =
        await Promise.all([
          sb
            .from("order_items")
            .select(
              "id, order_id, position, item_name, item_type, qty, material, dimensions, attributes, source_row_id, created_at, updated_at",
            )
            .eq("order_id", orderId)
            .eq("id", itemId)
            .single(),
          sb
            .from("order_item_bom_lines")
            .select(
              "id, order_item_id, line_no, component_code, component_name, component_type, qty, unit, length, width, height, attributes",
            )
            .eq("order_item_id", itemId)
            .order("line_no", { ascending: true }),
        ]);

      if (!mounted) {
        return;
      }
      if (itemError || !itemData) {
        setError(itemError?.message ?? "Failed to load order item.");
        return;
      }
      if (bomError) {
        setError(bomError.message);
        return;
      }
      setItem(itemData as OrderItemDetailRow);
      setBomLines((bomData as OrderItemBomLineRow[] | null) ?? []);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [itemId, orderId]);

  const bomByCategory = useMemo(() => {
    const grouped: Record<BomCategory, OrderItemBomLineRow[]> = {
      Materials: [],
      Hardware: [],
      Profiles: [],
      Glass: [],
      Other: [],
    };
    bomLines.forEach((line) => {
      grouped[mapBomCategory(line.component_type)].push(line);
    });
    return grouped;
  }, [bomLines]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Construction item detail</h1>
        <Button variant="outline" asChild>
          <Link href={`/orders/${orderId}`}>Back to order</Link>
        </Button>
      </div>

      <div className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === "items" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("items")}
        >
          Items
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === "bom" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("bom")}
        >
          BOM
        </button>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {item && activeTab === "items" ? (
        <Card>
          <CardHeader>
            <CardTitle>{item.item_name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div><strong>Position:</strong> {item.position || "-"}</div>
            <div><strong>Type:</strong> {item.item_type || "-"}</div>
            <div><strong>Qty:</strong> {item.qty ?? 1}</div>
            <div><strong>Color / finish:</strong> {String(item.attributes?.color ?? item.attributes?.finish ?? "-")}</div>
            <div><strong>Material:</strong> {item.material || "-"}</div>
            <div><strong>Dimensions:</strong> {item.dimensions || "-"}</div>
            <div className="md:col-span-2"><strong>Source row id:</strong> {item.source_row_id}</div>
            <div className="md:col-span-2">
              <strong>Attributes</strong>
              <pre className="mt-1 max-h-72 overflow-auto rounded border bg-muted/20 p-2 text-xs">
                {JSON.stringify(item.attributes ?? {}, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {item && activeTab === "bom" ? (
        <Card>
          <CardHeader>
            <CardTitle>BOM by category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["Materials", "Hardware", "Profiles", "Glass", "Other"] as BomCategory[]).map(
              (category) => {
                const lines = bomByCategory[category];
                return (
                  <div key={category} className="rounded-lg border border-border/70">
                    <div className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                      {category} ({lines.length})
                    </div>
                    {lines.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No BOM lines.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/20 text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left">Material code</th>
                              <th className="px-3 py-2 text-left">Dimensions</th>
                              <th className="px-3 py-2 text-left">Qty</th>
                              <th className="px-3 py-2 text-left">Metadata</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((line) => {
                              const attrs = line.attributes ?? {};
                              return (
                                <tr key={line.id} className="border-t border-border/60">
                                  <td className="px-3 py-2">{line.component_name}</td>
                                  <td className="px-3 py-2">{line.component_code || "-"}</td>
                                  <td className="px-3 py-2">{formatDimensions(line)}</td>
                                  <td className="px-3 py-2">{line.qty ?? 0} {line.unit || "pcs"}</td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {[
                                      attrs.edges ? `edges: ${String(attrs.edges)}` : null,
                                      attrs.cnc_program ? `cnc: ${String(attrs.cnc_program)}` : null,
                                      attrs.profile_code ? `profile: ${String(attrs.profile_code)}` : null,
                                      attrs.supplier ? `supplier: ${String(attrs.supplier)}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") || "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
