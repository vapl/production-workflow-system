import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeWorkedMinutesBreakdown,
  type WorkingCalendar,
} from "@/lib/domain/workingCalendar";
import type {
  ProductionWorkSessionEndedStatus,
  ProductionWorkSessionRow,
} from "@/types/production";

type StartProductionWorkSessionParams = {
  tenantId: string;
  orderId: string;
  batchRunId: string;
  productionItemId?: string | null;
  stationId?: string | null;
  operatorUserId: string;
  startedAt?: string;
};

type StopProductionWorkSessionParams = {
  tenantId: string;
  batchRunId: string;
  productionItemId?: string | null;
  operatorUserId: string;
  endedStatus: ProductionWorkSessionEndedStatus;
  stopReason?: string | null;
  stopReasonId?: string | null;
  stoppedAt?: string;
};

type StopProductionWorkSessionsParams = {
  tenantId: string;
  batchRunId: string;
  productionItemId?: string | null;
  operatorUserId?: string | null;
  endedStatus: ProductionWorkSessionEndedStatus;
  stopReason?: string | null;
  stopReasonId?: string | null;
  stoppedAt?: string;
};

export type ProductionWorkSessionRange = {
  startAt: string;
  endAt: string;
};

function normalizeNullableString(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function computeDurationMinutes(
  startedAt: string | null | undefined,
  stoppedAt: string | null | undefined,
) {
  const startMs = startedAt ? Date.parse(startedAt) : NaN;
  const stopMs = stoppedAt ? Date.parse(stoppedAt) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) {
    return 0;
  }
  return Math.max(1, Math.round((stopMs - startMs) / 60000));
}

export function getProductionWorkSessionOverlapMinutes(params: {
  session: ProductionWorkSessionRow;
  range?: ProductionWorkSessionRange | null;
  calendar?: WorkingCalendar | null;
  nowMs?: number;
}) {
  const { session, range, calendar, nowMs } = params;
  const startMs = Date.parse(session.started_at);
  const stopIso =
    session.stopped_at ??
    (session.is_active ? new Date(nowMs ?? Date.now()).toISOString() : null);
  const endMs = stopIso ? Date.parse(stopIso) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      totalMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  let overlapStartMs = startMs;
  let overlapEndMs = endMs;
  if (range) {
    const rangeStartMs = Date.parse(range.startAt);
    const rangeEndMs = Date.parse(range.endAt);
    if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs)) {
      return {
        totalMinutes: 0,
        regularMinutes: 0,
        overtimeMinutes: 0,
      };
    }
    overlapStartMs = Math.max(overlapStartMs, rangeStartMs);
    overlapEndMs = Math.min(overlapEndMs, rangeEndMs);
    if (overlapEndMs <= overlapStartMs) {
      return {
        totalMinutes: 0,
        regularMinutes: 0,
        overtimeMinutes: 0,
      };
    }
  }

  return computeWorkedMinutesBreakdown(
    new Date(overlapStartMs).toISOString(),
    new Date(overlapEndMs).toISOString(),
    calendar,
  );
}

async function findActiveSessions(
  client: SupabaseClient,
  params: {
    tenantId: string;
    batchRunId: string;
    productionItemId?: string | null;
    operatorUserId?: string | null;
  },
) {
  let query = client
    .from("production_work_sessions")
    .select(
      "id, tenant_id, order_id, batch_run_id, production_item_id, station_id, operator_user_id, started_at, stopped_at, ended_status, stop_reason, stop_reason_id, duration_minutes, is_active, created_at, updated_at",
    )
    .eq("tenant_id", params.tenantId)
    .eq("batch_run_id", params.batchRunId)
    .eq("is_active", true)
    .order("started_at", { ascending: false });

  if (normalizeNullableString(params.operatorUserId)) {
    query = query.eq("operator_user_id", params.operatorUserId);
  }

  if (normalizeNullableString(params.productionItemId)) {
    query = query.eq("production_item_id", params.productionItemId);
  } else {
    query = query.is("production_item_id", null);
  }

  const { data, error } = await query;
  return {
    data: ((data ?? []) as ProductionWorkSessionRow[]),
    error,
  };
}

export async function listActiveProductionWorkSessions(
  client: SupabaseClient,
  params: {
    tenantId: string;
    batchRunId: string;
    productionItemId?: string | null;
    operatorUserId?: string | null;
  },
) {
  return findActiveSessions(client, params);
}

export async function startProductionWorkSession(
  client: SupabaseClient,
  params: StartProductionWorkSessionParams,
) {
  const activeSessions = await findActiveSessions(client, {
    tenantId: params.tenantId,
    batchRunId: params.batchRunId,
    productionItemId: params.productionItemId ?? null,
    operatorUserId: params.operatorUserId,
  });
  if (activeSessions.error) {
    return { data: null, error: activeSessions.error };
  }
  if (activeSessions.data.length > 0) {
    return { data: activeSessions.data[0] ?? null, error: null };
  }

  const payload = {
    tenant_id: params.tenantId,
    order_id: params.orderId,
    batch_run_id: params.batchRunId,
    production_item_id: normalizeNullableString(params.productionItemId),
    station_id: normalizeNullableString(params.stationId),
    operator_user_id: params.operatorUserId,
    started_at: params.startedAt ?? new Date().toISOString(),
    is_active: true,
  };

  const { data, error } = await client
    .from("production_work_sessions")
    .insert(payload)
    .select(
      "id, tenant_id, order_id, batch_run_id, production_item_id, station_id, operator_user_id, started_at, stopped_at, ended_status, stop_reason, stop_reason_id, duration_minutes, is_active, created_at, updated_at",
    )
    .maybeSingle();

  return {
    data: (data as ProductionWorkSessionRow | null) ?? null,
    error,
  };
}

export async function stopProductionWorkSession(
  client: SupabaseClient,
  params: StopProductionWorkSessionParams,
) {
  return stopProductionWorkSessions(client, params);
}

export async function stopProductionWorkSessions(
  client: SupabaseClient,
  params: StopProductionWorkSessionsParams,
) {
  const activeSessions = await findActiveSessions(client, {
    tenantId: params.tenantId,
    batchRunId: params.batchRunId,
    productionItemId: params.productionItemId ?? null,
    operatorUserId: params.operatorUserId ?? null,
  });
  if (activeSessions.error) {
    return { data: [] as ProductionWorkSessionRow[], error: activeSessions.error };
  }
  if (activeSessions.data.length === 0) {
    return { data: [] as ProductionWorkSessionRow[], error: null };
  }

  const stoppedAt = params.stoppedAt ?? new Date().toISOString();
  const updatedRows: ProductionWorkSessionRow[] = [];

  for (const session of activeSessions.data) {
    const durationMinutes = computeDurationMinutes(session.started_at, stoppedAt);
    const { data, error } = await client
      .from("production_work_sessions")
      .update({
        stopped_at: stoppedAt,
        ended_status: params.endedStatus,
        stop_reason: params.stopReason ?? null,
        stop_reason_id: params.stopReasonId ?? null,
        duration_minutes: durationMinutes,
        is_active: false,
      })
      .eq("id", session.id)
      .select(
        "id, tenant_id, order_id, batch_run_id, production_item_id, station_id, operator_user_id, started_at, stopped_at, ended_status, stop_reason, stop_reason_id, duration_minutes, is_active, created_at, updated_at",
      )
      .maybeSingle();

    if (error) {
      return { data: updatedRows, error };
    }
    if (data) {
      updatedRows.push(data as ProductionWorkSessionRow);
    }
  }

  return { data: updatedRows, error: null };
}
