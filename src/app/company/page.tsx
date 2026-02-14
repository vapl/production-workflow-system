"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase, supabaseTenantLogoBucket } from "@/lib/supabaseClient";
import { uploadTenantLogo } from "@/lib/uploadTenantLogo";
import {
  defaultTenantSubscription,
  hasTenantCapability,
  type TenantPlanCode,
} from "@/lib/subscription";

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

export default function CompanyPage() {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const [copyMessage, setCopyMessage] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyRegistrationNo, setCompanyRegistrationNo] = useState("");
  const [companyVatNo, setCompanyVatNo] = useState("");
  const [companyBillingEmail, setCompanyBillingEmail] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyLogoDisplayUrl, setCompanyLogoDisplayUrl] = useState("");
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
  const [subscriptionPlan, setSubscriptionPlan] = useState<TenantPlanCode>(
    defaultTenantSubscription.planCode,
  );
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [subscriptionMessage, setSubscriptionMessage] = useState("");

  const maxLogoBytes = 2 * 1024 * 1024;

  useEffect(() => {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const sb = supabase;
    const fetchCompany = async () => {
      const { data, error } = await sb
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
      const rawLogoUrl = data.logo_url ?? "";
      setCompanyLogoUrl(rawLogoUrl);
      if (rawLogoUrl) {
        const storagePath = getStoragePathFromUrl(
          rawLogoUrl,
          supabaseTenantLogoBucket,
        );
        if (storagePath) {
          const { data: signed } = await sb.storage
            .from(supabaseTenantLogoBucket)
            .createSignedUrl(storagePath, 60 * 60);
          setCompanyLogoDisplayUrl(signed?.signedUrl ?? rawLogoUrl);
        } else {
          setCompanyLogoDisplayUrl(rawLogoUrl);
        }
      } else {
        setCompanyLogoDisplayUrl("");
      }
    };
    fetchCompany();
  }, [currentUser.tenantId]);

  useEffect(() => {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const sb = supabase;
    const fetchSubscription = async () => {
      const { data, error } = await sb
        .from("tenant_subscriptions")
        .select("plan_code")
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (error) {
        setSubscriptionMessage(error.message);
        setSubscriptionStatus("error");
        return;
      }
      setSubscriptionPlan((data?.plan_code ?? "basic") as TenantPlanCode);
      setSubscriptionStatus("idle");
      setSubscriptionMessage("");
    };
    void fetchSubscription();
  }, [currentUser.tenantId]);

  useEffect(() => {
    return () => {
      if (companyLogoPreview) {
        URL.revokeObjectURL(companyLogoPreview);
      }
    };
  }, [companyLogoPreview]);

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
    if (supabase) {
      const storagePath = getStoragePathFromUrl(
        result.url,
        supabaseTenantLogoBucket,
      );
      if (storagePath) {
        const { data } = await supabase.storage
          .from(supabaseTenantLogoBucket)
          .createSignedUrl(storagePath, 60 * 60);
        setCompanyLogoDisplayUrl(data?.signedUrl ?? result.url);
      } else {
        setCompanyLogoDisplayUrl(result.url);
      }
    }
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
    setCompanyLogoDisplayUrl("");
    setCompanyLogoFile(null);
    if (companyLogoPreview) {
      URL.revokeObjectURL(companyLogoPreview);
      setCompanyLogoPreview(null);
    }
    setCompanyLogoState("uploaded");
    setCompanyLogoMessage("Logo removed.");
  }

  async function handleSaveSubscription() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setSubscriptionStatus("saving");
    setSubscriptionMessage("");
    const { error } = await supabase.from("tenant_subscriptions").upsert(
      {
        tenant_id: currentUser.tenantId,
        plan_code: subscriptionPlan,
        status: "active",
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      setSubscriptionStatus("error");
      setSubscriptionMessage(error.message);
      return;
    }
    setSubscriptionStatus("saved");
    setSubscriptionMessage("Subscription updated.");
  }

  const companyId = currentUser.tenantId ?? "";
  const sendToPartnerEnabled = hasTenantCapability(
    { planCode: subscriptionPlan, status: "active" },
    "externalJobs.sendToPartner",
  );

  const handleCopyCompanyId = async () => {
    if (!companyId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(companyId);
      setCopyMessage("Copied");
      window.setTimeout(() => setCopyMessage(""), 1500);
    } catch {
      setCopyMessage("Copy failed");
      window.setTimeout(() => setCopyMessage(""), 1500);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }
            router.replace("/orders");
          }}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
          <CardDescription>
            Admins can manage company data, billing, and legal details.
          </CardDescription>
          {companyId ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1">
                Company ID: {companyId}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyCompanyId}
              >
                Copy
              </Button>
              {copyMessage ? <span>{copyMessage}</span> : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Company name
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Legal name
              <input
                value={companyLegalName}
                onChange={(event) => setCompanyLegalName(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Registration no.
              <input
                value={companyRegistrationNo}
                onChange={(event) =>
                  setCompanyRegistrationNo(event.target.value)
                }
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              VAT no.
              <input
                value={companyVatNo}
                onChange={(event) => setCompanyVatNo(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Billing email
              <input
                type="email"
                value={companyBillingEmail}
                onChange={(event) => setCompanyBillingEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Address
              <input
                value={companyAddress}
                onChange={(event) => setCompanyAddress(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <div className="space-y-3 text-sm font-medium">
              Upload logo
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-background">
                    {companyLogoPreview || companyLogoDisplayUrl ? (
                      <img
                        src={companyLogoPreview ?? companyLogoDisplayUrl}
                        alt="Logo preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        Logo
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      {companyLogoFile
                        ? companyLogoFile.name
                        : "Choose an image file to upload."}
                    </div>
                    <div>PNG or JPG up to 2MB.</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-sm">
                    Select file
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (companyLogoPreview) {
                          URL.revokeObjectURL(companyLogoPreview);
                        }
                        if (file && file.size > maxLogoBytes) {
                          setCompanyLogoFile(null);
                          setCompanyLogoPreview(null);
                          setCompanyLogoState("error");
                          setCompanyLogoMessage(
                            "Logo file is too large. Max 2MB.",
                          );
                          return;
                        }
                        setCompanyLogoFile(file ?? null);
                        setCompanyLogoPreview(
                          file ? URL.createObjectURL(file) : null,
                        );
                        setCompanyLogoState("idle");
                        setCompanyLogoMessage("");
                      }}
                      disabled={!currentUser.isAdmin}
                      className="sr-only"
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={handleUploadCompanyLogo}
                    disabled={
                      !currentUser.isAdmin ||
                      !companyLogoFile ||
                      companyLogoState === "uploading"
                    }
                  >
                    {companyLogoState === "uploading"
                      ? "Uploading..."
                      : "Upload logo"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleDeleteCompanyLogo}
                    disabled={
                      !currentUser.isAdmin ||
                      !companyLogoUrl ||
                      companyLogoState === "uploading"
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {companyLogoMessage && (
                <span
                  className={`text-xs ${
                    companyLogoState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {companyLogoMessage}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSaveCompany}
              disabled={!currentUser.isAdmin || companyState === "saving"}
            >
              {companyState === "saving" ? "Saving..." : "Save company"}
            </Button>
            {companyMessage && (
              <span
                className={`text-xs ${
                  companyState === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {companyMessage}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            Plan switch for feature gating. Billing integration can be added
            later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Plan</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  subscriptionPlan === "basic"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                }`}
                onClick={() => setSubscriptionPlan("basic")}
                disabled={
                  !currentUser.isAdmin || subscriptionStatus === "saving"
                }
              >
                <div className="font-medium">Basic</div>
                <div className="text-xs text-muted-foreground">
                  Manual external jobs only
                </div>
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  subscriptionPlan === "pro"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                }`}
                onClick={() => setSubscriptionPlan("pro")}
                disabled={
                  !currentUser.isAdmin || subscriptionStatus === "saving"
                }
              >
                <div className="font-medium">Pro</div>
                <div className="text-xs text-muted-foreground">
                  Includes Send to partner
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            <div>
              externalJobs.manualEntry:{" "}
              <span className="font-medium">enabled</span>
            </div>
            <div>
              externalJobs.sendToPartner:{" "}
              <span className="font-medium">
                {sendToPartnerEnabled ? "enabled" : "disabled"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSaveSubscription}
              disabled={!currentUser.isAdmin || subscriptionStatus === "saving"}
            >
              {subscriptionStatus === "saving"
                ? "Saving..."
                : "Save subscription"}
            </Button>
            {subscriptionMessage ? (
              <span
                className={`text-xs ${
                  subscriptionStatus === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {subscriptionMessage}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
