"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";
import {
  defaultTenantSubscription,
  hasTenantCapability,
  type TenantCapability,
  type TenantPlanCode,
  type TenantSubscription,
  type TenantSubscriptionStatus,
} from "@/lib/subscription";

export function useTenantSubscription() {
  const user = useCurrentUser();
  const canLoadSubscription =
    Boolean(supabase) &&
    !user.loading &&
    user.isAuthenticated &&
    Boolean(user.tenantId);
  const [subscription, setSubscription] = useState<TenantSubscription>(
    defaultTenantSubscription,
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!canLoadSubscription || !supabase || !user.tenantId) {
      return;
    }
    const sb = supabase;
    let isMounted = true;
    const fetchSubscription = async () => {
      setIsLoading(true);
      const { data, error } = await sb
        .from("tenant_subscriptions")
        .select("plan_code, status")
        .eq("tenant_id", user.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        setSubscription(defaultTenantSubscription);
        setIsLoading(false);
        return;
      }
      setSubscription({
        planCode: (data.plan_code ?? "basic") as TenantPlanCode,
        status: (data.status ?? "active") as TenantSubscriptionStatus,
      });
      setIsLoading(false);
    };
    void fetchSubscription();
    return () => {
      isMounted = false;
    };
  }, [canLoadSubscription, user.tenantId]);

  const effectiveSubscription = canLoadSubscription
    ? subscription
    : defaultTenantSubscription;

  const hasCapability = useMemo(
    () => (capability: TenantCapability) =>
      hasTenantCapability(effectiveSubscription, capability),
    [effectiveSubscription],
  );

  return {
    subscription: effectiveSubscription,
    isLoading,
    hasCapability,
  };
}
