"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import type { WorkStation } from "@/types/workstation";
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
  const [stopReasons, setStopReasons] = useState<StopReason[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerGroups, setPartnerGroups] = useState<PartnerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
