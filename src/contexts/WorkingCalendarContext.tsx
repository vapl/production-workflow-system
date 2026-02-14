"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import {
  DEFAULT_WORKDAYS,
  DEFAULT_WORK_SHIFTS,
  parseWorkingCalendar,
  type WorkShift,
} from "@/lib/domain/workingCalendar";

type WorkingCalendarState = {
  workdays: number[];
  shifts: WorkShift[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const defaultState: WorkingCalendarState = {
  workdays: [...DEFAULT_WORKDAYS],
  shifts: [...DEFAULT_WORK_SHIFTS],
  isLoading: false,
  refresh: async () => undefined,
};

const WorkingCalendarContext = createContext<WorkingCalendarState>(defaultState);

export function WorkingCalendarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const [state, setState] = useState<Omit<WorkingCalendarState, "refresh">>({
    workdays: [...DEFAULT_WORKDAYS],
    shifts: [...DEFAULT_WORK_SHIFTS],
    isLoading: false,
  });

  const loadCalendar = useCallback(async (showLoading: boolean) => {
    if (!supabase || !user.tenantId || !user.isAuthenticated) {
      setState((prev) => ({
        ...prev,
        workdays: [...DEFAULT_WORKDAYS],
        shifts: [...DEFAULT_WORK_SHIFTS],
      }));
      return;
    }
    if (showLoading) {
      setState((prev) => ({ ...prev, isLoading: true }));
    }
    const { data } = await supabase
      .from("tenant_settings")
      .select("workday_start, workday_end, workdays, work_shifts")
      .eq("tenant_id", user.tenantId)
      .maybeSingle();
    const parsed = parseWorkingCalendar(data ?? {});
    setState({
      workdays: parsed.workdays,
      shifts: parsed.shifts,
      isLoading: false,
    });
  }, [user.isAuthenticated, user.tenantId]);

  const refresh = useCallback(async () => {
    await loadCalendar(true);
  }, [loadCalendar]);

  useEffect(() => {
    if (user.loading) {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadCalendar(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCalendar, user.loading]);

  return (
    <WorkingCalendarContext.Provider
      value={{
        ...state,
        refresh,
      }}
    >
      {children}
    </WorkingCalendarContext.Provider>
  );
}

export function useWorkingCalendar() {
  return useContext(WorkingCalendarContext);
}
