"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/ui/FileField";
import { InputField } from "@/components/ui/InputField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { supabase, supabaseAvatarBucket } from "@/lib/supabaseClient";
import { useAuthActions, useCurrentUser } from "@/contexts/UserContext";
import { uploadAvatar } from "@/lib/uploadAvatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, XIcon } from "lucide-react";
import {
  appLocales,
  defaultAppLocale,
  normalizeAppLocale,
} from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/useI18n";

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

export default function ProfilePage() {
  const user = useCurrentUser();
  const { setLocale } = useAuthActions();
  const { t } = useI18n();
  const router = useRouter();
  const [fullName, setFullName] = useState(user.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [initialProfile, setInitialProfile] = useState({
    fullName: user.name ?? "",
    avatarUrl: user.avatarUrl ?? "",
    phone: user.phone ?? "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [languageState, setLanguageState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [languageMessage, setLanguageMessage] = useState("");

  useEffect(() => {
    setFullName(user.name ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
    setPhone(user.phone ?? "");
    setInitialProfile({
      fullName: user.name ?? "",
      avatarUrl: user.avatarUrl ?? "",
      phone: user.phone ?? "",
    });
    setAvatarFile(null);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarPreview(null);
    setAvatarState("idle");
    setAvatarMessage("");
    // Only reset when user changes, not when preview changes.
  }, [user.name, user.avatarUrl]);

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  async function handleSave() {
    if (!supabase || !user.id) {
      setStatus("error");
      setMessage(t("profile.supabaseNotConfigured"));
      return;
    }
    setStatus("saving");
    setMessage("");
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        avatar_url: avatarUrl.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", user.id);
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("saved");
    setMessage(t("profile.profileUpdated"));
    setInitialProfile({
      fullName: fullName.trim(),
      avatarUrl: avatarUrl.trim(),
      phone: phone.trim(),
    });
  }

  async function handleAvatarUpload() {
    if (!supabase || !avatarFile || !user.id) {
      setAvatarState("error");
      setAvatarMessage(t("profile.supabaseNotConfigured"));
      return;
    }
    setAvatarState("uploading");
    setAvatarMessage("");
    const result = await uploadAvatar(avatarFile, user.id);
    if (result.error || !result.url) {
      setAvatarState("error");
      setAvatarMessage(result.error ?? t("profile.uploadFailed"));
      return;
    }
    const storagePath = getStoragePathFromUrl(result.url, supabaseAvatarBucket);
    let displayUrl = result.url;
    if (storagePath && supabase) {
      const { data } = await supabase.storage
        .from(supabaseAvatarBucket)
        .createSignedUrl(storagePath, 60 * 60);
      if (data?.signedUrl) {
        displayUrl = data.signedUrl;
      }
    }
    setAvatarState("uploaded");
    setAvatarMessage(t("profile.avatarUploaded"));
    setAvatarUrl(displayUrl);
    await supabase
      .from("profiles")
      .update({ avatar_url: result.url })
      .eq("id", user.id);
  }

  async function handleDeleteAvatar() {
    if (!supabase || !user.id || !avatarUrl) {
      return;
    }
    setAvatarState("uploading");
    setAvatarMessage("");
    const { supabaseAvatarBucket } = await import("@/lib/supabaseClient");
    const storagePath = getStoragePathFromUrl(avatarUrl, supabaseAvatarBucket);
    if (storagePath) {
      await supabase.storage.from(supabaseAvatarBucket).remove([storagePath]);
    }
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
    if (error) {
      setAvatarState("error");
      setAvatarMessage(error.message);
      return;
    }
    setAvatarUrl("");
    setAvatarFile(null);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarPreview(null);
    setAvatarState("uploaded");
    setAvatarMessage(t("profile.avatarRemoved"));
  }

  async function handleUserLocaleChange(nextValue: string) {
    const locale = normalizeAppLocale(nextValue);
    if (locale === normalizeAppLocale(user.locale)) {
      setLanguageState("idle");
      setLanguageMessage("");
      return;
    }
    setLanguageState("saving");
    setLanguageMessage("");
    const result = await setLocale(locale);
    if (!result.ok) {
      setLanguageState("error");
      setLanguageMessage(result.error ?? t("profile.languageSaveError"));
      return;
    }
    setLanguageState("saved");
    setLanguageMessage(t("profile.languageSaved"));
  }

  const maxAvatarBytes = 2 * 1024 * 1024;

  const initials = fullName
    ? fullName
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  const isDirty =
    fullName.trim() !== initialProfile.fullName.trim() ||
    avatarUrl.trim() !== initialProfile.avatarUrl.trim() ||
    phone.trim() !== initialProfile.phone.trim();

  return (
    <section className="space-y-6 pt-28 md:pt-0">
      <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+0.4rem)] z-40 md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto h-12 w-12 rounded-xl border border-border/80 bg-card/95 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80"
          aria-label={t("profile.back")}
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }
            router.replace("/orders");
          }}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Button>
      </div>
      <div className="hidden items-center md:flex">
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
          {t("profile.back")}
        </button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="group relative h-14 w-14 rounded-full"
              onClick={() => setAvatarModalOpen(true)}
              aria-label={t("profile.editAvatar")}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName || t("profile.userFallback")}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-base font-semibold text-foreground">
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition group-hover:bg-muted">
                <PencilIcon className="h-3.5 w-3.5" />
              </span>
            </button>
            <div>
              <div className="text-sm font-medium">
                {fullName || t("profile.userFallback")}
              </div>
              <div className="text-xs text-muted-foreground">
                {user.email ?? "--"}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("profile.role")}: {user.role}
                {user.isOwner
                  ? ` / ${t("profile.owner")}`
                  : user.isAdmin
                    ? ` / ${t("profile.admin")}`
                    : ""}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InputField
              label={t("profile.fullName")}
              icon="user"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="h-11 text-sm"
            />
            <InputField
              label={t("profile.email")}
              icon="email"
              value={user.email ?? ""}
              readOnly
              className="h-11 text-sm text-muted-foreground"
              wrapperClassName="h-11 bg-muted"
            />
            <InputField
              label={t("profile.phone")}
              icon="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="h-11 text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t("profile.language")}</div>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={normalizeAppLocale(user.locale)}
                onValueChange={handleUserLocaleChange}
              >
                <SelectTrigger className="h-11 w-full min-w-30 sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {appLocales.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {t(`common.localeName.${locale}`)}
                      {locale === defaultAppLocale ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {languageState === "saving" ? (
                <span className="text-xs text-muted-foreground">
                  {t("profile.saving")}
                </span>
              ) : null}
              {languageMessage ? (
                <span
                  className={`text-xs ${
                    languageState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {languageMessage}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={status === "saving" || !isDirty}
            >
              {status === "saving"
                ? t("profile.saving")
                : t("profile.saveProfile")}
            </Button>
            {message && (
              <span
                className={`text-xs ${
                  status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {message}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      {user.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.companyBillingTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {t("profile.companyBillingDescription")}
            </div>
            <Link
              href="/company"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("profile.openCompanySettings")}
            </Link>
          </CardContent>
        </Card>
      )}
      {avatarModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setAvatarModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {t("profile.editAvatar")}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAvatarModalOpen(false)}
                aria-label={t("profile.close")}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 overflow-hidden rounded-full border border-border bg-background">
                  {avatarPreview || avatarUrl ? (
                    <img
                      src={avatarPreview ?? avatarUrl}
                      alt={t("profile.avatarPreview")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      {t("profile.avatarPlaceholder")}
                    </div>
                  )}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    {avatarFile ? avatarFile.name : t("profile.chooseImage")}
                  </div>
                  <div>{t("profile.imageHint")}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FileField
                  label={t("profile.selectFile")}
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (avatarPreview) {
                      URL.revokeObjectURL(avatarPreview);
                    }
                    if (file && file.size > maxAvatarBytes) {
                      setAvatarFile(null);
                      setAvatarPreview(null);
                      setAvatarState("error");
                      setAvatarMessage("Avatar file is too large. Max 2MB.");
                      return;
                    }
                    setAvatarFile(file ?? null);
                    setAvatarPreview(file ? URL.createObjectURL(file) : null);
                    setAvatarState("idle");
                    setAvatarMessage("");
                  }}
                  wrapperClassName="w-auto"
                  labelClassName="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-sm"
                  className="sr-only"
                />
                <Button
                  variant="outline"
                  onClick={handleAvatarUpload}
                  disabled={!avatarFile || avatarState === "uploading"}
                >
                  {avatarState === "uploading"
                    ? "Uploading..."
                    : "Upload avatar"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleDeleteAvatar}
                  disabled={!avatarUrl || avatarState === "uploading"}
                >
                  Delete
                </Button>
              </div>
              {avatarMessage && (
                <span
                  className={`text-xs ${
                    avatarState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {avatarMessage}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
