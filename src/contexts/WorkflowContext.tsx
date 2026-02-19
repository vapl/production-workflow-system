"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ExternalJobStatus, OrderStatus } from "@/types/orders";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";

export type WorkflowTargetStatus =
  | "ready_for_engineering"
  | "ready_for_production"
  | "in_production";

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
  requireOrderInputsForEngineering: boolean;
  requireOrderInputsForProduction: boolean;
  dueSoonDays: number;
  dueIndicatorEnabled: boolean;
  dueIndicatorStatuses: OrderStatus[];
  orderStatusConfig: Record<OrderStatus, WorkflowStatusConfig>;
  externalJobStatusConfig: Record<ExternalJobStatus, WorkflowStatusConfig>;
  statusLabels: Record<OrderStatus, string>;
  externalJobStatusLabels: Record<ExternalJobStatus, string>;
  assignmentLabels: {
    engineer: string;
    manager: string;
  };
  attachmentCategories: {
    id: string;
    label: string;
    aiParseEnabled?: boolean;
  }[];
  attachmentCategoryDefaults: Record<string, string>;
  checklistItems: ChecklistItem[];
  returnReasons: string[];
  externalJobRules: ExternalJobRule[];
}

export interface ExternalJobRule {
  id: string;
  status: ExternalJobStatus;
  minAttachments: number;
}

export type WorkflowStatusColor =
  | "slate"
  | "blue"
  | "amber"
  | "emerald"
  | "rose";

export interface WorkflowStatusConfig {
  label: string;
  color: WorkflowStatusColor;
  isActive: boolean;
}

const validStatusColors: WorkflowStatusColor[] = [
  "slate",
  "blue",
  "amber",
  "emerald",
  "rose",
];

const requiredOrderStatusesActive: OrderStatus[] = [
  "draft",
  "ready_for_engineering",
  "in_engineering",
  "engineering_blocked",
  "ready_for_production",
  "in_production",
];

const requiredExternalStatusesActive: ExternalJobStatus[] = [
  "requested",
  "ordered",
  "in_progress",
  "delivered",
  "approved",
  "cancelled",
];

interface WorkflowContextValue {
  rules: WorkflowRules;
  setRules: (patch: Partial<WorkflowRules>) => void;
  saveError: string | null;
  isLoadedFromDb: boolean;
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
  requireOrderInputsForEngineering: true,
  requireOrderInputsForProduction: true,
  dueSoonDays: 5,
  dueIndicatorEnabled: true,
  dueIndicatorStatuses: [
    "ready_for_engineering",
    "in_engineering",
    "engineering_blocked",
    "ready_for_production",
    "in_production",
  ],
  orderStatusConfig: {
    draft: { label: "Draft", color: "slate", isActive: true },
    ready_for_engineering: {
      label: "Ready for eng.",
      color: "blue",
      isActive: true,
    },
    in_engineering: { label: "In eng.", color: "blue", isActive: true },
    engineering_blocked: {
      label: "Eng. blocked",
      color: "amber",
      isActive: true,
    },
    ready_for_production: {
      label: "Ready for prod.",
      color: "emerald",
      isActive: true,
    },
    in_production: { label: "In prod.", color: "blue", isActive: true },
    done: { label: "Done", color: "emerald", isActive: true },
  },
  externalJobStatusConfig: {
    requested: { label: "Requested", color: "slate", isActive: true },
    ordered: { label: "Ordered", color: "blue", isActive: true },
    in_progress: { label: "In progress", color: "blue", isActive: true },
    delivered: { label: "In Stock", color: "emerald", isActive: true },
    approved: { label: "Approved", color: "emerald", isActive: true },
    cancelled: { label: "Cancelled", color: "rose", isActive: true },
  },
  statusLabels: {
    draft: "Draft",
    ready_for_engineering: "Ready for eng.",
    in_engineering: "In eng.",
    engineering_blocked: "Eng. blocked",
    ready_for_production: "Ready for prod.",
    in_production: "In prod.",
    done: "Done",
  },
  externalJobStatusLabels: {
    requested: "Requested",
    ordered: "Ordered",
    in_progress: "In progress",
    delivered: "In Stock",
    approved: "Approved",
    cancelled: "Cancelled",
  },
  assignmentLabels: {
    engineer: "Engineer",
    manager: "Manager",
  },
  attachmentCategories: [
    { id: "order_documents", label: "Order documents", aiParseEnabled: false },
    {
      id: "technical_docs",
      label: "Technical documentation",
      aiParseEnabled: true,
    },
    { id: "photos", label: "Site photos", aiParseEnabled: false },
    { id: "other", label: "Other", aiParseEnabled: false },
  ],
  attachmentCategoryDefaults: {
    Sales: "order_documents",
    Engineering: "technical_docs",
    Production: "other",
    Admin: "order_documents",
  },
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

const normalizeAttachmentCategories = (
  categories:
    | {
        id: string;
        label: string;
        aiParseEnabled?: boolean;
      }[]
    | null
    | undefined,
) => {
  const source =
    categories && categories.length > 0
      ? categories
      : defaultRules.attachmentCategories;
  return source.map((item) => ({
    id: item.id,
    label: item.label,
    aiParseEnabled: Boolean(item.aiParseEnabled),
  }));
};

const mergeOrderStatusConfig = (
  raw: Partial<Record<OrderStatus, Partial<WorkflowStatusConfig>>> | null,
  labels: Partial<Record<OrderStatus, string>> | null,
): Record<OrderStatus, WorkflowStatusConfig> => {
  const next = { ...defaultRules.orderStatusConfig };
  (Object.keys(defaultRules.orderStatusConfig) as OrderStatus[]).forEach(
    (status) => {
      const current = next[status];
      const patch = raw?.[status];
      const labelPatch = labels?.[status];
      next[status] = {
        label: patch?.label ?? labelPatch ?? current.label,
        color: patch?.color ?? current.color,
        isActive: patch?.isActive ?? current.isActive,
      };
    },
  );
  return next;
};

const mergeExternalStatusConfig = (
  raw: Partial<Record<ExternalJobStatus, Partial<WorkflowStatusConfig>>> | null,
  labels: Partial<Record<ExternalJobStatus, string>> | null,
): Record<ExternalJobStatus, WorkflowStatusConfig> => {
  const next = { ...defaultRules.externalJobStatusConfig };
  (
    Object.keys(defaultRules.externalJobStatusConfig) as ExternalJobStatus[]
  ).forEach((status) => {
    const current = next[status];
    const patch = raw?.[status];
    const labelPatch = labels?.[status];
    next[status] = {
      label: patch?.label ?? labelPatch ?? current.label,
      color: patch?.color ?? current.color,
      isActive: patch?.isActive ?? current.isActive,
    };
  });
  return next;
};

const mapOrderStatusLabels = (
  config: Record<OrderStatus, WorkflowStatusConfig>,
): Record<OrderStatus, string> => ({
  draft: config.draft.label,
  ready_for_engineering: config.ready_for_engineering.label,
  in_engineering: config.in_engineering.label,
  engineering_blocked: config.engineering_blocked.label,
  ready_for_production: config.ready_for_production.label,
  in_production: config.in_production.label,
  done: config.done.label,
});

const mapExternalStatusLabels = (
  config: Record<ExternalJobStatus, WorkflowStatusConfig>,
): Record<ExternalJobStatus, string> => ({
  requested: config.requested.label,
  ordered: config.ordered.label,
  in_progress: config.in_progress.label,
  delivered: config.delivered.label,
  approved: config.approved.label,
  cancelled: config.cancelled.label,
});

const sanitizeOrderStatusConfig = (
  raw: Record<OrderStatus, WorkflowStatusConfig>,
) => {
  const next = { ...raw };
  (Object.keys(next) as OrderStatus[]).forEach((status) => {
    const fallback = defaultRules.orderStatusConfig[status];
    const current = next[status];
    next[status] = {
      label: (current.label ?? "").trim() || fallback.label,
      color: validStatusColors.includes(current.color)
        ? current.color
        : fallback.color,
      isActive: current.isActive ?? fallback.isActive,
    };
  });
  requiredOrderStatusesActive.forEach((status) => {
    next[status] = { ...next[status], isActive: true };
  });
  return next;
};

const sanitizeExternalStatusConfig = (
  raw: Record<ExternalJobStatus, WorkflowStatusConfig>,
) => {
  const next = { ...raw };
  (Object.keys(next) as ExternalJobStatus[]).forEach((status) => {
    const fallback = defaultRules.externalJobStatusConfig[status];
    const current = next[status];
    next[status] = {
      label: (current.label ?? "").trim() || fallback.label,
      color: validStatusColors.includes(current.color)
        ? current.color
        : fallback.color,
      isActive: current.isActive ?? fallback.isActive,
    };
  });
  requiredExternalStatusesActive.forEach((status) => {
    next[status] = { ...next[status], isActive: true };
  });
  return next;
};

const sanitizeDueIndicatorStatuses = (
  statuses: OrderStatus[],
  config: Record<OrderStatus, WorkflowStatusConfig>,
) => {
  const deduped = Array.from(new Set(statuses));
  const active = deduped.filter((status) => config[status]?.isActive);
  if (active.length > 0) {
    return active;
  }
  const fallback = defaultRules.dueIndicatorStatuses.filter(
    (status) => config[status]?.isActive,
  );
  return fallback.length > 0 ? fallback : [...defaultRules.dueIndicatorStatuses];
};

const WorkflowContext = createContext<WorkflowContextValue>({
  rules: defaultRules,
  setRules: () => undefined,
  saveError: null,
  isLoadedFromDb: false,
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  const cacheKey = useMemo(() => {
    if (!user.tenantId) {
      return null;
    }
    return `pws_workflow_rules_${user.tenantId}`;
  }, [user.tenantId]);

  const readCachedRules = () => {
    if (!cacheKey || typeof window === "undefined") {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as WorkflowRules;
    } catch {
      return null;
    }
  };

  const writeCachedRules = (nextRules: WorkflowRules) => {
    if (!cacheKey || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(nextRules));
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    const sb = supabase;
    if (!sb || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;

    const fetchRules = async () => {
      if (!user.tenantId) {
        setIsLoadedFromDb(true);
        setHasHydrated(true);
        return;
      }
      const cached = readCachedRules();
      if (cached) {
        const orderStatusConfig = sanitizeOrderStatusConfig(
          mergeOrderStatusConfig(cached.orderStatusConfig, cached.statusLabels),
        );
        const externalJobStatusConfig = sanitizeExternalStatusConfig(
          mergeExternalStatusConfig(
            cached.externalJobStatusConfig,
            cached.externalJobStatusLabels,
          ),
        );
        const dueIndicatorStatuses = sanitizeDueIndicatorStatuses(
          cached.dueIndicatorStatuses ?? defaultRules.dueIndicatorStatuses,
          orderStatusConfig,
        );
        setRulesState({
          ...defaultRules,
          ...cached,
          dueIndicatorStatuses,
          orderStatusConfig,
          externalJobStatusConfig,
          statusLabels: mapOrderStatusLabels(orderStatusConfig),
          externalJobStatusLabels:
            mapExternalStatusLabels(externalJobStatusConfig),
          assignmentLabels: {
            ...defaultRules.assignmentLabels,
            ...(cached.assignmentLabels ?? {}),
          },
          attachmentCategories: normalizeAttachmentCategories(
            cached.attachmentCategories,
          ),
          attachmentCategoryDefaults: {
            ...defaultRules.attachmentCategoryDefaults,
            ...(cached.attachmentCategoryDefaults ?? {}),
          },
          checklistItems: cached.checklistItems ?? defaultRules.checklistItems,
          returnReasons: cached.returnReasons ?? defaultRules.returnReasons,
          externalJobRules:
            cached.externalJobRules ?? defaultRules.externalJobRules,
        });
      }
      setHasHydrated(true);
      const [
        { data: rulesData },
        { data: checklistData },
        { data: reasonsData },
        { data: externalRulesData },
      ] = await Promise.all([
          sb
            .from("workflow_rules")
            .select(
              "min_attachments_engineering, min_attachments_production, require_comment_engineering, require_comment_production, require_order_inputs_engineering, require_order_inputs_production, due_soon_days, due_indicator_enabled, due_indicator_statuses, status_labels, external_job_status_labels, order_status_config, external_job_status_config, assignment_labels, attachment_categories, attachment_category_defaults",
            )
            .eq("tenant_id", user.tenantId)
            .maybeSingle(),
          sb
            .from("workflow_checklist_items")
            .select("id, label, required_for, is_active")
            .eq("tenant_id", user.tenantId)
            .order("created_at", { ascending: true }),
          sb
            .from("return_reasons")
            .select("label, is_active")
            .eq("tenant_id", user.tenantId)
            .order("label", { ascending: true }),
          sb
            .from("external_job_rules")
            .select("id, status, min_attachments")
            .eq("tenant_id", user.tenantId)
            .order("status", { ascending: true }),
        ]);

      if (!isMounted) {
        return;
      }

      setRulesState((prev) => {
        const orderStatusConfig = sanitizeOrderStatusConfig(
          mergeOrderStatusConfig(
            (rulesData?.order_status_config as
              | Partial<Record<OrderStatus, Partial<WorkflowStatusConfig>>>
              | null) ?? null,
            (rulesData?.status_labels as
              | Partial<Record<OrderStatus, string>>
              | null) ?? null,
          ),
        );
        const externalJobStatusConfig = sanitizeExternalStatusConfig(
          mergeExternalStatusConfig(
            (rulesData?.external_job_status_config as
              | Partial<Record<ExternalJobStatus, Partial<WorkflowStatusConfig>>>
              | null) ?? null,
            (rulesData?.external_job_status_labels as
              | Partial<Record<ExternalJobStatus, string>>
              | null) ?? null,
          ),
        );
        const dueIndicatorStatuses = sanitizeDueIndicatorStatuses(
          (rulesData?.due_indicator_statuses as OrderStatus[] | null) ??
            prev.dueIndicatorStatuses,
          orderStatusConfig,
        );
        const next = {
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
        requireOrderInputsForEngineering:
          rulesData?.require_order_inputs_engineering ??
          prev.requireOrderInputsForEngineering,
        requireOrderInputsForProduction:
          rulesData?.require_order_inputs_production ??
          prev.requireOrderInputsForProduction,
        dueSoonDays: rulesData?.due_soon_days ?? prev.dueSoonDays,
        dueIndicatorEnabled:
          rulesData?.due_indicator_enabled ?? prev.dueIndicatorEnabled,
        dueIndicatorStatuses,
        orderStatusConfig,
        externalJobStatusConfig,
        statusLabels: mapOrderStatusLabels(orderStatusConfig),
        externalJobStatusLabels:
          mapExternalStatusLabels(externalJobStatusConfig),
        assignmentLabels: {
          ...prev.assignmentLabels,
          ...(rulesData?.assignment_labels ?? {}),
        },
        attachmentCategories: normalizeAttachmentCategories(
          (rulesData?.attachment_categories as
            | { id: string; label: string; aiParseEnabled?: boolean }[]
            | null) ?? prev.attachmentCategories,
        ),
        attachmentCategoryDefaults: {
          ...prev.attachmentCategoryDefaults,
          ...(rulesData?.attachment_category_defaults ?? {}),
        },
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
        };
        writeCachedRules(next);
        return next;
      });

      if (!rulesData) {
        await sb.from("workflow_rules").insert({
          tenant_id: user.tenantId,
          min_attachments_engineering: defaultRules.minAttachmentsForEngineering,
          min_attachments_production: defaultRules.minAttachmentsForProduction,
          require_comment_engineering: defaultRules.requireCommentForEngineering,
          require_comment_production: defaultRules.requireCommentForProduction,
          require_order_inputs_engineering:
            defaultRules.requireOrderInputsForEngineering,
          require_order_inputs_production:
            defaultRules.requireOrderInputsForProduction,
          due_soon_days: defaultRules.dueSoonDays,
          due_indicator_enabled: defaultRules.dueIndicatorEnabled,
          due_indicator_statuses: defaultRules.dueIndicatorStatuses,
          order_status_config: defaultRules.orderStatusConfig,
          external_job_status_config: defaultRules.externalJobStatusConfig,
          status_labels: defaultRules.statusLabels,
          external_job_status_labels: defaultRules.externalJobStatusLabels,
          assignment_labels: defaultRules.assignmentLabels,
          attachment_categories: defaultRules.attachmentCategories,
          attachment_category_defaults: defaultRules.attachmentCategoryDefaults,
        });
      }

      if (!externalRulesData || externalRulesData.length === 0) {
        await sb.from("external_job_rules").insert(
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

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    writeCachedRules(rules);
  }, [rules, hasHydrated]);

  const setRules = (patch: Partial<WorkflowRules>) => {
    setRulesState((prev) => {
      const orderStatusConfig = sanitizeOrderStatusConfig(
        patch.orderStatusConfig ?? prev.orderStatusConfig,
      );
      const externalJobStatusConfig = sanitizeExternalStatusConfig(
        patch.externalJobStatusConfig ?? prev.externalJobStatusConfig,
      );
      const dueIndicatorStatuses = sanitizeDueIndicatorStatuses(
        patch.dueIndicatorStatuses ?? prev.dueIndicatorStatuses,
        orderStatusConfig,
      );
      const statusLabels =
        patch.statusLabels ?? mapOrderStatusLabels(orderStatusConfig);
      const externalJobStatusLabels =
        patch.externalJobStatusLabels ??
        mapExternalStatusLabels(externalJobStatusConfig);
      const next = {
        ...prev,
        ...patch,
        dueIndicatorStatuses,
        orderStatusConfig,
        externalJobStatusConfig,
        checklistItems: patch.checklistItems ?? prev.checklistItems,
        returnReasons: patch.returnReasons ?? prev.returnReasons,
        externalJobRules: patch.externalJobRules ?? prev.externalJobRules,
        statusLabels,
        externalJobStatusLabels,
        assignmentLabels: patch.assignmentLabels ?? prev.assignmentLabels,
        attachmentCategories:
          normalizeAttachmentCategories(
            patch.attachmentCategories ?? prev.attachmentCategories,
          ),
        attachmentCategoryDefaults:
          patch.attachmentCategoryDefaults ?? prev.attachmentCategoryDefaults,
      };
      if (supabase && user.tenantId) {
        void supabase
          .from("workflow_rules")
          .upsert(
            {
              tenant_id: user.tenantId,
              min_attachments_engineering: next.minAttachmentsForEngineering,
              min_attachments_production: next.minAttachmentsForProduction,
              require_comment_engineering: next.requireCommentForEngineering,
              require_comment_production: next.requireCommentForProduction,
              require_order_inputs_engineering:
                next.requireOrderInputsForEngineering,
              require_order_inputs_production:
                next.requireOrderInputsForProduction,
              due_soon_days: next.dueSoonDays,
              due_indicator_enabled: next.dueIndicatorEnabled,
              due_indicator_statuses: next.dueIndicatorStatuses,
              order_status_config: next.orderStatusConfig,
              external_job_status_config: next.externalJobStatusConfig,
              status_labels: next.statusLabels,
              external_job_status_labels: next.externalJobStatusLabels,
              assignment_labels: next.assignmentLabels,
              attachment_categories: next.attachmentCategories,
              attachment_category_defaults: next.attachmentCategoryDefaults,
            },
            { onConflict: "tenant_id" },
          )
          .then(({ error }) => {
            if (error) {
              setSaveError(error.message);
            } else {
              setSaveError(null);
            }
          });
      } else if (!user.tenantId) {
        setSaveError("No tenant assigned for this user.");
      }
      writeCachedRules(next);
      return next;
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
      .then(({ data, error }) => {
        if (error) {
          setSaveError(error.message);
          return;
        }
        if (!data) {
          return;
        }
        setSaveError(null);
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
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          setSaveError(error.message);
        } else {
          setSaveError(null);
        }
      });
  };

  const removeChecklistItem = (id: string) => {
    setRulesState((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.filter((item) => item.id !== id),
    }));
    if (!supabase) {
      return;
    }
    void supabase
      .from("workflow_checklist_items")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          setSaveError(error.message);
        } else {
          setSaveError(null);
        }
      });
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
      .then(({ error }) => {
        if (error) {
          setSaveError(error.message);
          return;
        }
        setSaveError(null);
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
      .then(({ error }) => {
        if (error) {
          setSaveError(error.message);
          return;
        }
        setSaveError(null);
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
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          setSaveError(error.message);
        } else {
          setSaveError(null);
        }
      });
  };

  const value = useMemo<WorkflowContextValue>(
    () => ({
      rules,
      setRules,
      saveError,
      isLoadedFromDb,
      addChecklistItem,
      updateChecklistItem,
      removeChecklistItem,
      addReturnReason,
      removeReturnReason,
      updateExternalJobRule,
    }),
    [
      rules,
      setRules,
      saveError,
      isLoadedFromDb,
      addChecklistItem,
      updateChecklistItem,
      removeChecklistItem,
      addReturnReason,
      removeReturnReason,
      updateExternalJobRule,
    ],
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
