import { useMemo } from "react";

import { useWorkflowRules } from "@/contexts/WorkflowContext";
import { useI18n } from "@/lib/i18n/useI18n";

export function useAssignmentLabels() {
  const { rules } = useWorkflowRules();
  const { t } = useI18n();

  return useMemo(
    () => ({
      engineer:
        rules.assignmentLabels?.engineer?.trim() ||
        t("orders.page.engineerFallback"),
      manager:
        rules.assignmentLabels?.manager?.trim() ||
        t("orders.page.managerFallback"),
    }),
    [rules.assignmentLabels?.engineer, rules.assignmentLabels?.manager, t],
  );
}
