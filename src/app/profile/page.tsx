"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import {
  supabase,
  supabaseAvatarBucket,
} from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { uploadAvatar } from "@/lib/uploadAvatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, XIcon } from "lucide-react";

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
      setMessage("Supabase is not configured.");
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
    setMessage("Profile updated.");
    setInitialProfile({
      fullName: fullName.trim(),
      avatarUrl: avatarUrl.trim(),
      phone: phone.trim(),
    });
  }

  async function handleAvatarUpload() {
    if (!supabase || !avatarFile || !user.id) {
      setAvatarState("error");
      setAvatarMessage("Supabase is not configured.");
      return;
    }
    setAvatarState("uploading");
    setAvatarMessage("");
    const result = await uploadAvatar(avatarFile, user.id);
    if (result.error || !result.url) {
      setAvatarState("error");
      setAvatarMessage(result.error ?? "Upload failed.");
      return;
    }
    const storagePath = getStoragePathFromUrl(
      result.url,
      supabaseAvatarBucket,
    );
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
    setAvatarMessage("Avatar uploaded.");
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
    const storagePath = getStoragePathFromUrl(
      avatarUrl,
      supabaseAvatarBucket,
    );
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
    setAvatarMessage("Avatar removed.");
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
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="group relative h-14 w-14 rounded-full"
              onClick={() => setAvatarModalOpen(true)}
              aria-label="Edit avatar"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName || "User avatar"}
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
              <div className="text-sm font-medium">{fullName || "User"}</div>
              <div className="text-xs text-muted-foreground">
                {user.email ?? "--"}
              </div>
              <div className="text-xs text-muted-foreground">
                Role: {user.role}
                {user.isOwner ? " / Owner" : user.isAdmin ? " / Admin" : ""}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InputField
              label="Full name"
              icon="user"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="h-11 text-sm"
            />
            <InputField
              label="Email"
              icon="email"
              value={user.email ?? ""}
              readOnly
              className="h-11 text-sm text-muted-foreground"
              wrapperClassName="h-11 bg-muted"
            />
            <InputField
              label="Phone"
              icon="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="h-11 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={status === "saving" || !isDirty}
            >
              {status === "saving" ? "Saving..." : "Save profile"}
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
              <CardTitle>Company & Billing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Manage company legal details and subscription settings.
              </div>
              <Link
                href="/company"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Open company settings
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
              <div className="text-sm font-semibold">Edit avatar</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAvatarModalOpen(false)}
                aria-label="Close"
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
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      Avatar
                    </div>
                  )}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    {avatarFile
                      ? avatarFile.name
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
                    className="sr-only"
                  />
                </label>
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
