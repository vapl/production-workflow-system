"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useNotifications } from "@/components/ui/Notifications";
import { createId } from "@/lib/utils/createId";
import { ORDER_CORE_FIELDS } from "@/lib/domain/orderCoreFields";

export interface OrderFieldSetting {
  id: string;
  name: string;
  key: string;
  order: number;
  isRequired: boolean;
  isActive: boolean;
  showInTable: boolean;
}

interface OrderFieldSettingsContextValue {
  orderFields: OrderFieldSetting[];
  addOrderField: (
    field: Omit<OrderFieldSetting, "id">,
  ) => Promise<void>;
  updateOrderField: (
    fieldId: string,
    patch: Partial<OrderFieldSetting>,
  ) => Promise<void>;
  removeOrderField: (fieldId: string) => Promise<void>;
}

const OrderFieldSettingsContext =
  createContext<OrderFieldSettingsContextValue | null>(null);

const defaultOrderFieldTemplates: Omit<OrderFieldSetting, "id">[] =
  ORDER_CORE_FIELDS.map((field) => ({
    name: field.label,
    key: field.key,
    order: field.sortOrder,
    isRequired: field.isRequired,
    isActive: field.isActive,
    showInTable: field.showInTable,
  }));

const fallbackOrderFields: OrderFieldSetting[] = defaultOrderFieldTemplates.map(
  (field) => ({
    ...field,
    id: `order-field-${field.key}`,
  }),
);

function mapOrderField(row: {
  id: string;
  label: string;
  field_key: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  show_in_table: boolean;
}): OrderFieldSetting {
  return {
    id: row.id,
    name: row.label,
    key: row.field_key,
    order: row.sort_order,
    isRequired: row.is_required,
    isActive: row.is_active,
    showInTable: row.show_in_table,
  };
}

export function OrderFieldSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const { notify } = useNotifications();
  const [orderFields, setOrderFields] =
    useState<OrderFieldSetting[]>(fallbackOrderFields);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const client = supabase;
    if (user.loading) {
      return;
    }
    if (!user.isAuthenticated) {
      return;
    }
    let isMounted = true;
    const loadOrderFieldSettings = async () => {
      const { data, error } = await client
        .from("order_field_settings")
        .select(
          "id, label, field_key, sort_order, is_required, is_active, show_in_table",
        )
        .order("sort_order", { ascending: true });

      if (!isMounted || error) {
        return;
      }

      setOrderFields((data ?? []).map(mapOrderField));
    };
    void loadOrderFieldSettings();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const visibleOrderFields = useMemo(
    () => (user.isAuthenticated ? orderFields : []),
    [orderFields, user.isAuthenticated],
  );

  const value = useMemo<OrderFieldSettingsContextValue>(
    () => ({
      orderFields: visibleOrderFields,
      addOrderField: async (field) => {
        if (!supabase) {
          setOrderFields((prev) => [
            ...prev,
            { ...field, id: createId("order-field") },
          ]);
          return;
        }
        if (!user.tenantId) {
          return;
        }
        const { data, error } = await supabase
          .from("order_field_settings")
          .insert({
            tenant_id: user.tenantId,
            label: field.name,
            field_key: field.key,
            sort_order: field.order,
            is_required: field.isRequired,
            is_active: field.isActive,
            show_in_table: field.showInTable,
            created_by: user.id ?? null,
          })
          .select(
            "id, label, field_key, sort_order, is_required, is_active, show_in_table",
          )
          .single();
        if (error || !data) {
          return;
        }
        setOrderFields((prev) => [...prev, mapOrderField(data)]);
        notify({ title: "Order field added", variant: "success" });
      },
      updateOrderField: async (fieldId, patch) => {
        if (!supabase) {
          setOrderFields((prev) =>
            prev.map((field) =>
              field.id === fieldId ? { ...field, ...patch } : field,
            ),
          );
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.name !== undefined) updatePayload.label = patch.name;
        if (patch.key !== undefined) updatePayload.field_key = patch.key;
        if (patch.order !== undefined) updatePayload.sort_order = patch.order;
        if (patch.isRequired !== undefined) {
          updatePayload.is_required = patch.isRequired;
        }
        if (patch.isActive !== undefined) {
          updatePayload.is_active = patch.isActive;
        }
        if (patch.showInTable !== undefined) {
          updatePayload.show_in_table = patch.showInTable;
        }
        const { data, error } = await supabase
          .from("order_field_settings")
          .update(updatePayload)
          .eq("id", fieldId)
          .select(
            "id, label, field_key, sort_order, is_required, is_active, show_in_table",
          )
          .single();
        if (error || !data) {
          return;
        }
        setOrderFields((prev) =>
          prev.map((field) =>
            field.id === fieldId ? mapOrderField(data) : field,
          ),
        );
        notify({ title: "Order field updated", variant: "success" });
      },
      removeOrderField: async (fieldId) => {
        if (!supabase) {
          setOrderFields((prev) =>
            prev.filter((field) => field.id !== fieldId),
          );
          return;
        }
        const { error } = await supabase
          .from("order_field_settings")
          .delete()
          .eq("id", fieldId);
        if (error) {
          return;
        }
        setOrderFields((prev) =>
          prev.filter((field) => field.id !== fieldId),
        );
        notify({ title: "Order field removed", variant: "success" });
      },
    }),
    [notify, user.id, user.tenantId, visibleOrderFields],
  );

  return (
    <OrderFieldSettingsContext.Provider value={value}>
      {children}
    </OrderFieldSettingsContext.Provider>
  );
}

export function useOrderFieldSettings() {
  const context = useContext(OrderFieldSettingsContext);
  if (!context) {
    throw new Error(
      "useOrderFieldSettings must be used within OrderFieldSettingsProvider",
    );
  }
  return context;
}
