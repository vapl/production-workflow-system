"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import type { WorkStation } from "@/types/workstation";
import type { Operator } from "@/types/operator";
import { useNotifications } from "@/components/ui/Notifications";

export interface StopReason {
  id: string;
  label: string;
  isActive: boolean;
}

interface SettingsDataState {
  workStations: WorkStation[];
  operators: Operator[];
  stopReasons: StopReason[];
  isLoading: boolean;
  error?: string | null;
  addWorkStation: (payload: Omit<WorkStation, "id">) => Promise<void>;
  updateWorkStation: (
    stationId: string,
    patch: Partial<WorkStation>,
  ) => Promise<void>;
  removeWorkStation: (stationId: string) => Promise<void>;
  addOperator: (payload: Omit<Operator, "id">) => Promise<void>;
  updateOperator: (operatorId: string, patch: Partial<Operator>) => Promise<void>;
  removeOperator: (operatorId: string) => Promise<void>;
  addStopReason: (label: string) => Promise<void>;
  updateStopReason: (reasonId: string, patch: Partial<StopReason>) => Promise<void>;
  removeStopReason: (reasonId: string) => Promise<void>;
}

function mapWorkStation(row: {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}): WorkStation {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active,
  };
}

function mapOperator(row: {
  id: string;
  name: string;
  role?: string | null;
  station_id?: string | null;
  is_active: boolean;
}): Operator {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? undefined,
    stationId: row.station_id ?? undefined,
    isActive: row.is_active,
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

export function useSettingsData(): SettingsDataState {
  const user = useCurrentUser();
  const { notify } = useNotifications();
  const [workStations, setWorkStations] = useState<WorkStation[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [stopReasons, setStopReasons] = useState<StopReason[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = async () => {
    if (!supabase) {
      return;
    }
    setIsLoading(true);
    setError(null);
    const [stationsResult, operatorsResult, reasonsResult] = await Promise.all([
      supabase
        .from("workstations")
        .select("id, name, description, is_active")
        .order("created_at", { ascending: true }),
      supabase
        .from("operators")
        .select("id, name, role, station_id, is_active")
        .order("created_at", { ascending: true }),
      supabase
        .from("stop_reasons")
        .select("id, label, is_active")
        .order("created_at", { ascending: true }),
    ]);

    if (stationsResult.error || operatorsResult.error || reasonsResult.error) {
      setError(
        stationsResult.error?.message ||
          operatorsResult.error?.message ||
          reasonsResult.error?.message ||
          "Failed to load settings data.",
      );
      setIsLoading(false);
      return;
    }

    setWorkStations((stationsResult.data ?? []).map(mapWorkStation));
    setOperators((operatorsResult.data ?? []).map(mapOperator));
    setStopReasons((reasonsResult.data ?? []).map(mapStopReason));
    setIsLoading(false);
  };

  useEffect(() => {
    if (!supabase) {
      return;
    }
    if (user.loading) {
      return;
    }
    if (!user.isAuthenticated) {
      setWorkStations([]);
      setOperators([]);
      setStopReasons([]);
      return;
    }
    void refreshAll();
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const value = useMemo<SettingsDataState>(
    () => ({
      workStations,
      operators,
      stopReasons,
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
          })
          .select("id, name, description, is_active")
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
          updatePayload.description = patch.description;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        const { data, error: updateError } = await supabase
          .from("workstations")
          .update(updatePayload)
          .eq("id", stationId)
          .select("id, name, description, is_active")
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
      addOperator: async (payload) => {
        if (!supabase || !user.tenantId) {
          return;
        }
        const { data, error: insertError } = await supabase
          .from("operators")
          .insert({
            tenant_id: user.tenantId,
            name: payload.name,
            role: payload.role ?? null,
            station_id: payload.stationId ?? null,
            is_active: payload.isActive,
          })
          .select("id, name, role, station_id, is_active")
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add operator.");
          notify({
            title: "Operator not added",
            description: insertError?.message,
            variant: "error",
          });
          return;
        }
        setOperators((prev) => [...prev, mapOperator(data)]);
        notify({ title: "Operator added", variant: "success" });
      },
      updateOperator: async (operatorId, patch) => {
        if (!supabase) {
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.name !== undefined) updatePayload.name = patch.name;
        if (patch.role !== undefined) updatePayload.role = patch.role;
        if (patch.stationId !== undefined)
          updatePayload.station_id = patch.stationId || null;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        const { data, error: updateError } = await supabase
          .from("operators")
          .update(updatePayload)
          .eq("id", operatorId)
          .select("id, name, role, station_id, is_active")
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update operator.");
          notify({
            title: "Operator not updated",
            description: updateError?.message,
            variant: "error",
          });
          return;
        }
        setOperators((prev) =>
          prev.map((operator) =>
            operator.id === operatorId ? mapOperator(data) : operator,
          ),
        );
        notify({ title: "Operator updated", variant: "success" });
      },
      removeOperator: async (operatorId) => {
        if (!supabase) {
          return;
        }
        const { error: deleteError } = await supabase
          .from("operators")
          .delete()
          .eq("id", operatorId);
        if (deleteError) {
          setError(deleteError.message);
          notify({
            title: "Operator not deleted",
            description: deleteError.message,
            variant: "error",
          });
          return;
        }
        setOperators((prev) =>
          prev.filter((operator) => operator.id !== operatorId),
        );
        notify({ title: "Operator deleted", variant: "success" });
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
    }),
    [workStations, operators, stopReasons, isLoading, error, user.tenantId],
  );

  return value;
}
