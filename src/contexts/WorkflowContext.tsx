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
  externalJobRules: ExternalJobRule[];
}

export interface ExternalJobRule {
  id: string;
  status: "requested" | "ordered" | "in_progress" | "delivered" | "approved" | "cancelled";
  minAttachments: number;
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
  updateExternalJobRule: (id: string, patch: Partial<ExternalJobRule>) => void;
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
  externalJobRules: [
    { id: "ext-requested", status: "requested", minAttachments: 0 },
    { id: "ext-ordered", status: "ordered", minAttachments: 0 },
    { id: "ext-in-progress", status: "in_progress", minAttachments: 0 },
    { id: "ext-delivered", status: "delivered", minAttachments: 1 },
    { id: "ext-approved", status: "approved", minAttachments: 1 },
    { id: "ext-cancelled", status: "cancelled", minAttachments: 0 },
  ],
};

const WorkflowContext = createContext<WorkflowContextValue>({
  rules: defaultRules,
  setRules: () => undefined,
  addChecklistItem: () => undefined,
  updateChecklistItem: () => undefined,
  removeChecklistItem: () => undefined,
  addReturnReason: () => undefined,
  removeReturnReason: () => undefined,
  updateExternalJobRule: () => undefined,
});

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const [rules, setRulesState] = useState<WorkflowRules>(defaultRules);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;

    const fetchRules = async () => {
      if (!user.tenantId) {
        setIsLoadedFromDb(true);
        return;
      }
      const [
        { data: rulesData },
        { data: checklistData },
        { data: reasonsData },
        { data: externalRulesData },
      ] = await Promise.all([
          supabase
            .from("workflow_rules")
            .select(
              "min_attachments_engineering, min_attachments_production, require_comment_engineering, require_comment_production",
            )
            .eq("tenant_id", user.tenantId)
            .maybeSingle(),
          supabase
            .from("workflow_checklist_items")
            .select("id, label, required_for, is_active")
            .eq("tenant_id", user.tenantId)
            .order("created_at", { ascending: true }),
          supabase
            .from("return_reasons")
            .select("label, is_active")
            .eq("tenant_id", user.tenantId)
            .order("label", { ascending: true }),
          supabase
            .from("external_job_rules")
            .select("id, status, min_attachments")
            .eq("tenant_id", user.tenantId)
            .order("status", { ascending: true }),
        ]);

      if (!isMounted) {
        return;
      }

      setRulesState((prev) => ({
        ...prev,
        minAttachmentsForEngineering:
          rulesData?.min_attachments_engineering ??
          prev.minAttachmentsForEngineering,
        minAttachmentsForProduction:
          rulesData?.min_attachments_production ??
          prev.minAttachmentsForProduction,
        requireCommentForEngineering:
          rulesData?.require_comment_engineering ??
          prev.requireCommentForEngineering,
        requireCommentForProduction:
          rulesData?.require_comment_production ??
          prev.requireCommentForProduction,
        checklistItems: (checklistData ?? []).map((row) => ({
          id: row.id,
          label: row.label,
          requiredFor: (row.required_for ?? []) as WorkflowTargetStatus[],
          isActive: row.is_active,
        })),
        returnReasons: (reasonsData ?? [])
          .filter((row) => row.is_active)
          .map((row) => row.label),
        externalJobRules:
          externalRulesData && externalRulesData.length > 0
            ? externalRulesData.map((row) => ({
                id: row.id,
                status: row.status,
                minAttachments: row.min_attachments ?? 0,
              }))
            : prev.externalJobRules,
      }));

      if (!rulesData) {
        await supabase.from("workflow_rules").insert({
          tenant_id: user.tenantId,
          min_attachments_engineering: defaultRules.minAttachmentsForEngineering,
          min_attachments_production: defaultRules.minAttachmentsForProduction,
          require_comment_engineering: defaultRules.requireCommentForEngineering,
          require_comment_production: defaultRules.requireCommentForProduction,
        });
      }

      if (!externalRulesData || externalRulesData.length === 0) {
        await supabase.from("external_job_rules").insert(
          defaultRules.externalJobRules.map((rule) => ({
            tenant_id: user.tenantId,
            status: rule.status,
            min_attachments: rule.minAttachments,
          })),
        );
      }

      setIsLoadedFromDb(true);
    };

    fetchRules();
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
      externalJobRules: patch.externalJobRules ?? prev.externalJobRules,
    }));
    if (!supabase || !user.tenantId) {
      return;
    }
    const next = { ...rules, ...patch };
    void supabase.from("workflow_rules").upsert({
      tenant_id: user.tenantId,
      min_attachments_engineering: next.minAttachmentsForEngineering,
      min_attachments_production: next.minAttachmentsForProduction,
      require_comment_engineering: next.requireCommentForEngineering,
      require_comment_production: next.requireCommentForProduction,
    });
  };

  const addChecklistItem = (
    label: string,
    requiredFor: WorkflowTargetStatus[],
  ) => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    if (!supabase || !user.tenantId) {
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
      return;
    }
    void supabase
      .from("workflow_checklist_items")
      .insert({
        tenant_id: user.tenantId,
        label: trimmed,
        required_for: requiredFor,
        is_active: true,
      })
      .select("id, label, required_for, is_active")
      .single()
      .then(({ data }) => {
        if (!data) {
          return;
        }
        setRulesState((prev) => ({
          ...prev,
          checklistItems: [
            ...prev.checklistItems,
            {
              id: data.id,
              label: data.label,
              requiredFor: data.required_for as WorkflowTargetStatus[],
              isActive: data.is_active,
            },
          ],
        }));
      });
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
    if (!supabase) {
      return;
    }
    void supabase
      .from("workflow_checklist_items")
      .update({
        label: patch.label,
        required_for: patch.requiredFor,
        is_active: patch.isActive,
      })
      .eq("id", id);
  };

  const removeChecklistItem = (id: string) => {
    setRulesState((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.filter((item) => item.id !== id),
    }));
    if (!supabase) {
      return;
    }
    void supabase.from("workflow_checklist_items").delete().eq("id", id);
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
      .eq("tenant_id", user.tenantId ?? "")
      .then(() => {
        setRulesState((prev) => ({
          ...prev,
          returnReasons: prev.returnReasons.filter((item) => item !== label),
        }));
      });
  };

  const updateExternalJobRule = (
    id: string,
    patch: Partial<ExternalJobRule>,
  ) => {
    setRulesState((prev) => ({
      ...prev,
      externalJobRules: prev.externalJobRules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    }));
    if (!supabase) {
      return;
    }
    void supabase
      .from("external_job_rules")
      .update({
        min_attachments: patch.minAttachments,
      })
      .eq("id", id);
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
      updateExternalJobRule,
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
