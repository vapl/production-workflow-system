"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OrderStatus } from "@/types/orders";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";

export type WorkflowTargetStatus =
  | "ready_for_engineering"
  | "ready_for_production";

export interface ChecklistItem {
  id: string;
  label: string;
  requiredFor: WorkflowTargetStatus[];
  isActive: boolean;
}

export interface WorkflowRules {
  minAttachmentsForEngineering: number;
  minAttachmentsForProduction: number;
  requireCommentForEngineering: boolean;
  requireCommentForProduction: boolean;
  checklistItems: ChecklistItem[];
  returnReasons: string[];
}

interface WorkflowContextValue {
  rules: WorkflowRules;
  setRules: (patch: Partial<WorkflowRules>) => void;
  addChecklistItem: (
    label: string,
    requiredFor: WorkflowTargetStatus[],
  ) => void;
  updateChecklistItem: (
    id: string,
    patch: Partial<Omit<ChecklistItem, "id">>,
  ) => void;
  removeChecklistItem: (id: string) => void;
  addReturnReason: (label: string) => void;
  removeReturnReason: (label: string) => void;
}

const defaultRules: WorkflowRules = {
  minAttachmentsForEngineering: 1,
  minAttachmentsForProduction: 1,
  requireCommentForEngineering: true,
  requireCommentForProduction: true,
  checklistItems: [
    {
      id: "cl-brief",
      label: "Engineering brief complete",
      requiredFor: ["ready_for_engineering"],
      isActive: true,
    },
    {
      id: "cl-files",
      label: "Production files attached",
      requiredFor: ["ready_for_production"],
      isActive: true,
    },
  ],
  returnReasons: ["Missing info", "Incorrect data", "Awaiting approval"],
};

const WorkflowContext = createContext<WorkflowContextValue>({
  rules: defaultRules,
  setRules: () => undefined,
  addChecklistItem: () => undefined,
  updateChecklistItem: () => undefined,
  removeChecklistItem: () => undefined,
  addReturnReason: () => undefined,
  removeReturnReason: () => undefined,
});

const STORAGE_KEY = "pws_workflow_rules";

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const [rules, setRulesState] = useState<WorkflowRules>(defaultRules);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isLoadedFromDb) {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as WorkflowRules;
      setRulesState((prev) => ({
        ...prev,
        ...parsed,
        checklistItems: parsed.checklistItems ?? prev.checklistItems,
        returnReasons: parsed.returnReasons ?? prev.returnReasons,
      }));
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!isLoadedFromDb) {
      return;
    }
    const { returnReasons: _ignored, ...rest } = rules;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  }, [isLoadedFromDb, rules]);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;
    const fetchReturnReasons = async () => {
      const query = supabase
        .from("return_reasons")
        .select("label, is_active")
        .order("label", { ascending: true });
      if (user.tenantId) {
        query.eq("tenant_id", user.tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setIsLoadedFromDb(true);
        return;
      }
      setRulesState((prev) => ({
        ...prev,
        returnReasons: (data ?? [])
          .filter((row) => row.is_active)
          .map((row) => row.label),
      }));
      setIsLoadedFromDb(true);
    };
    fetchReturnReasons();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const setRules = (patch: Partial<WorkflowRules>) => {
    setRulesState((prev) => ({
      ...prev,
      ...patch,
      checklistItems: patch.checklistItems ?? prev.checklistItems,
      returnReasons: patch.returnReasons ?? prev.returnReasons,
    }));
  };

  const addChecklistItem = (
    label: string,
    requiredFor: WorkflowTargetStatus[],
  ) => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    setRulesState((prev) => ({
      ...prev,
      checklistItems: [
        ...prev.checklistItems,
        {
          id: `cl-${Date.now()}`,
          label: trimmed,
          requiredFor,
          isActive: true,
        },
      ],
    }));
  };

  const updateChecklistItem = (
    id: string,
    patch: Partial<Omit<ChecklistItem, "id">>,
  ) => {
    setRulesState((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeChecklistItem = (id: string) => {
    setRulesState((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.filter((item) => item.id !== id),
    }));
  };

  const addReturnReason = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    if (!supabase || !user.tenantId) {
      setRulesState((prev) => ({
        ...prev,
        returnReasons: [...prev.returnReasons, trimmed],
      }));
      return;
    }
    void supabase
      .from("return_reasons")
      .insert({
        tenant_id: user.tenantId,
        label: trimmed,
        is_active: true,
      })
      .then(() => {
        setRulesState((prev) => ({
          ...prev,
          returnReasons: [...prev.returnReasons, trimmed],
        }));
      });
  };

  const removeReturnReason = (label: string) => {
    if (!supabase) {
      setRulesState((prev) => ({
        ...prev,
        returnReasons: prev.returnReasons.filter((item) => item !== label),
      }));
      return;
    }
    void supabase
      .from("return_reasons")
      .update({ is_active: false })
      .eq("label", label)
      .then(() => {
        setRulesState((prev) => ({
          ...prev,
          returnReasons: prev.returnReasons.filter((item) => item !== label),
        }));
      });
  };

  const value = useMemo<WorkflowContextValue>(
    () => ({
      rules,
      setRules,
      addChecklistItem,
      updateChecklistItem,
      removeChecklistItem,
      addReturnReason,
      removeReturnReason,
    }),
    [rules],
  );

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflowRules() {
  return useContext(WorkflowContext);
}
