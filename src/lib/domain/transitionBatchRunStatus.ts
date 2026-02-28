import type { SupabaseClient } from "@supabase/supabase-js";

export type BatchRunExecutionStatus =
  | "queued"
  | "pending"
  | "in_progress"
  | "paused"
  | "blocked"
  | "done";

export type TransitionBatchRunStatusRow = {
  id: string;
  order_id: string;
  batch_code: string;
  station_id: string | null;
  route_key: string;
  step_index: number;
  status: BatchRunExecutionStatus;
  blocked_reason: string | null;
  blocked_reason_id: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  planned_date: string | null;
  started_at: string | null;
  done_at: string | null;
  duration_minutes: number | null;
  updated_at: string;
};

type TransitionBatchRunStatusParams = {
  batchRunId: string;
  toStatus: BatchRunExecutionStatus;
  reason?: string | null;
  reasonId?: string | null;
  productionItemId?: string | null;
  actorUserId?: string | null;
};

export async function transitionBatchRunStatus(
  client: SupabaseClient,
  params: TransitionBatchRunStatusParams,
) {
  const { data, error } = await client
    .rpc("transition_batch_run_status", {
      p_batch_run_id: params.batchRunId,
      p_to_status: params.toStatus,
      p_reason: params.reason ?? null,
      p_reason_id: params.reasonId ?? null,
      p_production_item_id: params.productionItemId ?? null,
      p_actor_user_id: params.actorUserId ?? null,
    })
    .maybeSingle();

  return {
    data: (data as TransitionBatchRunStatusRow | null) ?? null,
    error,
  };
}
