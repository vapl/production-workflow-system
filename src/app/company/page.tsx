"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase, supabaseTenantLogoBucket } from "@/lib/supabaseClient";
import { uploadTenantLogo } from "@/lib/uploadTenantLogo";

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
  const [companyName, setCompanyName] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyRegistrationNo, setCompanyRegistrationNo] = useState("");
  const [companyVatNo, setCompanyVatNo] = useState("");
  const [companyBillingEmail, setCompanyBillingEmail] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(null);
  const [companyLogoState, setCompanyLogoState] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [companyLogoMessage, setCompanyLogoMessage] = useState("");
  const [companyState, setCompanyState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [companyMessage, setCompanyMessage] = useState("");

  const maxLogoBytes = 2 * 1024 * 1024;

  useEffect(() => {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("name, legal_name, registration_no, vat_no, billing_email, address, logo_url")
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
    const result = await uploadTenantLogo(companyLogoFile, currentUser.tenantId);
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
    const storagePath = getStoragePathFromUrl(companyLogoUrl, supabaseTenantLogoBucket);
    if (storagePath) {
      await supabase.storage.from(supabaseTenantLogoBucket).remove([storagePath]);
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

  return (
    <section className="space-y-6">
      <div className="flex items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
          <CardDescription>
            Admins can manage company data, billing, and legal details.
          </CardDescription>
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
                onChange={(event) => setCompanyRegistrationNo(event.target.value)}
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
            <label className="space-y-2 text-sm font-medium">
              Logo URL
              <input
                value={companyLogoUrl}
                onChange={(event) => setCompanyLogoUrl(event.target.value)}
                placeholder="https://"
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                disabled={!currentUser.isAdmin}
              />
            </label>
            <div className="space-y-3 text-sm font-medium">
              Upload logo
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-background">
                    {companyLogoPreview || companyLogoUrl ? (
                      <img
                        src={companyLogoPreview ?? companyLogoUrl}
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
                          setCompanyLogoMessage("Logo file is too large. Max 2MB.");
                          return;
                        }
                        setCompanyLogoFile(file ?? null);
                        setCompanyLogoPreview(file ? URL.createObjectURL(file) : null);
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
                    {companyLogoState === "uploading" ? "Uploading..." : "Upload logo"}
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
                    companyLogoState === "error" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {companyLogoMessage}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSaveCompany} disabled={!currentUser.isAdmin || companyState === "saving"}>
              {companyState === "saving" ? "Saving..." : "Save company"}
            </Button>
            {companyMessage && (
              <span
                className={`text-xs ${
                  companyState === "error" ? "text-destructive" : "text-muted-foreground"
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
            Billing is coming soon. Subscription management will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            No billing configured yet.
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
