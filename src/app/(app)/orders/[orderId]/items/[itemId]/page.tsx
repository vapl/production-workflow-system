"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n/useI18n";
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
  return parts.length > 0 ? parts.join(" x ") : "-";
}

function prettifyAttributeKey(key: string) {
  return key
    .replace(/^_+|_+$/g, "")
    .replace(/__/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OrderItemDetailPage() {
  const { t, locale } = useI18n();
  const params = useParams<{ orderId: string; itemId: string }>();
  const orderId = params?.orderId;
  const itemId = params?.itemId;
  const [item, setItem] = useState<OrderItemDetailRow | null>(null);
  const [bomLines, setBomLines] = useState<OrderItemBomLineRow[]>([]);
  const [unitFieldLabels, setUnitFieldLabels] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"unit" | "components">("unit");
  const [error, setError] = useState("");

  const categoryLabels: Record<BomCategory, string> = {
    Materials: locale === "ru" ? "Материалы" : locale === "en" ? "Materials" : "Materiāli",
    Hardware: locale === "ru" ? "Фурнитура" : locale === "en" ? "Hardware" : "Furnitūra",
    Profiles: locale === "ru" ? "Профили" : locale === "en" ? "Profiles" : "Profili",
    Glass: locale === "ru" ? "Стекло" : locale === "en" ? "Glass" : "Stikls",
    Other: locale === "ru" ? "Другое" : locale === "en" ? "Other" : "Citi",
  };

  const componentMetaLabels = {
    edges: locale === "ru" ? "Кромка" : locale === "en" ? "Edges" : "Malu apstrāde",
    cnc: "CNC",
    profile: locale === "ru" ? "Профиль" : locale === "en" ? "Profile" : "Profils",
    supplier: locale === "ru" ? "Поставщик" : locale === "en" ? "Supplier" : "Piegādātājs",
  };

  const customAttributeEntries = useMemo(() => {
    if (!item?.attributes) {
      return [] as Array<{ key: string; label: string; value: string }>;
    }

    const hiddenKeys = new Set([
      "color",
      "finish",
      "material",
      "__import_source_file",
      "__import_source_sheet",
      "__import_source_row_ref",
    ]);

    return Object.entries(item.attributes)
      .filter(([key, value]) => {
        if (hiddenKeys.has(key)) {
          return false;
        }
        if (value === null || value === undefined) {
          return false;
        }
        return String(value).trim().length > 0;
      })
      .map(([key, value]) => ({
        key,
        label: unitFieldLabels[key] ?? prettifyAttributeKey(key),
        value: String(value),
      }));
  }, [item?.attributes, unitFieldLabels]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !orderId || !itemId) {
      return;
    }
    let mounted = true;
    const load = async () => {
      const [
        { data: itemData, error: itemError },
        { data: bomData, error: bomError },
        { data: orderData, error: orderError },
      ] =
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
          sb.from("orders").select("tenant_id").eq("id", orderId).single(),
        ]);

      if (!mounted) {
        return;
      }
      if (itemError || !itemData) {
        setError(
          itemError?.message ??
            (locale === "ru"
              ? "Не удалось загрузить производственную единицу."
              : locale === "en"
                ? "Failed to load manufacturing unit."
                : "Neizdevās ielādēt ražojamo vienību."),
        );
        return;
      }
      if (bomError) {
        setError(bomError.message);
        return;
      }
      if (orderError) {
        setError(orderError.message);
        return;
      }
      setItem(itemData as OrderItemDetailRow);
      setBomLines((bomData as OrderItemBomLineRow[] | null) ?? []);

      const tenantId = (orderData as { tenant_id?: string | null } | null)?.tenant_id;
      if (tenantId) {
        const { data: fieldsData } = await sb
          .from("order_input_fields")
          .select("key,label,group_key,options,is_active,field_type")
          .eq("tenant_id", tenantId)
          .eq("group_key", "production_scope")
          .eq("is_active", true)
          .neq("field_type", "table");

        const labels = Object.fromEntries(
          ((fieldsData as Array<{
            key: string;
            label: string;
            options?: { scope?: string } | null;
          }> | null) ?? [])
            .filter((field) => {
              const scope = field.options?.scope;
              return scope === "construction_attribute" || !scope;
            })
            .map((field) => [field.key, field.label]),
        );
        if (mounted) {
          setUnitFieldLabels(labels);
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [itemId, locale, orderId]);

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
        <h1 className="text-xl font-semibold">{t("orders.detail.orderInputs.detailTitle")}</h1>
        <Button variant="outline" asChild>
          <Link href={`/orders/${orderId}`}>{t("orders.detail.back")}</Link>
        </Button>
      </div>

      <div className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === "unit" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("unit")}
        >
          {t("orders.detail.orderInputs.title")}
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${
            activeTab === "components" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("components")}
        >
          {t("orders.detail.orderInputs.bomTitle")}
        </button>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {item && activeTab === "unit" ? (
        <Card>
          <CardHeader>
            <CardTitle>{item.item_name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div><strong>{t("settings.orderInputs.columnLabels.position")}:</strong> {item.position || "-"}</div>
            <div><strong>{t("settings.orderInputs.columnLabels.itemType")}:</strong> {item.item_type || "-"}</div>
            <div><strong>{t("settings.orderInputs.columnLabels.qty")}:</strong> {item.qty ?? 1}</div>
            <div><strong>{t("settings.orderInputs.columnLabels.finishColor")}:</strong> {String(item.attributes?.color ?? item.attributes?.finish ?? "-")}</div>
            <div><strong>{t("settings.orderInputs.columnLabels.material")}:</strong> {item.material || "-"}</div>
            <div><strong>{t("settings.orderInputs.columnLabels.dimensions")}:</strong> {item.dimensions || "-"}</div>
            {customAttributeEntries.map((entry) => (
              <div key={entry.key}><strong>{entry.label}:</strong> {entry.value}</div>
            ))}
            <div className="md:col-span-2"><strong>{t("orders.detail.orderInputs.detailRowId")}:</strong> {item.source_row_id}</div>
            {Object.keys(item.attributes ?? {}).length > 0 ? (
              <details className="md:col-span-2 rounded border bg-muted/20 p-2 text-xs">
                <summary className="cursor-pointer font-medium">
                  {t("orders.detail.orderInputs.detailAttributes")}
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto">{JSON.stringify(item.attributes ?? {}, null, 2)}</pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {item && activeTab === "components" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {locale === "ru"
                ? "Компоненты по категориям"
                : locale === "en"
                  ? "Components by category"
                  : "Komponentes pa kategorijām"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["Materials", "Hardware", "Profiles", "Glass", "Other"] as BomCategory[]).map((category) => {
              const lines = bomByCategory[category];
              return (
                <div key={category} className="rounded-lg border border-border/70">
                  <div className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                    {categoryLabels[category]} ({lines.length})
                  </div>
                  {lines.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">{t("orders.detail.orderInputs.bomEmpty")}</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted/20 text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">{t("orders.detail.orderInputs.bomComponentName")}</th>
                            <th className="px-3 py-2 text-left">{t("orders.detail.orderInputs.bomComponentCode")}</th>
                            <th className="px-3 py-2 text-left">{t("settings.orderInputs.columnLabels.dimensions")}</th>
                            <th className="px-3 py-2 text-left">{t("orders.detail.orderInputs.bomQty")}</th>
                            <th className="px-3 py-2 text-left">
                              {locale === "ru" ? "Метаданные" : locale === "en" ? "Metadata" : "Metadati"}
                            </th>
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
                                    attrs.edges ? `${componentMetaLabels.edges}: ${String(attrs.edges)}` : null,
                                    attrs.cnc_program ? `${componentMetaLabels.cnc}: ${String(attrs.cnc_program)}` : null,
                                    attrs.profile_code ? `${componentMetaLabels.profile}: ${String(attrs.profile_code)}` : null,
                                    attrs.supplier ? `${componentMetaLabels.supplier}: ${String(attrs.supplier)}` : null,
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
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
