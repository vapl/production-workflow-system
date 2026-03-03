"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabaseClient";

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

export default function OrderItemDetailPage() {
  const params = useParams<{ orderId: string; itemId: string }>();
  const orderId = params?.orderId;
  const itemId = params?.itemId;
  const [item, setItem] = useState<OrderItemDetailRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const sb = supabase;
    if (!sb || !orderId || !itemId) {
      return;
    }
    let mounted = true;
    const load = async () => {
      const { data, error: loadError } = await sb
        .from("order_items")
        .select(
          "id, order_id, position, item_name, item_type, qty, material, dimensions, attributes, source_row_id, created_at, updated_at",
        )
        .eq("order_id", orderId)
        .eq("id", itemId)
        .single();
      if (!mounted) {
        return;
      }
      if (loadError || !data) {
        setError(loadError?.message ?? "Failed to load order item.");
        return;
      }
      setItem(data as OrderItemDetailRow);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [itemId, orderId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Construction item detail</h1>
        <Button variant="outline" asChild>
          <Link href={`/orders/${orderId}`}>Back to order</Link>
        </Button>
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {item ? (
        <Card>
          <CardHeader>
            <CardTitle>{item.item_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><strong>Position:</strong> {item.position || "-"}</div>
            <div><strong>Type:</strong> {item.item_type || "-"}</div>
            <div><strong>Qty:</strong> {item.qty ?? 1}</div>
            <div><strong>Material:</strong> {item.material || "-"}</div>
            <div><strong>Dimensions:</strong> {item.dimensions || "-"}</div>
            <div><strong>Source row id:</strong> {item.source_row_id}</div>
            <div>
              <strong>Attributes:</strong>
              <pre className="mt-1 max-h-72 overflow-auto rounded border bg-muted/20 p-2 text-xs">
                {JSON.stringify(item.attributes ?? {}, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
