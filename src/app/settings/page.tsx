"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useHierarchy } from "./HierarchyContext";
import { useSettingsData } from "@/hooks/useSettingsData";
import { useCurrentUser, type UserRole } from "@/contexts/UserContext";
import { supabase, supabaseTenantLogoBucket } from "@/lib/supabaseClient";
import { uploadTenantLogo } from "@/lib/uploadTenantLogo";
import {
  useWorkflowRules,
  type WorkflowTargetStatus,
} from "@/contexts/WorkflowContext";
import type { OrderStatus } from "@/types/orders";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function getStoragePathFromUrl(url: string, bucket: string) {
  if (!url) {
    return null;
  }
  if (!url.startsWith("http")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) {
      return null;
    }
    return parsed.pathname.slice(idx + marker.length);
  } catch {
    return null;
  }
}

const userRoleOptions: UserRole[] = ["Sales", "Engineering", "Production"];

function normalizeUserRole(value?: string | null): UserRole {
  return userRoleOptions.includes(value as UserRole)
    ? (value as UserRole)
    : "Sales";
}

const integrations = [
  { id: "int-1", name: "Horizon", status: "Coming soon" },
  { id: "int-2", name: "Odoo", status: "Coming soon" },
  { id: "int-3", name: "SAP Business One", status: "Coming soon" },
  { id: "int-4", name: "QuickBooks", status: "Coming soon" },
  { id: "int-5", name: "Custom API", status: "Coming soon" },
];

const workflowStatusOptions: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ready_for_engineering", label: "Ready for engineering" },
  { value: "in_engineering", label: "In engineering" },
  { value: "engineering_blocked", label: "Engineering blocked" },
  { value: "ready_for_production", label: "Ready for production" },
];

type AttachmentRole = UserRole | "Admin";

const lockedLevelKeys = new Set([
  "contract",
  "category",
  "product",
  "manager",
  "engineer",
]);

const defaultLevelDescriptions: Record<string, string> = {
  contract: "Customer or project contract identifier.",
  category: "High-level product category or group.",
  product: "Specific product or item type.",
  manager: "Sales/lead owner responsible for the order.",
  engineer: "Assigned engineer or designer handling the order.",
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const {
    levels,
    nodes,
    addLevel,
    updateLevel,
    removeLevel,
    addNode,
    updateNode,
    removeNode,
  } = useHierarchy();

  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => a.order - b.order),
    [levels],
  );
  const selectableLevels = useMemo(
    () =>
      sortedLevels.filter(
        (level) => level.key !== "engineer" && level.key !== "manager",
      ),
    [sortedLevels],
  );

  const [levelName, setLevelName] = useState("");
  const [levelOrder, setLevelOrder] = useState<number>(sortedLevels.length + 1);
  const [levelRequired, setLevelRequired] = useState(false);
  const [levelActive, setLevelActive] = useState(true);
  const [levelShowInTable, setLevelShowInTable] = useState(true);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);

  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    selectableLevels[0]?.id ?? "",
  );
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeCode, setNodeCode] = useState("");
  const [nodeParentId, setNodeParentId] = useState<string>("none");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const {
    workStations,
    operators,
    stopReasons,
    partners,
    partnerGroups,
    addWorkStation,
    updateWorkStation,
    removeWorkStation,
    addOperator,
    updateOperator,
    removeOperator,
    addStopReason,
    updateStopReason,
    removeStopReason,
    addPartner,
    updatePartner,
    removePartner,
    addPartnerGroup,
    updatePartnerGroup,
    removePartnerGroup,
  } = useSettingsData();

  const [stationName, setStationName] = useState("");
  const [stationDescription, setStationDescription] = useState("");
  const [editingStationId, setEditingStationId] = useState<string | null>(null);

  const [operatorName, setOperatorName] = useState("");
  const [operatorRole, setOperatorRole] = useState("");
  const [operatorStationId, setOperatorStationId] = useState<string>("");
  const [operatorActive, setOperatorActive] = useState(true);
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(
    null,
  );

  const [stopReasonLabel, setStopReasonLabel] = useState("");
  const [editingStopReasonId, setEditingStopReasonId] = useState<string | null>(
    null,
  );
  const [partnerName, setPartnerName] = useState("");
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [partnerGroupId, setPartnerGroupId] = useState<string>("");
  const [partnerGroupName, setPartnerGroupName] = useState("");
  const [editingPartnerGroupId, setEditingPartnerGroupId] = useState<
    string | null
  >(null);
  const [users, setUsers] = useState<
    { id: string; name: string; role: UserRole; isAdmin: boolean }[]
  >([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [devRoleOverride, setDevRoleOverride] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyRegistrationNo, setCompanyRegistrationNo] = useState("");
  const [companyVatNo, setCompanyVatNo] = useState("");
  const [companyBillingEmail, setCompanyBillingEmail] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(
    null,
  );
  const [companyLogoState, setCompanyLogoState] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [companyLogoMessage, setCompanyLogoMessage] = useState("");
  const [companyState, setCompanyState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [companyMessage, setCompanyMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("Sales");
  const [inviteState, setInviteState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [inviteMessage, setInviteMessage] = useState("");
  const [invites, setInvites] = useState<
    {
      id: string;
      email: string;
      fullName?: string | null;
      role: UserRole;
      invitedAt: string;
      acceptedAt?: string | null;
    }[]
  >([]);
  const [isInvitesLoading, setIsInvitesLoading] = useState(false);
  const {
    rules,
    setRules,
    addChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    addReturnReason,
    removeReturnReason,
    updateExternalJobRule,
  } = useWorkflowRules();
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistRequired, setNewChecklistRequired] = useState<
    WorkflowTargetStatus[]
  >(["ready_for_engineering"]);
  const [newReturnReason, setNewReturnReason] = useState("");
  const [statusLabelDrafts, setStatusLabelDrafts] = useState<
    Record<OrderStatus, string>
  >(rules.statusLabels);
  const [statusLabelState, setStatusLabelState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [statusLabelMessage, setStatusLabelMessage] = useState("");
  const [assignmentLabelDrafts, setAssignmentLabelDrafts] = useState({
    engineer: rules.assignmentLabels?.engineer ?? "Engineer",
    manager: rules.assignmentLabels?.manager ?? "Manager",
  });
  const [assignmentLabelState, setAssignmentLabelState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [assignmentLabelMessage, setAssignmentLabelMessage] = useState("");
  const [attachmentCategoryDrafts, setAttachmentCategoryDrafts] = useState(
    rules.attachmentCategories,
  );
  const [attachmentDefaultDrafts, setAttachmentDefaultDrafts] = useState(
    rules.attachmentCategoryDefaults,
  );
  const [attachmentCategoryState, setAttachmentCategoryState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [attachmentCategoryMessage, setAttachmentCategoryMessage] =
    useState("");
  const [newAttachmentCategoryLabel, setNewAttachmentCategoryLabel] =
    useState("");
  const attachmentRoles: AttachmentRole[] = [
    "Sales",
    "Engineering",
    "Production",
    "Admin",
  ];
  const hasStatusLabelChanges = useMemo(() => {
    const keys = new Set([
      ...Object.keys(rules.statusLabels),
      ...Object.keys(statusLabelDrafts),
    ]);
    for (const key of keys) {
      if (
        (rules.statusLabels as Record<string, string>)[key] !==
        (statusLabelDrafts as Record<string, string>)[key]
      ) {
        return true;
      }
    }
    return false;
  }, [rules.statusLabels, statusLabelDrafts]);

  const maxLogoBytes = 2 * 1024 * 1024;
  const hasAssignmentLabelChanges =
    assignmentLabelDrafts.engineer.trim() !==
      (rules.assignmentLabels?.engineer ?? "Engineer") ||
    assignmentLabelDrafts.manager.trim() !==
      (rules.assignmentLabels?.manager ?? "Manager");
  const hasAttachmentCategoryChanges = useMemo(() => {
    const normalize = (items: { id: string; label: string }[]) =>
      items
        .map((item) => `${item.id}:${item.label}`)
        .sort()
        .join("|");
    return (
      normalize(attachmentCategoryDrafts) !==
        normalize(rules.attachmentCategories) ||
      JSON.stringify(attachmentDefaultDrafts) !==
        JSON.stringify(rules.attachmentCategoryDefaults)
    );
  }, [
    attachmentCategoryDrafts,
    attachmentDefaultDrafts,
    rules.attachmentCategories,
    rules.attachmentCategoryDefaults,
  ]);

  useEffect(() => {
    setStatusLabelDrafts(rules.statusLabels);
  }, [rules.statusLabels]);
  useEffect(() => {
    setAssignmentLabelDrafts({
      engineer: rules.assignmentLabels?.engineer ?? "Engineer",
      manager: rules.assignmentLabels?.manager ?? "Manager",
    });
  }, [rules.assignmentLabels]);
  useEffect(() => {
    setAttachmentCategoryDrafts(rules.attachmentCategories);
    setAttachmentDefaultDrafts(rules.attachmentCategoryDefaults);
  }, [rules.attachmentCategories, rules.attachmentCategoryDefaults]);

  useEffect(() => {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(
          "name, legal_name, registration_no, vat_no, billing_email, address, logo_url",
        )
        .eq("id", currentUser.tenantId)
        .maybeSingle();
      if (error || !data) {
        return;
      }
      setCompanyName(data.name ?? "");
      setCompanyLegalName(data.legal_name ?? "");
      setCompanyRegistrationNo(data.registration_no ?? "");
      setCompanyVatNo(data.vat_no ?? "");
      setCompanyBillingEmail(data.billing_email ?? "");
      setCompanyAddress(data.address ?? "");
      setCompanyLogoUrl(data.logo_url ?? "");
    };
    fetchCompany();
  }, [currentUser.tenantId]);

  useEffect(() => {
    return () => {
      if (companyLogoPreview) {
        URL.revokeObjectURL(companyLogoPreview);
      }
    };
  }, [companyLogoPreview]);

  useEffect(() => {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const fetchInvites = async () => {
      setIsInvitesLoading(true);
      const { data, error } = await supabase
        .from("user_invites")
        .select("id, email, full_name, role, invited_at, accepted_at")
        .eq("tenant_id", currentUser.tenantId)
        .order("invited_at", { ascending: false });
      if (!error) {
        setInvites(
          (data ?? []).map((row) => ({
            id: row.id,
            email: row.email,
            fullName: row.full_name ?? null,
            role: normalizeUserRole(row.role),
            invitedAt: row.invited_at,
            acceptedAt: row.accepted_at,
          })),
        );
      }
      setIsInvitesLoading(false);
    };
    fetchInvites();
  }, [currentUser.tenantId]);

  async function handleSaveStatusLabels() {
    if (!hasStatusLabelChanges) {
      setStatusLabelState("idle");
      setStatusLabelMessage("");
      return;
    }
    setStatusLabelState("saving");
    setStatusLabelMessage("");
    setRules({ statusLabels: statusLabelDrafts });
    if (!supabase || !currentUser.tenantId) {
      setStatusLabelState("saved");
      setStatusLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert({
      tenant_id: currentUser.tenantId,
      status_labels: statusLabelDrafts,
    });
    if (error) {
      setStatusLabelState("error");
      setStatusLabelMessage(error.message);
      return;
    }
    setStatusLabelState("saved");
    setStatusLabelMessage("Status labels saved.");
  }

  async function handleSaveAssignmentLabels() {
    if (!hasAssignmentLabelChanges) {
      setAssignmentLabelState("idle");
      setAssignmentLabelMessage("");
      return;
    }
    const nextEngineer = assignmentLabelDrafts.engineer.trim() || "Engineer";
    const nextManager = assignmentLabelDrafts.manager.trim() || "Manager";
    setAssignmentLabelState("saving");
    setAssignmentLabelMessage("");
    setRules({
      assignmentLabels: {
        ...rules.assignmentLabels,
        engineer: nextEngineer,
        manager: nextManager,
      },
    });
    if (!supabase || !currentUser.tenantId) {
      setAssignmentLabelState("saved");
      setAssignmentLabelMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert({
      tenant_id: currentUser.tenantId,
      assignment_labels: {
        ...rules.assignmentLabels,
        engineer: nextEngineer,
        manager: nextManager,
      },
    });
    if (error) {
      setAssignmentLabelState("error");
      setAssignmentLabelMessage(error.message);
      return;
    }
    setAssignmentLabelState("saved");
    setAssignmentLabelMessage("Assignment labels saved.");
  }

  async function handleSaveAttachmentCategories() {
    if (!hasAttachmentCategoryChanges) {
      setAttachmentCategoryState("idle");
      setAttachmentCategoryMessage("");
      return;
    }
    setAttachmentCategoryState("saving");
    setAttachmentCategoryMessage("");
    setRules({
      attachmentCategories: attachmentCategoryDrafts,
      attachmentCategoryDefaults: attachmentDefaultDrafts,
    });
    if (!supabase || !currentUser.tenantId) {
      setAttachmentCategoryState("saved");
      setAttachmentCategoryMessage("Saved locally.");
      return;
    }
    const { error } = await supabase.from("workflow_rules").upsert({
      tenant_id: currentUser.tenantId,
      attachment_categories: attachmentCategoryDrafts,
      attachment_category_defaults: attachmentDefaultDrafts,
    });
    if (error) {
      setAttachmentCategoryState("error");
      setAttachmentCategoryMessage(error.message);
      return;
    }
    setAttachmentCategoryState("saved");
    setAttachmentCategoryMessage("Attachment categories saved.");
  }

  async function handleSaveCompany() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setCompanyState("saving");
    setCompanyMessage("");
    const { error } = await supabase
      .from("tenants")
      .update({
        name: companyName.trim(),
        legal_name: companyLegalName.trim() || null,
        registration_no: companyRegistrationNo.trim() || null,
        vat_no: companyVatNo.trim() || null,
        billing_email: companyBillingEmail.trim() || null,
        address: companyAddress.trim() || null,
        logo_url: companyLogoUrl.trim() || null,
      })
      .eq("id", currentUser.tenantId);
    if (error) {
      setCompanyState("error");
      setCompanyMessage(error.message);
      return;
    }
    setCompanyState("saved");
    setCompanyMessage("Company details saved.");
  }

  async function handleInviteUser() {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!supabase || !currentUser.tenantId || !trimmed) {
      return;
    }
    setInviteState("sending");
    setInviteMessage("");
    const { data: inviteRow, error: insertError } = await supabase
      .from("user_invites")
      .insert({
        tenant_id: currentUser.tenantId,
        email: trimmed,
        full_name: inviteFullName.trim() || null,
        role: inviteRole,
        invited_by: currentUser.id,
      })
      .select("id, email, full_name, role, invited_at, accepted_at")
      .single();
    if (insertError || !inviteRow) {
      setInviteState("error");
      setInviteMessage(insertError.message);
      return;
    }
    const response = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: trimmed, mode: "invite" }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setInviteState("error");
      setInviteMessage(data.error ?? "Failed to send invite.");
      return;
    }
    setInviteState("sent");
    setInviteMessage("Invite sent.");
    setInviteEmail("");
    setInviteFullName("");
    setInvites((prev) => [
      {
        id: inviteRow.id,
        email: inviteRow.email,
        fullName: inviteRow.full_name ?? null,
        role: normalizeUserRole(inviteRow.role),
        invitedAt: inviteRow.invited_at,
        acceptedAt: inviteRow.accepted_at,
      },
      ...prev,
    ]);
  }

  async function handleUploadCompanyLogo() {
    if (!companyLogoFile || !currentUser.tenantId) {
      return;
    }
    setCompanyLogoState("uploading");
    setCompanyLogoMessage("");
    const result = await uploadTenantLogo(
      companyLogoFile,
      currentUser.tenantId,
    );
    if (!result.url || result.error) {
      setCompanyLogoState("error");
      const rawMessage = result.error ?? "Upload failed.";
      if (rawMessage.toLowerCase().includes("bucket")) {
        setCompanyLogoMessage(
          `Bucket not found. Create a "${process.env.NEXT_PUBLIC_SUPABASE_TENANT_BUCKET || "tenant-logos"}" bucket in Supabase Storage.`,
        );
      } else {
        setCompanyLogoMessage(rawMessage);
      }
      return;
    }
    setCompanyLogoState("uploaded");
    setCompanyLogoMessage("Logo uploaded.");
    setCompanyLogoUrl(result.url);
    setCompanyLogoFile(null);
    if (companyLogoPreview) {
      URL.revokeObjectURL(companyLogoPreview);
      setCompanyLogoPreview(null);
    }
    if (!supabase) {
      return;
    }
    await supabase
      .from("tenants")
      .update({ logo_url: result.url })
      .eq("id", currentUser.tenantId);
  }

  async function handleDeleteCompanyLogo() {
    if (!supabase || !currentUser.tenantId || !companyLogoUrl) {
      return;
    }
    setCompanyLogoState("uploading");
    setCompanyLogoMessage("");
    const storagePath = getStoragePathFromUrl(
      companyLogoUrl,
      supabaseTenantLogoBucket,
    );
    if (storagePath) {
      await supabase.storage
        .from(supabaseTenantLogoBucket)
        .remove([storagePath]);
    }
    const { error } = await supabase
      .from("tenants")
      .update({ logo_url: null })
      .eq("id", currentUser.tenantId);
    if (error) {
      setCompanyLogoState("error");
      setCompanyLogoMessage(error.message);
      return;
    }
    setCompanyLogoUrl("");
    setCompanyLogoFile(null);
    if (companyLogoPreview) {
      URL.revokeObjectURL(companyLogoPreview);
      setCompanyLogoPreview(null);
    }
    setCompanyLogoState("uploaded");
    setCompanyLogoMessage("Logo removed.");
  }

  async function handleResendInvite(email: string) {
    if (!supabase) {
      return;
    }
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: origin ? `${origin}/auth` : undefined,
      },
    });
  }

  async function handleCancelInvite(inviteId: string) {
    if (!supabase) {
      return;
    }
    const { error } = await supabase
      .from("user_invites")
      .delete()
      .eq("id", inviteId);
    if (!error) {
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    }
  }

  function handleAddAttachmentCategory() {
    const trimmed = newAttachmentCategoryLabel.trim();
    if (!trimmed) {
      return;
    }
    const baseId = slugify(trimmed);
    if (!baseId) {
      return;
    }
    let nextId = baseId;
    let counter = 2;
    const existingIds = new Set(
      attachmentCategoryDrafts.map((item) => item.id),
    );
    while (existingIds.has(nextId)) {
      nextId = `${baseId}-${counter}`;
      counter += 1;
    }
    const nextCategories = [
      ...attachmentCategoryDrafts,
      { id: nextId, label: trimmed },
    ];
    setAttachmentCategoryDrafts(nextCategories);
    if (!attachmentDefaultDrafts.Sales) {
      setAttachmentDefaultDrafts((prev) => ({
        ...prev,
        Sales: nextId,
      }));
    }
    setNewAttachmentCategoryLabel("");
  }

  function handleRemoveAttachmentCategory(id: string) {
    const nextCategories = attachmentCategoryDrafts.filter(
      (item) => item.id !== id,
    );
    setAttachmentCategoryDrafts(nextCategories);
    if (nextCategories.length === 0) {
      setAttachmentDefaultDrafts({});
      return;
    }
    const fallbackId = nextCategories[0].id;
    setAttachmentDefaultDrafts((prev) => {
      const nextDefaults = { ...prev };
      attachmentRoles.forEach((role) => {
        if (nextDefaults[role] === id) {
          nextDefaults[role] = fallbackId;
        }
      });
      return nextDefaults;
    });
  }

  useEffect(() => {
    if (!selectedLevelId && selectableLevels[0]?.id) {
      setSelectedLevelId(selectableLevels[0].id);
      return;
    }
    if (
      selectedLevelId &&
      !levels.some((level) => level.id === selectedLevelId)
    ) {
      setSelectedLevelId(selectableLevels[0]?.id ?? "");
    }
  }, [levels, selectableLevels, selectedLevelId]);

  useEffect(() => {
    setLevelOrder(sortedLevels.length + 1);
  }, [sortedLevels.length]);

  useEffect(() => {
    if (!supabase) {
      setUsers([
        {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          isAdmin: currentUser.isAdmin,
        },
      ]);
      return;
    }
    if (currentUser.loading || !currentUser.isAuthenticated) {
      setUsers([]);
      return;
    }
    let isMounted = true;
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      setUsersError(null);
      const query = supabase
        .from("profiles")
        .select("id, full_name, role, tenant_id, is_admin")
        .order("full_name", { ascending: true });
      if (currentUser.tenantId) {
        query.eq("tenant_id", currentUser.tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setUsersError(error.message);
        setIsUsersLoading(false);
        return;
      }
      setUsers(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.full_name ?? "User",
          role: normalizeUserRole(row.role),
          isAdmin: row.is_admin ?? false,
        })),
      );
      setIsUsersLoading(false);
    };
    fetchUsers();
    return () => {
      isMounted = false;
    };
  }, [
    currentUser.id,
    currentUser.isAuthenticated,
    currentUser.loading,
    currentUser.name,
    currentUser.role,
    currentUser.isAdmin,
    currentUser.tenantId,
  ]);

  async function handleUpdateUserRole(userId: string, role: UserRole) {
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role } : user)),
      );
      return;
    }
    setUpdatingUserId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (error) {
      setUsersError(error.message);
      setUpdatingUserId(null);
      return;
    }
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role } : user)),
    );
    setUpdatingUserId(null);
  }

  async function handleUpdateUserAdmin(userId: string, isAdmin: boolean) {
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, isAdmin } : user)),
      );
      return;
    }
    setUpdatingUserId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: isAdmin })
      .eq("id", userId);
    if (error) {
      setUsersError(error.message);
      setUpdatingUserId(null);
      return;
    }
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, isAdmin } : user)),
    );
    setUpdatingUserId(null);
  }

  const selectedLevel = levels.find((level) => level.id === selectedLevelId);
  const selectedLevelOrder = selectedLevel?.order ?? 0;
  const parentLevel = useMemo(
    () =>
      selectableLevels
        .filter((level) => level.order < selectedLevelOrder && level.isActive)
        .at(-1),
    [selectableLevels, selectedLevelOrder],
  );

  const parentNodes = parentLevel
    ? nodes.filter((node) => node.levelId === parentLevel.id)
    : [];
  const currentLevelNodes = nodes.filter(
    (node) => node.levelId === selectedLevelId,
  );

  function resetLevelForm() {
    setLevelName("");
    setLevelRequired(false);
    setLevelActive(true);
    setLevelShowInTable(true);
    setEditingLevelId(null);
  }

  function handleSaveLevel() {
    const trimmedName = levelName.trim();
    if (!trimmedName) {
      return;
    }
    const existingKey = editingLevelId
      ? levels.find((level) => level.id === editingLevelId)?.key
      : undefined;
    const normalizedKey = existingKey || slugify(trimmedName);
    if (editingLevelId) {
      updateLevel(editingLevelId, {
        name: trimmedName,
        key: normalizedKey,
        order: levelOrder,
        isRequired: levelRequired,
        isActive: levelActive,
        showInTable: levelShowInTable,
      });
      resetLevelForm();
      return;
    }

    void addLevel({
      name: trimmedName,
      key: normalizedKey,
      order: levelOrder,
      isRequired: levelRequired,
      isActive: levelActive,
      showInTable: levelShowInTable,
    });
    resetLevelForm();
  }

  function handleEditLevel(levelId: string) {
    const level = levels.find((item) => item.id === levelId);
    if (!level) {
      return;
    }
    setEditingLevelId(levelId);
    setLevelName(level.name);
    setLevelOrder(level.order);
    setLevelRequired(level.isRequired);
    setLevelActive(level.isActive);
    setLevelShowInTable(level.showInTable);
  }

  function resetNodeForm() {
    setNodeLabel("");
    setNodeCode("");
    setNodeParentId("none");
    setEditingNodeId(null);
  }

  function handleSaveNode() {
    if (!selectedLevel) {
      return;
    }
    const trimmedLabel = nodeLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const parentIdValue = nodeParentId === "none" ? null : nodeParentId;
    if (editingNodeId) {
      updateNode(editingNodeId, {
        label: trimmedLabel,
        code: nodeCode.trim() || undefined,
        parentId: parentIdValue,
      });
      resetNodeForm();
      return;
    }
    void addNode({
      levelId: selectedLevel.id,
      label: trimmedLabel,
      code: nodeCode.trim() || undefined,
      parentId: parentIdValue,
    });
    resetNodeForm();
  }

  function handleEditNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    setEditingNodeId(nodeId);
    setNodeLabel(node.label);
    setNodeCode(node.code ?? "");
    setNodeParentId(node.parentId ?? "none");
  }

  function resetStationForm() {
    setStationName("");
    setStationDescription("");
    setEditingStationId(null);
  }

  async function handleSaveStation() {
    const trimmedName = stationName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingStationId) {
      await updateWorkStation(editingStationId, {
        name: trimmedName,
        description: stationDescription.trim() || undefined,
      });
      resetStationForm();
      return;
    }
    await addWorkStation({
      name: trimmedName,
      description: stationDescription.trim() || undefined,
      isActive: true,
    });
    resetStationForm();
  }

  function handleEditStation(stationId: string) {
    const station = workStations.find((item) => item.id === stationId);
    if (!station) {
      return;
    }
    setEditingStationId(stationId);
    setStationName(station.name);
    setStationDescription(station.description ?? "");
  }

  function resetOperatorForm() {
    setOperatorName("");
    setOperatorRole("");
    setOperatorStationId("");
    setOperatorActive(true);
    setEditingOperatorId(null);
  }

  async function handleSaveOperator() {
    const trimmedName = operatorName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingOperatorId) {
      await updateOperator(editingOperatorId, {
        name: trimmedName,
        role: operatorRole.trim() || undefined,
        stationId: operatorStationId || undefined,
        isActive: operatorActive,
      });
      resetOperatorForm();
      return;
    }
    await addOperator({
      name: trimmedName,
      role: operatorRole.trim() || undefined,
      stationId: operatorStationId || undefined,
      isActive: operatorActive,
    });
    resetOperatorForm();
  }

  function handleEditOperator(operatorId: string) {
    const operator = operators.find((item) => item.id === operatorId);
    if (!operator) {
      return;
    }
    setEditingOperatorId(operatorId);
    setOperatorName(operator.name);
    setOperatorRole(operator.role ?? "");
    setOperatorStationId(operator.stationId ?? "");
    setOperatorActive(operator.isActive);
  }

  function resetStopReasonForm() {
    setStopReasonLabel("");
    setEditingStopReasonId(null);
  }

  async function handleSaveStopReason() {
    const trimmedLabel = stopReasonLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    if (editingStopReasonId) {
      await updateStopReason(editingStopReasonId, { label: trimmedLabel });
      resetStopReasonForm();
      return;
    }
    await addStopReason(trimmedLabel);
    resetStopReasonForm();
  }

  function handleEditStopReason(reasonId: string) {
    const reason = stopReasons.find((item) => item.id === reasonId);
    if (!reason) {
      return;
    }
    setEditingStopReasonId(reasonId);
    setStopReasonLabel(reason.label);
  }

  function resetPartnerForm() {
    setPartnerName("");
    setPartnerGroupId("");
    setEditingPartnerId(null);
  }

  async function handleSavePartner() {
    const trimmedName = partnerName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingPartnerId) {
      await updatePartner(editingPartnerId, {
        name: trimmedName,
        groupId: partnerGroupId || undefined,
      });
      resetPartnerForm();
      return;
    }
    await addPartner(trimmedName, partnerGroupId || undefined);
    resetPartnerForm();
  }

  function handleEditPartner(partnerId: string) {
    const partner = partners.find((item) => item.id === partnerId);
    if (!partner) {
      return;
    }
    setEditingPartnerId(partnerId);
    setPartnerName(partner.name);
    setPartnerGroupId(partner.groupId ?? "");
  }

  function resetPartnerGroupForm() {
    setPartnerGroupName("");
    setEditingPartnerGroupId(null);
  }

  async function handleSavePartnerGroup() {
    const trimmedName = partnerGroupName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingPartnerGroupId) {
      await updatePartnerGroup(editingPartnerGroupId, { name: trimmedName });
      resetPartnerGroupForm();
      return;
    }
    await addPartnerGroup(trimmedName);
    resetPartnerGroupForm();
  }

  function handleEditPartnerGroup(groupId: string) {
    const group = partnerGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    setEditingPartnerGroupId(groupId);
    setPartnerGroupName(group.name);
  }

  const [activeTab, setActiveTab] = useState("structure");

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <section className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="structure">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Hierarchy Levels</CardTitle>
                <CardDescription>
                  Define the order of fields users select when creating orders.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(200px,1.2fr)_minmax(120px,0.5fr)_minmax(240px,1fr)_auto] lg:items-end">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Level name</label>
                    <input
                      value={levelName}
                      onChange={(event) => {
                        setLevelName(event.target.value);
                      }}
                      placeholder="Contract"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Order</label>
                    <input
                      type="number"
                      min={1}
                      value={levelOrder}
                      onChange={(event) =>
                        setLevelOrder(Number(event.target.value) || 1)
                      }
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelRequired}
                        onChange={(event) =>
                          setLevelRequired(event.target.checked)
                        }
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelActive}
                        onChange={(event) =>
                          setLevelActive(event.target.checked)
                        }
                      />
                      Active
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelShowInTable}
                        onChange={(event) =>
                          setLevelShowInTable(event.target.checked)
                        }
                      />
                      Show in table
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveLevel}>
                      {editingLevelId ? "Save level" : "Add level"}
                    </Button>
                    {editingLevelId && (
                      <Button variant="outline" onClick={resetLevelForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Default meanings (do not repurpose): Contract, Product
                  category, Product, Sales management, Engineering. You can
                  rename the labels, but keep their meaning.
                </p>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Level
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Order
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Required
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Active
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          In table
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLevels.map((level) => (
                        <tr key={level.id} className="border-t border-border">
                          <td className="px-4 py-2">
                            <div className="font-medium">
                              {level.name}
                              {lockedLevelKeys.has(level.key) && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  Default
                                </span>
                              )}
                            </div>
                            {lockedLevelKeys.has(level.key) &&
                              defaultLevelDescriptions[level.key] && (
                                <div className="text-xs text-muted-foreground">
                                  {defaultLevelDescriptions[level.key]}
                                </div>
                              )}
                          </td>
                          <td className="px-4 py-2">{level.order}</td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={level.isRequired}
                                onChange={(event) =>
                                  updateLevel(level.id, {
                                    isRequired: event.target.checked,
                                  })
                                }
                              />
                              {level.isRequired ? "Yes" : "No"}
                            </label>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={level.isActive}
                                onChange={(event) =>
                                  updateLevel(level.id, {
                                    isActive: event.target.checked,
                                  })
                                }
                              />
                              {level.isActive ? "Active" : "Hidden"}
                            </label>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={level.showInTable}
                                onChange={(event) =>
                                  updateLevel(level.id, {
                                    showInTable: event.target.checked,
                                  })
                                }
                              />
                              {level.showInTable ? "Shown" : "Hidden"}
                            </label>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditLevel(level.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLevel(level.id)}
                                disabled={lockedLevelKeys.has(level.key)}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sortedLevels.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            Add your first hierarchy level.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reference Lists</CardTitle>
                <CardDescription>
                  Maintain the selectable values for each hierarchy level.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Level</label>
                    <select
                      value={selectedLevelId}
                      onChange={(event) =>
                        setSelectedLevelId(event.target.value)
                      }
                      className="h-10 min-w-50 rounded-lg border border-border bg-input-background px-3 text-sm"
                    >
                      {selectableLevels.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {parentLevel && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">
                        Parent ({parentLevel.name})
                      </label>
                      <select
                        value={nodeParentId}
                        onChange={(event) =>
                          setNodeParentId(event.target.value)
                        }
                        className="h-10 min-w-50 rounded-lg border border-border bg-input-background px-3 text-sm"
                      >
                        <option value="none">No parent</option>
                        {parentNodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.6fr)_auto] lg:items-end">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Label</label>
                    <input
                      value={nodeLabel}
                      onChange={(event) => setNodeLabel(event.target.value)}
                      placeholder="Enter label"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">
                      Code (optional)
                    </label>
                    <input
                      value={nodeCode}
                      onChange={(event) => setNodeCode(event.target.value)}
                      placeholder="Optional code"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveNode}>
                      {editingNodeId ? "Save item" : "Add item"}
                    </Button>
                    {editingNodeId && (
                      <Button variant="outline" onClick={resetNodeForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Code
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Parent
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentLevelNodes.map((node) => (
                        <tr key={node.id} className="border-t border-border">
                          <td className="px-4 py-2 font-medium">
                            {node.label}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {node.code ?? "--"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {node.parentId
                              ? (nodes.find((item) => item.id === node.parentId)
                                  ?.label ?? "--")
                              : "--"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditNode(node.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeNode(node.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {currentLevelNodes.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            Add items for this level.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations">
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Work Stations</CardTitle>
                  <CardDescription>
                    Manage the list of production stations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(240px,1.2fr)_auto] lg:items-end">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">
                        Station name
                      </label>
                      <input
                        value={stationName}
                        onChange={(event) => setStationName(event.target.value)}
                        placeholder="Cutting"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Description</label>
                      <input
                        value={stationDescription}
                        onChange={(event) =>
                          setStationDescription(event.target.value)
                        }
                        placeholder="Sawing and prep"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveStation}>
                        {editingStationId ? "Save station" : "Add station"}
                      </Button>
                      {editingStationId && (
                        <Button variant="outline" onClick={resetStationForm}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {workStations.map((station) => (
                      <div
                        key={station.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                      >
                        <div>
                          <div className="font-medium">{station.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {station.description ?? "No description"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={station.isActive}
                              onChange={(event) =>
                                updateWorkStation(station.id, {
                                  isActive: event.target.checked,
                                })
                              }
                            />
                            Active
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditStation(station.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeWorkStation(station.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Operators</CardTitle>
                  <CardDescription>
                    Keep track of operators assigned to each station.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                    <div className="flex min-w-50 flex-1 flex-col gap-2">
                      <label className="text-sm font-medium">Name</label>
                      <input
                        value={operatorName}
                        onChange={(event) =>
                          setOperatorName(event.target.value)
                        }
                        placeholder="Operator name"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
                    <div className="flex min-w-35 flex-1 flex-col gap-2">
                      <label className="text-sm font-medium">Role</label>
                      <input
                        value={operatorRole}
                        onChange={(event) =>
                          setOperatorRole(event.target.value)
                        }
                        placeholder="Operator"
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </div>
                    <div className="flex min-w-45 flex-1 flex-col gap-2">
                      <label className="text-sm font-medium">Station</label>
                      <select
                        value={operatorStationId}
                        onChange={(event) =>
                          setOperatorStationId(event.target.value)
                        }
                        className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {workStations.map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={operatorActive}
                          onChange={(event) =>
                            setOperatorActive(event.target.checked)
                          }
                        />
                        Active
                      </label>
                      <Button onClick={handleSaveOperator}>
                        {editingOperatorId ? "Save operator" : "Add operator"}
                      </Button>
                      {editingOperatorId && (
                        <Button variant="outline" onClick={resetOperatorForm}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {operators.map((operator) => (
                      <div
                        key={operator.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                      >
                        <div>
                          <div className="font-medium">{operator.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {operator.role ?? "Operator"}{" "}
                            {operator.stationId
                              ? `- ${
                                  workStations.find(
                                    (station) =>
                                      station.id === operator.stationId,
                                  )?.name ?? "Unassigned"
                                }`
                              : "- Unassigned"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={operator.isActive}
                              onChange={(event) =>
                                updateOperator(operator.id, {
                                  isActive: event.target.checked,
                                })
                              }
                            />
                            Active
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditOperator(operator.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeOperator(operator.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Stop Reasons</CardTitle>
                <CardDescription>
                  Reasons appear when a station pauses a task.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Reason</label>
                    <input
                      value={stopReasonLabel}
                      onChange={(event) =>
                        setStopReasonLabel(event.target.value)
                      }
                      placeholder="Missing material"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveStopReason}>
                      {editingStopReasonId ? "Save reason" : "Add reason"}
                    </Button>
                    {editingStopReasonId && (
                      <Button variant="outline" onClick={resetStopReasonForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {stopReasons.map((reason) => (
                    <div
                      key={reason.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="font-medium">{reason.label}</div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={reason.isActive}
                            onChange={(event) =>
                              updateStopReason(reason.id, {
                                isActive: event.target.checked,
                              })
                            }
                          />
                          Active
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditStopReason(reason.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStopReason(reason.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="partners">
          <Card>
            <CardHeader>
              <CardTitle>Partners</CardTitle>
              <CardDescription>
                Maintain external suppliers for outsourced steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.7fr)_auto] lg:items-end">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Partner name</label>
                  <input
                    value={partnerName}
                    onChange={(event) => setPartnerName(event.target.value)}
                    placeholder="Baltic Glass"
                    className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Group</label>
                  <select
                    value={partnerGroupId}
                    onChange={(event) => setPartnerGroupId(event.target.value)}
                    className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                  >
                    <option value="">No group</option>
                    {partnerGroups
                      .filter((group) => group.isActive)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSavePartner}>
                    {editingPartnerId ? "Save partner" : "Add partner"}
                  </Button>
                  {editingPartnerId && (
                    <Button variant="outline" onClick={resetPartnerForm}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {partners.map((partner) => (
                  <div
                    key={partner.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                  >
                    <div>
                      <div className="font-medium">{partner.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {partner.groupId
                          ? (partnerGroups.find(
                              (group) => group.id === partner.groupId,
                            )?.name ?? "Group")
                          : "No group"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={partner.isActive}
                          onChange={(event) =>
                            updatePartner(partner.id, {
                              isActive: event.target.checked,
                            })
                          }
                        />
                        Active
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditPartner(partner.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePartner(partner.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {partners.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No partners yet.
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <div className="text-sm font-medium">Partner groups</div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Group name</label>
                    <input
                      value={partnerGroupName}
                      onChange={(event) =>
                        setPartnerGroupName(event.target.value)
                      }
                      placeholder="Glass"
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSavePartnerGroup}>
                      {editingPartnerGroupId ? "Save group" : "Add group"}
                    </Button>
                    {editingPartnerGroupId && (
                      <Button variant="outline" onClick={resetPartnerGroupForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {partnerGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="font-medium">{group.name}</div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={group.isActive}
                            onChange={(event) =>
                              updatePartnerGroup(group.id, {
                                isActive: event.target.checked,
                              })
                            }
                          />
                          Active
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPartnerGroup(group.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePartnerGroup(group.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {partnerGroups.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No partner groups yet.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Access</CardTitle>
              <CardDescription>
                Manage who can access this workspace and their role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-sm font-medium">Invite user</div>
                <div className="mt-3 grid gap-3 items-center md:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(140px,0.5fr)_auto] md:items-end">
                  <label className="space-y-2 text-sm font-medium">
                    Email
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="user@company.com"
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Full name
                    <input
                      value={inviteFullName}
                      onChange={(event) => setInviteFullName(event.target.value)}
                      placeholder="Full name"
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      disabled={!currentUser.isAdmin}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Role
                    <select
                      value={inviteRole}
                      onChange={(event) =>
                        setInviteRole(event.target.value as UserRole)
                      }
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      disabled={!currentUser.isAdmin}
                    >
                      {userRoleOptions.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {roleOption}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    onClick={handleInviteUser}
                    disabled={
                      !currentUser.isAdmin ||
                      inviteState === "sending"
                    }
                  >
                    {inviteState === "sending" ? "Sending..." : "Send invite"}
                  </Button>
                </div>
                {inviteMessage && (
                  <p
                    className={`mt-2 text-xs ${
                      inviteState === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {inviteMessage}
                  </p>
                )}
              </div>
              {!currentUser.isAdmin && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Only admins can update user roles or admin access.
                </div>
              )}
              {process.env.NODE_ENV !== "production" &&
                !currentUser.isAdmin && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={devRoleOverride}
                      onChange={(event) =>
                        setDevRoleOverride(event.target.checked)
                      }
                    />
                    Dev override: allow changing your own role
                  </label>
                )}
              {usersError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {usersError}
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Name</th>
                      <th className="px-4 py-2 text-left font-medium">Role</th>
                      <th className="px-4 py-2 text-left font-medium">Admin</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isUsersLoading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          Loading users...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="border-t border-border">
                          <td className="px-4 py-2 font-medium">{user.name}</td>
                          <td className="px-4 py-2">
                            <select
                              value={user.role}
                              onChange={(event) =>
                                handleUpdateUserRole(
                                  user.id,
                                  event.target.value as UserRole,
                                )
                              }
                              className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
                              disabled={
                                !currentUser.isAdmin &&
                                !(devRoleOverride && user.id === currentUser.id)
                              }
                            >
                              {userRoleOptions.map((roleOption) => (
                                <option key={roleOption} value={roleOption}>
                                  {roleOption}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={user.isAdmin}
                                onChange={(event) =>
                                  handleUpdateUserAdmin(
                                    user.id,
                                    event.target.checked,
                                  )
                                }
                                disabled={!currentUser.isAdmin}
                              />
                              Admin
                            </label>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                            {updatingUserId === user.id ? "Saving..." : ""}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Invites</div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Email</th>
                        <th className="px-4 py-2 text-left font-medium">
                          Full name
                        </th>
                        <th className="px-4 py-2 text-left font-medium">Role</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {isInvitesLoading ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            Loading invites...
                          </td>
                        </tr>
                      ) : invites.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-6 text-center text-muted-foreground"
                          >
                            No invites yet.
                          </td>
                        </tr>
                      ) : (
                        invites.map((invite) => (
                          <tr key={invite.id} className="border-t border-border">
                            <td className="px-4 py-2">{invite.email}</td>
                            <td className="px-4 py-2">
                              {invite.fullName ?? "--"}
                            </td>
                            <td className="px-4 py-2">{invite.role}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {invite.acceptedAt ? "Accepted" : "Pending"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResendInvite(invite.email)}
                                  disabled={
                                    invite.acceptedAt !== null ||
                                    !currentUser.isAdmin
                                  }
                                >
                                  Resend
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancelInvite(invite.id)}
                                  disabled={
                                    invite.acceptedAt !== null ||
                                    !currentUser.isAdmin
                                  }
                                >
                                  Cancel
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Rules</CardTitle>
              <CardDescription>
                Define what must be complete before moving orders forward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Min attachments for engineering
                  <input
                    type="number"
                    min={0}
                    value={rules.minAttachmentsForEngineering}
                    onChange={(event) =>
                      setRules({
                        minAttachmentsForEngineering:
                          Number(event.target.value) || 0,
                      })
                    }
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Min attachments for production
                  <input
                    type="number"
                    min={0}
                    value={rules.minAttachmentsForProduction}
                    onChange={(event) =>
                      setRules({
                        minAttachmentsForProduction:
                          Number(event.target.value) || 0,
                      })
                    }
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Due soon threshold (days)
                  <input
                    type="number"
                    min={0}
                    value={rules.dueSoonDays}
                    onChange={(event) =>
                      setRules({
                        dueSoonDays: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      })
                    }
                    className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                </label>
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={rules.dueIndicatorEnabled}
                    onChange={(event) =>
                      setRules({ dueIndicatorEnabled: event.target.checked })
                    }
                  />
                  Enable due date indicators
                </label>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {workflowStatusOptions.map((option) => {
                    const isChecked = rules.dueIndicatorStatuses.includes(
                      option.value,
                    );
                    return (
                      <label
                        key={option.value}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!rules.dueIndicatorEnabled}
                          onChange={(event) => {
                            setRules({
                              dueIndicatorStatuses: event.target.checked
                                ? [...rules.dueIndicatorStatuses, option.value]
                                : rules.dueIndicatorStatuses.filter(
                                    (status) => status !== option.value,
                                  ),
                            });
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium">Assignment labels</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    Engineer
                    <input
                      value={assignmentLabelDrafts.engineer}
                      onChange={(event) =>
                        setAssignmentLabelDrafts((prev) => ({
                          ...prev,
                          engineer: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    Manager
                    <input
                      value={assignmentLabelDrafts.manager}
                      onChange={(event) =>
                        setAssignmentLabelDrafts((prev) => ({
                          ...prev,
                          manager: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setAssignmentLabelDrafts({
                        engineer:
                          rules.assignmentLabels?.engineer ?? "Engineer",
                        manager: rules.assignmentLabels?.manager ?? "Manager",
                      })
                    }
                    disabled={!hasAssignmentLabelChanges}
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={handleSaveAssignmentLabels}
                    disabled={
                      !hasAssignmentLabelChanges ||
                      assignmentLabelState === "saving"
                    }
                  >
                    {assignmentLabelState === "saving"
                      ? "Saving..."
                      : "Save assignment labels"}
                  </Button>
                  {assignmentLabelState !== "idle" &&
                    assignmentLabelMessage && (
                      <span
                        className={`text-xs ${
                          assignmentLabelState === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {assignmentLabelMessage}
                      </span>
                    )}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium">Status labels</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {workflowStatusOptions.map((option) => (
                    <label
                      key={option.value}
                      className="space-y-2 text-sm font-medium"
                    >
                      {option.label}
                      <input
                        value={statusLabelDrafts[option.value] ?? option.label}
                        onChange={(event) =>
                          setStatusLabelDrafts({
                            ...statusLabelDrafts,
                            [option.value]: event.target.value,
                          })
                        }
                        className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStatusLabelDrafts(rules.statusLabels)}
                    disabled={!hasStatusLabelChanges}
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={handleSaveStatusLabels}
                    disabled={
                      !hasStatusLabelChanges || statusLabelState === "saving"
                    }
                  >
                    {statusLabelState === "saving"
                      ? "Saving..."
                      : "Save status labels"}
                  </Button>
                  {statusLabelState !== "idle" && statusLabelMessage && (
                    <span
                      className={`text-xs ${
                        statusLabelState === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {statusLabelMessage}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium">Attachment categories</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {attachmentCategoryDrafts.map((category) => (
                    <div key={category.id} className="flex items-center gap-2">
                      <input
                        value={category.label}
                        onChange={(event) =>
                          setAttachmentCategoryDrafts((prev) =>
                            prev.map((item) =>
                              item.id === category.id
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleRemoveAttachmentCategory(category.id)
                        }
                        disabled={attachmentCategoryDrafts.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={newAttachmentCategoryLabel}
                    onChange={(event) =>
                      setNewAttachmentCategoryLabel(event.target.value)
                    }
                    placeholder="Add category"
                    className="h-10 min-w-[200px] flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                  <Button onClick={handleAddAttachmentCategory}>
                    Add category
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Default category by role
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {attachmentRoles.map((role) => (
                      <label
                        key={role}
                        className="space-y-2 text-sm font-medium"
                      >
                        {role}
                        <select
                          value={
                            attachmentDefaultDrafts[role] ??
                            attachmentCategoryDrafts[0]?.id ??
                            ""
                          }
                          onChange={(event) =>
                            setAttachmentDefaultDrafts((prev) => ({
                              ...prev,
                              [role]: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                        >
                          {attachmentCategoryDrafts.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    New uploads will default to the selected category for each
                    role.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAttachmentCategoryDrafts(rules.attachmentCategories);
                      setAttachmentDefaultDrafts(
                        rules.attachmentCategoryDefaults,
                      );
                    }}
                    disabled={!hasAttachmentCategoryChanges}
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={handleSaveAttachmentCategories}
                    disabled={
                      !hasAttachmentCategoryChanges ||
                      attachmentCategoryState === "saving"
                    }
                  >
                    {attachmentCategoryState === "saving"
                      ? "Saving..."
                      : "Save attachment categories"}
                  </Button>
                  {attachmentCategoryState !== "idle" &&
                    attachmentCategoryMessage && (
                      <span
                        className={`text-xs ${
                          attachmentCategoryState === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {attachmentCategoryMessage}
                      </span>
                    )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rules.requireCommentForEngineering}
                    onChange={(event) =>
                      setRules({
                        requireCommentForEngineering: event.target.checked,
                      })
                    }
                  />
                  Require comment before engineering
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rules.requireCommentForProduction}
                    onChange={(event) =>
                      setRules({
                        requireCommentForProduction: event.target.checked,
                      })
                    }
                  />
                  Require comment before production
                </label>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Checklist items</div>
                <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
                  <div className="space-y-2">
                    <input
                      value={newChecklistLabel}
                      onChange={(event) =>
                        setNewChecklistLabel(event.target.value)
                      }
                      placeholder="Checklist item"
                      className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                    />
                    <Button
                      onClick={() => {
                        addChecklistItem(
                          newChecklistLabel,
                          newChecklistRequired,
                        );
                        setNewChecklistLabel("");
                      }}
                    >
                      Add item
                    </Button>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newChecklistRequired.includes(
                            "ready_for_engineering",
                          )}
                          onChange={(event) => {
                            setNewChecklistRequired((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) {
                                next.add("ready_for_engineering");
                              } else {
                                next.delete("ready_for_engineering");
                              }
                              return Array.from(next);
                            });
                          }}
                        />
                        Required for engineering
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newChecklistRequired.includes(
                            "ready_for_production",
                          )}
                          onChange={(event) => {
                            setNewChecklistRequired((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) {
                                next.add("ready_for_production");
                              } else {
                                next.delete("ready_for_production");
                              }
                              return Array.from(next);
                            });
                          }}
                        />
                        Required for production
                      </label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {rules.checklistItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.requiredFor.includes(
                              "ready_for_engineering",
                            )}
                            onChange={(event) => {
                              const next = new Set(item.requiredFor);
                              if (event.target.checked) {
                                next.add("ready_for_engineering");
                              } else {
                                next.delete("ready_for_engineering");
                              }
                              updateChecklistItem(item.id, {
                                requiredFor: Array.from(next),
                              });
                            }}
                          />
                          Eng.
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.requiredFor.includes(
                              "ready_for_production",
                            )}
                            onChange={(event) => {
                              const next = new Set(item.requiredFor);
                              if (event.target.checked) {
                                next.add("ready_for_production");
                              } else {
                                next.delete("ready_for_production");
                              }
                              updateChecklistItem(item.id, {
                                requiredFor: Array.from(next),
                              });
                            }}
                          />
                          Prod.
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={(event) =>
                              updateChecklistItem(item.id, {
                                isActive: event.target.checked,
                              })
                            }
                          />
                          Active
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeChecklistItem(item.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {rules.checklistItems.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No checklist items yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Return reasons</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={newReturnReason}
                    onChange={(event) => setNewReturnReason(event.target.value)}
                    placeholder="Add reason"
                    className="h-10 flex-1 rounded-lg border border-border bg-input-background px-3 text-sm"
                  />
                  <Button
                    onClick={() => {
                      addReturnReason(newReturnReason);
                      setNewReturnReason("");
                    }}
                  >
                    Add reason
                  </Button>
                </div>
                <div className="space-y-2">
                  {rules.returnReasons.map((reason) => (
                    <div
                      key={reason}
                      className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm"
                    >
                      <span>{reason}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeReturnReason(reason)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  {rules.returnReasons.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No return reasons yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">External job rules</div>
                <div className="space-y-2">
                  {rules.externalJobRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="font-medium capitalize">
                        {rule.status.replace("_", " ")}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Min attachments</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.minAttachments}
                          onChange={(event) =>
                            updateExternalJobRule(rule.id, {
                              minAttachments: Number(event.target.value) || 0,
                            })
                          }
                          className="h-9 w-20 rounded-md border border-border bg-input-background px-2 text-sm text-foreground"
                        />
                      </div>
                    </div>
                  ))}
                  {rules.externalJobRules.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No external job rules yet.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>
                Orders can sync from accounting tools to PWS - coming soon.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                >
                  <div className="font-medium">{integration.name}</div>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {integration.status}
                  </span>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Expected flow: accounting order to PWS to production stations.
              </div>
              <Button variant="outline" className="w-full">
                Request integration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

