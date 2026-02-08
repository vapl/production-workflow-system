"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import type { WorkStation } from "@/types/workstation";
import type {
  OrderInputField,
  OrderInputFieldType,
  OrderInputGroupKey,
} from "@/types/orderInputs";
import type { Partner, PartnerGroup } from "@/types/partner";
import { useNotifications } from "@/components/ui/Notifications";
import { mockPartnerGroups, mockPartners } from "@/lib/data/mockData";

export interface StopReason {
  id: string;
  label: string;
  isActive: boolean;
}

interface SettingsDataState {
  workStations: WorkStation[];
  orderInputFields: OrderInputField[];
  stopReasons: StopReason[];
  partners: Partner[];
  partnerGroups: PartnerGroup[];
  isLoading: boolean;
  error?: string | null;
  addWorkStation: (payload: Omit<WorkStation, "id">) => Promise<void>;
  updateWorkStation: (
    stationId: string,
    patch: Partial<WorkStation>,
  ) => Promise<void>;
  removeWorkStation: (stationId: string) => Promise<void>;
  addOrderInputField: (
    payload: Omit<OrderInputField, "id">,
  ) => Promise<void>;
  updateOrderInputField: (
    fieldId: string,
    patch: Partial<Omit<OrderInputField, "id">>,
  ) => Promise<void>;
  removeOrderInputField: (fieldId: string) => Promise<void>;
  ensureDefaultOrderInputFields: () => Promise<void>;
  addStopReason: (label: string) => Promise<void>;
  updateStopReason: (reasonId: string, patch: Partial<StopReason>) => Promise<void>;
  removeStopReason: (reasonId: string) => Promise<void>;
  addPartner: (name: string, groupId?: string) => Promise<void>;
  updatePartner: (partnerId: string, patch: Partial<Partner>) => Promise<void>;
  removePartner: (partnerId: string) => Promise<void>;
  addPartnerGroup: (name: string) => Promise<void>;
  updatePartnerGroup: (
    groupId: string,
    patch: Partial<PartnerGroup>,
  ) => Promise<void>;
  removePartnerGroup: (groupId: string) => Promise<void>;
}

function mapWorkStation(row: {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number | null;
}): WorkStation {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapOrderInputField(row: {
  id: string;
  key: string;
  label: string;
  group_key?: string | null;
  field_type: string;
  unit?: string | null;
  options?: { options?: string[]; columns?: OrderInputField["columns"] } | null;
  is_required?: boolean | null;
  is_active?: boolean | null;
  show_in_production?: boolean | null;
  sort_order?: number | null;
}): OrderInputField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    groupKey: (row.group_key ?? "order_info") as OrderInputGroupKey,
    fieldType: row.field_type as OrderInputFieldType,
    unit: row.unit ?? undefined,
    options: row.options?.options ?? undefined,
    columns: row.options?.columns ?? undefined,
    isRequired: row.is_required ?? false,
    isActive: row.is_active ?? true,
    showInProduction: row.show_in_production ?? false,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapStopReason(row: {
  id: string;
  label: string;
  is_active: boolean;
}): StopReason {
  return {
    id: row.id,
    label: row.label,
    isActive: row.is_active,
  };
}

function mapPartner(row: {
  id: string;
  name: string;
  group_id?: string | null;
  is_active: boolean;
}): Partner {
  return {
    id: row.id,
    name: row.name,
    groupId: row.group_id ?? undefined,
    isActive: row.is_active,
  };
}

function mapPartnerGroup(row: {
  id: string;
  name: string;
  is_active: boolean;
}): PartnerGroup {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  };
}

export function useSettingsData(): SettingsDataState {
  const user = useCurrentUser();
  const { notify } = useNotifications();
  const [workStations, setWorkStations] = useState<WorkStation[]>([]);
  const [orderInputFields, setOrderInputFields] = useState<OrderInputField[]>([]);
  const [stopReasons, setStopReasons] = useState<StopReason[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerGroups, setPartnerGroups] = useState<PartnerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderInputFieldBlacklist = new Set([
    "contract_number",
    "project_object",
    "responsible_designer",
    "responsible_estimator",
    "responsible_technologist",
    "order_type",
  ]);
  const defaultOrderInputFields: Array<Omit<OrderInputField, "id">> = [
    {
      key: "construction_count",
      label: "Construction count",
      groupKey: "order_info",
      fieldType: "number",
      unit: "pcs",
      isRequired: false,
      isActive: true,
      sortOrder: 10,
    },
    {
      key: "construction_names",
      label: "Construction names",
      groupKey: "order_info",
      fieldType: "textarea",
      isRequired: false,
      isActive: true,
      sortOrder: 20,
    },
    {
      key: "delivery_address",
      label: "Delivery address",
      groupKey: "order_info",
      fieldType: "textarea",
      isRequired: false,
      isActive: true,
      sortOrder: 50,
    },
    {
      key: "contact_phone",
      label: "Contact phone",
      groupKey: "order_info",
      fieldType: "text",
      isRequired: false,
      isActive: true,
      sortOrder: 60,
    },
    {
      key: "cad_reference",
      label: "CAD / IMOS reference",
      groupKey: "order_info",
      fieldType: "text",
      isRequired: false,
      isActive: true,
      sortOrder: 70,
    },
    {
      key: "produce_flag",
      label: "Produce",
      groupKey: "order_info",
      fieldType: "toggle",
      isRequired: false,
      isActive: true,
      sortOrder: 110,
    },
    {
      key: "scope_doors",
      label: "Doors",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "pcs",
      isRequired: false,
      isActive: true,
      sortOrder: 10,
    },
    {
      key: "scope_standard_furniture",
      label: "Standard furniture",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "m2",
      isRequired: false,
      isActive: true,
      sortOrder: 20,
    },
    {
      key: "scope_parts",
      label: "Parts / components",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "m2",
      isRequired: false,
      isActive: true,
      sortOrder: 30,
    },
    {
      key: "scope_nonstandard",
      label: "Non-standard furniture",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "m2",
      isRequired: false,
      isActive: true,
      sortOrder: 40,
    },
    {
      key: "scope_kitchen",
      label: "Kitchen",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "m2",
      isRequired: false,
      isActive: true,
      sortOrder: 50,
    },
    {
      key: "scope_windows",
      label: "Windows",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "pcs",
      isRequired: false,
      isActive: true,
      sortOrder: 60,
    },
    {
      key: "scope_glass",
      label: "Glass",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "m2",
      isRequired: false,
      isActive: true,
      sortOrder: 70,
    },
    {
      key: "scope_other",
      label: "Other",
      groupKey: "production_scope",
      fieldType: "toggle_number",
      unit: "pcs",
      isRequired: false,
      isActive: true,
      sortOrder: 80,
    },
    {
      key: "scope_other_notes",
      label: "Other description",
      groupKey: "production_scope",
      fieldType: "text",
      isRequired: false,
      isActive: true,
      sortOrder: 90,
    },
  ];

  const refreshAll = async () => {
    if (!supabase) {
      setPartners(mockPartners);
      setPartnerGroups(mockPartnerGroups);
      return;
    }
    setIsLoading(true);
    setError(null);
    const [
      stationsResult,
      orderInputFieldsResult,
      reasonsResult,
      partnersResult,
      partnerGroupsResult,
    ] = await Promise.all([
      supabase
        .from("workstations")
        .select("id, name, description, is_active, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("order_input_fields")
        .select(
          "id, key, label, group_key, field_type, unit, options, is_required, is_active, show_in_production, sort_order",
        )
        .order("group_key", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("stop_reasons")
        .select("id, label, is_active")
        .order("created_at", { ascending: true }),
      supabase
        .from("partners")
        .select("id, name, group_id, is_active")
        .order("created_at", { ascending: true }),
      supabase
        .from("partner_groups")
        .select("id, name, is_active")
        .order("created_at", { ascending: true }),
    ]);

    if (
      stationsResult.error ||
      reasonsResult.error ||
      partnersResult.error ||
      partnerGroupsResult.error
    ) {
      setError(
        stationsResult.error?.message ||
          reasonsResult.error?.message ||
          partnersResult.error?.message ||
          partnerGroupsResult.error?.message ||
          "Failed to load settings data.",
      );
      setIsLoading(false);
      return;
    }

    setWorkStations((stationsResult.data ?? []).map(mapWorkStation));
    setOrderInputFields(
      (orderInputFieldsResult.data ?? [])
        .filter((field) => !orderInputFieldBlacklist.has(field.key))
        .map(mapOrderInputField),
    );
    setStopReasons((reasonsResult.data ?? []).map(mapStopReason));
    setPartners((partnersResult.data ?? []).map(mapPartner));
    setPartnerGroups((partnerGroupsResult.data ?? []).map(mapPartnerGroup));
    setIsLoading(false);
  };

  useEffect(() => {
    if (!supabase) {
      setPartners(mockPartners);
      return;
    }
    if (user.loading) {
      return;
    }
    if (!user.isAuthenticated) {
      setWorkStations([]);
      setOrderInputFields([]);
      setStopReasons([]);
      setPartners([]);
      setPartnerGroups([]);
      return;
    }
    void refreshAll();
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const value = useMemo<SettingsDataState>(
    () => ({
      workStations,
      orderInputFields,
      stopReasons,
      partners,
      partnerGroups,
      isLoading,
      error,
      addWorkStation: async (payload) => {
        if (!supabase || !user.tenantId) {
          return;
        }
          const { data, error: insertError } = await supabase
            .from("workstations")
            .insert({
              tenant_id: user.tenantId,
              name: payload.name,
              description: payload.description ?? null,
              is_active: payload.isActive,
              sort_order: payload.sortOrder ?? 0,
            })
            .select("id, name, description, is_active, sort_order")
            .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add workstation.");
          notify({
            title: "Workstation not added",
            description: insertError?.message,
            variant: "error",
          });
          return;
        }
        setWorkStations((prev) => [...prev, mapWorkStation(data)]);
        notify({ title: "Workstation added", variant: "success" });
      },
        updateWorkStation: async (stationId, patch) => {
          if (!supabase) {
            return;
          }
          const updatePayload: Record<string, unknown> = {};
          if (patch.name !== undefined) updatePayload.name = patch.name;
          if (patch.description !== undefined)
            updatePayload.description = patch.description || null;
          if (patch.isActive !== undefined)
            updatePayload.is_active = patch.isActive;
          if (patch.sortOrder !== undefined)
            updatePayload.sort_order = patch.sortOrder;
          const { data, error: updateError } = await supabase
            .from("workstations")
            .update(updatePayload)
            .eq("id", stationId)
            .select("id, name, description, is_active, sort_order")
            .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update workstation.");
          notify({
            title: "Workstation not updated",
            description: updateError?.message,
            variant: "error",
          });
          return;
        }
        setWorkStations((prev) =>
          prev.map((station) =>
            station.id === stationId ? mapWorkStation(data) : station,
          ),
        );
        notify({ title: "Workstation updated", variant: "success" });
      },
      removeWorkStation: async (stationId) => {
        if (!supabase) {
          return;
        }
        const { error: deleteError } = await supabase
          .from("workstations")
          .delete()
          .eq("id", stationId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Workstation not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return;
        }
        setWorkStations((prev) =>
          prev.filter((station) => station.id !== stationId),
        );
        notify({ title: "Workstation deleted", variant: "success" });
      },
      addOrderInputField: async (payload) => {
        if (!supabase || !user.tenantId) {
          return;
        }
        const optionsPayload =
          payload.options || payload.columns
            ? { options: payload.options, columns: payload.columns }
            : null;
        const { data, error: insertError } = await supabase
          .from("order_input_fields")
          .insert({
            tenant_id: user.tenantId,
            key: payload.key,
            label: payload.label,
            group_key: payload.groupKey,
            field_type: payload.fieldType,
            unit: payload.unit ?? null,
            options: optionsPayload,
            is_required: payload.isRequired,
            is_active: payload.isActive,
            show_in_production: payload.showInProduction ?? false,
            sort_order: payload.sortOrder ?? 0,
          })
          .select(
            "id, key, label, group_key, field_type, unit, options, is_required, is_active, show_in_production, sort_order",
          )
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add order field.");
          notify({
            title: "Order field not added",
            description: insertError?.message,
            variant: "error",
          });
          return;
        }
        setOrderInputFields((prev) => [...prev, mapOrderInputField(data)]);
        notify({ title: "Order field added", variant: "success" });
      },
      updateOrderInputField: async (fieldId, patch) => {
        if (!supabase) {
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.key !== undefined) updatePayload.key = patch.key;
        if (patch.label !== undefined) updatePayload.label = patch.label;
        if (patch.groupKey !== undefined)
          updatePayload.group_key = patch.groupKey;
        if (patch.fieldType !== undefined)
          updatePayload.field_type = patch.fieldType;
        if (patch.unit !== undefined) updatePayload.unit = patch.unit ?? null;
        if (patch.options !== undefined || patch.columns !== undefined) {
          updatePayload.options =
            patch.options || patch.columns
              ? { options: patch.options, columns: patch.columns }
              : null;
        }
        if (patch.isRequired !== undefined)
          updatePayload.is_required = patch.isRequired;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        if (patch.showInProduction !== undefined)
          updatePayload.show_in_production = patch.showInProduction;
        if (patch.sortOrder !== undefined)
          updatePayload.sort_order = patch.sortOrder;
        const { data, error: updateError } = await supabase
          .from("order_input_fields")
          .update(updatePayload)
          .eq("id", fieldId)
          .select(
            "id, key, label, group_key, field_type, unit, options, is_required, is_active, show_in_production, sort_order",
          )
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update order field.");
          notify({
            title: "Order field not updated",
            description: updateError?.message,
            variant: "error",
          });
          return;
        }
        setOrderInputFields((prev) =>
          prev.map((field) =>
            field.id === fieldId ? mapOrderInputField(data) : field,
          ),
        );
        notify({ title: "Order field updated", variant: "success" });
      },
      removeOrderInputField: async (fieldId) => {
        if (!supabase) {
          return;
        }
        const { error: deleteError } = await supabase
          .from("order_input_fields")
          .delete()
          .eq("id", fieldId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Order field not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return;
        }
        setOrderInputFields((prev) =>
          prev.filter((field) => field.id !== fieldId),
        );
        notify({ title: "Order field deleted", variant: "success" });
      },
      ensureDefaultOrderInputFields: async () => {
        if (!supabase || !user.tenantId) {
          return;
        }
        if (orderInputFields.length > 0) {
          return;
        }
        const rows = defaultOrderInputFields.map((field) => ({
          tenant_id: user.tenantId,
          key: field.key,
          label: field.label,
          group_key: field.groupKey,
          field_type: field.fieldType,
          unit: field.unit ?? null,
          options:
            field.options || field.columns
              ? { options: field.options, columns: field.columns }
              : null,
          is_required: field.isRequired,
          is_active: field.isActive,
          show_in_production: field.showInProduction ?? false,
          sort_order: field.sortOrder ?? 0,
        }));
        const { data, error: insertError } = await supabase
          .from("order_input_fields")
          .insert(rows)
          .select(
            "id, key, label, group_key, field_type, unit, options, is_required, is_active, show_in_production, sort_order",
          );
        if (insertError) {
          setError(insertError.message);
          notify({
            title: "Default fields not added",
            description: insertError.message,
            variant: "error",
          });
          return;
        }
        setOrderInputFields(
          (data ?? [])
            .filter((field) => !orderInputFieldBlacklist.has(field.key))
            .map(mapOrderInputField),
        );
        notify({ title: "Default order fields added", variant: "success" });
      },
      addStopReason: async (label) => {
        if (!supabase || !user.tenantId) {
          return;
        }
        const { data, error: insertError } = await supabase
          .from("stop_reasons")
          .insert({
            tenant_id: user.tenantId,
            label,
            is_active: true,
          })
          .select("id, label, is_active")
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add stop reason.");
          notify({
            title: "Stop reason not added",
            description: insertError?.message,
            variant: "error",
          });
          return;
        }
        setStopReasons((prev) => [...prev, mapStopReason(data)]);
        notify({ title: "Stop reason added", variant: "success" });
      },
      updateStopReason: async (reasonId, patch) => {
        if (!supabase) {
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.label !== undefined) updatePayload.label = patch.label;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        const { data, error: updateError } = await supabase
          .from("stop_reasons")
          .update(updatePayload)
          .eq("id", reasonId)
          .select("id, label, is_active")
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update stop reason.");
          notify({
            title: "Stop reason not updated",
            description: updateError?.message,
            variant: "error",
          });
          return;
        }
        setStopReasons((prev) =>
          prev.map((reason) =>
            reason.id === reasonId ? mapStopReason(data) : reason,
          ),
        );
        notify({ title: "Stop reason updated", variant: "success" });
      },
      removeStopReason: async (reasonId) => {
        if (!supabase) {
          return;
        }
        const { error: deleteError } = await supabase
          .from("stop_reasons")
          .delete()
          .eq("id", reasonId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Stop reason not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return;
        }
        setStopReasons((prev) =>
          prev.filter((reason) => reason.id !== reasonId),
        );
        notify({ title: "Stop reason deleted", variant: "success" });
      },
      addPartner: async (name, groupId) => {
        const trimmedName = name.trim();
        if (!supabase || !user.tenantId || !trimmedName) {
          return;
        }
        const { data, error: insertError } = await supabase
          .from("partners")
          .insert({
            tenant_id: user.tenantId,
            name: trimmedName,
            group_id: groupId ?? null,
            is_active: true,
          })
          .select("id, name, group_id, is_active")
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add partner.");
          notify({
            title: "Partner not added",
            description: insertError?.message,
            variant: "error",
          });
          return;
        }
        setPartners((prev) => [...prev, mapPartner(data)]);
        notify({ title: "Partner added", variant: "success" });
      },
      updatePartner: async (partnerId, patch) => {
        if (!supabase) {
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.name !== undefined) updatePayload.name = patch.name;
        if (patch.groupId !== undefined)
          updatePayload.group_id = patch.groupId || null;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        const { data, error: updateError } = await supabase
          .from("partners")
          .update(updatePayload)
          .eq("id", partnerId)
          .select("id, name, group_id, is_active")
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update partner.");
          notify({
            title: "Partner not updated",
            description: updateError?.message,
            variant: "error",
          });
          return;
        }
        setPartners((prev) =>
          prev.map((partner) =>
            partner.id === partnerId ? mapPartner(data) : partner,
          ),
        );
        notify({ title: "Partner updated", variant: "success" });
      },
      removePartner: async (partnerId) => {
        if (!supabase) {
          return;
        }
        const { error: deleteError } = await supabase
          .from("partners")
          .delete()
          .eq("id", partnerId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Partner not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return;
        }
        setPartners((prev) => prev.filter((partner) => partner.id !== partnerId));
        notify({ title: "Partner deleted", variant: "success" });
      },
      addPartnerGroup: async (name) => {
        const trimmedName = name.trim();
        if (!supabase || !user.tenantId || !trimmedName) {
          return;
        }
        const { data, error: insertError } = await supabase
          .from("partner_groups")
          .insert({
            tenant_id: user.tenantId,
            name: trimmedName,
            is_active: true,
          })
          .select("id, name, is_active")
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add partner group.");
          notify({
            title: "Partner group not added",
            description: insertError?.message,
            variant: "error",
          });
          return;
        }
        setPartnerGroups((prev) => [...prev, mapPartnerGroup(data)]);
        notify({ title: "Partner group added", variant: "success" });
      },
      updatePartnerGroup: async (groupId, patch) => {
        if (!supabase) {
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.name !== undefined) updatePayload.name = patch.name;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        const { data, error: updateError } = await supabase
          .from("partner_groups")
          .update(updatePayload)
          .eq("id", groupId)
          .select("id, name, is_active")
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update partner group.");
          notify({
            title: "Partner group not updated",
            description: updateError?.message,
            variant: "error",
          });
          return;
        }
        setPartnerGroups((prev) =>
          prev.map((group) =>
            group.id === groupId ? mapPartnerGroup(data) : group,
          ),
        );
        notify({ title: "Partner group updated", variant: "success" });
      },
      removePartnerGroup: async (groupId) => {
        if (!supabase) {
          return;
        }
        const { error: deleteError } = await supabase
          .from("partner_groups")
          .delete()
          .eq("id", groupId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Partner group not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return;
        }
        setPartnerGroups((prev) =>
          prev.filter((group) => group.id !== groupId),
        );
        setPartners((prev) =>
          prev.map((partner) =>
            partner.groupId === groupId
              ? { ...partner, groupId: undefined }
              : partner,
          ),
        );
        notify({ title: "Partner group deleted", variant: "success" });
      },
    }),
    [
      workStations,
      orderInputFields,
      stopReasons,
      partners,
      partnerGroups,
      isLoading,
      error,
      user.tenantId,
    ],
  );

  return value;
}
