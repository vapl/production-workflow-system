export type TenantPlanCode = "basic" | "pro";
export type TenantSubscriptionStatus = "active" | "trial" | "cancelled";

export interface TenantSubscription {
  planCode: TenantPlanCode;
  status: TenantSubscriptionStatus;
}

export type TenantCapability =
  | "externalJobs.manualEntry"
  | "externalJobs.sendToPartner";

export const defaultTenantSubscription: TenantSubscription = {
  planCode: "basic",
  status: "active",
};

export function hasTenantCapability(
  subscription: TenantSubscription | null | undefined,
  capability: TenantCapability,
) {
  const effective = subscription ?? defaultTenantSubscription;
  switch (capability) {
    case "externalJobs.manualEntry":
      return true;
    case "externalJobs.sendToPartner":
      return (
        (effective.planCode === "pro" &&
          (effective.status === "active" || effective.status === "trial")) ??
        false
      );
    default:
      return false;
  }
}

