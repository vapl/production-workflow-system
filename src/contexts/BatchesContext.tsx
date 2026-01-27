"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Batch, BatchStatus } from "@/types/batch";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";

interface BatchesContextValue {
  batches: Batch[];
  isLoading: boolean;
  error?: string | null;
  refreshBatches: () => Promise<void>;
  addBatch: (batch: {
    orderId: string;
    name: string;
    workstation: string;
    operator?: string;
    estimatedHours: number;
    actualHours?: number;
    completedAt?: string;
    status: BatchStatus;
  }) => Promise<Batch | null>;
  updateBatch: (
    batchId: string,
    patch: Partial<{
      name: string;
      workstation: string;
      operator?: string;
      estimatedHours: number;
      actualHours?: number;
      completedAt?: string;
      status: BatchStatus;
    }>,
  ) => Promise<Batch | null>;
  removeBatch: (batchId: string) => Promise<boolean>;
}

const BatchesContext = createContext<BatchesContextValue | null>(null);

function mapBatch(row: {
  id: string;
  order_id: string;
  name: string;
  workstation_name: string;
  operator_name?: string | null;
  estimated_hours: number;
  actual_hours?: number | null;
  completed_at?: string | null;
  status: BatchStatus;
}): Batch {
  return {
    id: row.id,
    orderId: row.order_id,
    name: row.name,
    workstation: row.workstation_name,
    operator: row.operator_name ?? undefined,
    estimatedHours: Number(row.estimated_hours),
    actualHours: row.actual_hours ?? undefined,
    completedAt: row.completed_at ?? undefined,
    status: row.status,
  };
}

export function BatchesProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBatches = async () => {
    if (!supabase) {
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("batches")
      .select(
        "id, order_id, name, workstation_name, operator_name, estimated_hours, actual_hours, completed_at, status",
      )
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }
    setBatches((data ?? []).map(mapBatch));
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
      setBatches([]);
      return;
    }
    void refreshBatches();
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const value = useMemo<BatchesContextValue>(
    () => ({
      batches,
      isLoading,
      error,
      refreshBatches,
      addBatch: async (batch) => {
        if (!supabase) {
          const fallback: Batch = {
            id: crypto.randomUUID(),
            orderId: batch.orderId,
            name: batch.name,
            workstation: batch.workstation,
            operator: batch.operator,
            estimatedHours: batch.estimatedHours,
            actualHours: batch.actualHours,
            completedAt: batch.completedAt,
            status: batch.status,
          };
          setBatches((prev) => [fallback, ...prev]);
          return fallback;
        }
        if (!user.tenantId) {
          setError("Missing tenant assignment for this user.");
          return null;
        }
        const { data, error: insertError } = await supabase
          .from("batches")
          .insert({
            tenant_id: user.tenantId,
            order_id: batch.orderId,
            name: batch.name,
            workstation_name: batch.workstation,
            operator_name: batch.operator ?? null,
            estimated_hours: batch.estimatedHours,
            actual_hours: batch.actualHours ?? null,
            completed_at: batch.completedAt ?? null,
            status: batch.status,
          })
          .select(
            "id, order_id, name, workstation_name, operator_name, estimated_hours, actual_hours, completed_at, status",
          )
          .single();
        if (insertError || !data) {
          setError(insertError?.message ?? "Failed to add batch.");
          return null;
        }
        const mapped = mapBatch(data);
        setBatches((prev) => [mapped, ...prev]);
        return mapped;
      },
      updateBatch: async (batchId, patch) => {
        if (!supabase) {
          setBatches((prev) =>
            prev.map((batch) =>
              batch.id === batchId ? { ...batch, ...patch } : batch,
            ),
          );
          return batches.find((batch) => batch.id === batchId) ?? null;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.name !== undefined) updatePayload.name = patch.name;
        if (patch.workstation !== undefined)
          updatePayload.workstation_name = patch.workstation;
        if (patch.operator !== undefined)
          updatePayload.operator_name = patch.operator ?? null;
        if (patch.estimatedHours !== undefined)
          updatePayload.estimated_hours = patch.estimatedHours;
        if (patch.actualHours !== undefined)
          updatePayload.actual_hours = patch.actualHours ?? null;
        if (patch.completedAt !== undefined)
          updatePayload.completed_at = patch.completedAt ?? null;
        if (patch.status !== undefined) updatePayload.status = patch.status;
        const { data, error: updateError } = await supabase
          .from("batches")
          .update(updatePayload)
          .eq("id", batchId)
          .select(
            "id, order_id, name, workstation_name, operator_name, estimated_hours, actual_hours, completed_at, status",
          )
          .single();
        if (updateError || !data) {
          setError(updateError?.message ?? "Failed to update batch.");
          return null;
        }
        const mapped = mapBatch(data);
        setBatches((prev) =>
          prev.map((batch) => (batch.id === batchId ? mapped : batch)),
        );
        return mapped;
      },
      removeBatch: async (batchId) => {
        if (!supabase) {
          setBatches((prev) => prev.filter((batch) => batch.id !== batchId));
          return true;
        }
        const { error: deleteError } = await supabase
          .from("batches")
          .delete()
          .eq("id", batchId);
        if (deleteError) {
          setError(deleteError.message);
          return false;
        }
        setBatches((prev) => prev.filter((batch) => batch.id !== batchId));
        return true;
      },
    }),
    [batches, isLoading, error, user.tenantId],
  );

  return (
    <BatchesContext.Provider value={value}>
      {children}
    </BatchesContext.Provider>
  );
}

export function useBatches() {
  const context = useContext(BatchesContext);
  if (!context) {
    throw new Error("useBatches must be used within BatchesProvider");
  }
  return context;
}
