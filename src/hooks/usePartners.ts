"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import type { Partner, PartnerGroup } from "@/types/partner";
import { mockPartnerGroups, mockPartners } from "@/lib/data/mockData";

export function usePartners() {
  const user = useCurrentUser();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setPartners(mockPartners);
      setGroups(mockPartnerGroups);
      return;
    }
    if (user.loading) {
      return;
    }
    if (!user.isAuthenticated) {
      setPartners([]);
      setGroups([]);
      return;
    }
    let isMounted = true;
    const fetchPartners = async () => {
      setIsLoading(true);
      const groupsQuery = supabase
        .from("partner_groups")
        .select("id, name, is_active")
        .order("created_at", { ascending: true });
      const partnersQuery = supabase
        .from("partners")
        .select("id, name, group_id, email, phone, is_active")
        .order("created_at", { ascending: true });
      if (user.tenantId) {
        groupsQuery.eq("tenant_id", user.tenantId);
        partnersQuery.eq("tenant_id", user.tenantId);
      }
      const [groupsResult, partnersResult] = await Promise.all([
        groupsQuery,
        partnersQuery,
      ]);
      if (!isMounted) {
        return;
      }
      if (groupsResult.error || partnersResult.error) {
        setPartners([]);
        setGroups([]);
        setIsLoading(false);
        return;
      }
      setPartners(
        (partnersResult.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          groupId: row.group_id ?? undefined,
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          isActive: row.is_active,
        })),
      );
      setGroups(
        (groupsResult.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          isActive: row.is_active,
        })),
      );
      setIsLoading(false);
    };
    fetchPartners();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  return useMemo(
    () => ({
      partners,
      activePartners: partners.filter((partner) => partner.isActive),
      groups,
      activeGroups: groups.filter((group) => group.isActive),
      isLoading,
    }),
    [partners, groups, isLoading],
  );
}
