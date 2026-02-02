"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  supabase,
  supabaseAvatarBucket,
} from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { uploadAvatar } from "@/lib/uploadAvatar";
import Link from "next/link";

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
  const [fullName, setFullName] = useState(user.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    setFullName(user.name ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
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
      })
      .eq("id", user.id);
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("saved");
    setMessage("Profile updated.");
  }

  async function handleAvatarUpload() {
    if (!avatarFile || !user.id) {
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

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
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
            <div>
              <div className="text-sm font-medium">{fullName || "User"}</div>
              <div className="text-xs text-muted-foreground">
                {user.email ?? "--"}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Full name
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Email
              <input
                value={user.email ?? ""}
                readOnly
                className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="text-sm font-medium">Avatar image</div>
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-background">
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

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={status === "saving"}>
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
              href="/settings?tab=company"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Open company settings
            </Link>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
