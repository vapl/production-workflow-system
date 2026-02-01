"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { uploadAvatar } from "@/lib/uploadAvatar";
import Link from "next/link";

export default function ProfilePage() {
  const user = useCurrentUser();
  const [fullName, setFullName] = useState(user.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
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
    setAvatarState("idle");
    setAvatarMessage("");
  }, [user.name, user.avatarUrl]);

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
    setAvatarState("uploaded");
    setAvatarMessage("Avatar uploaded.");
    setAvatarUrl(result.url);
    await supabase
      .from("profiles")
      .update({ avatar_url: result.url })
      .eq("id", user.id);
  }

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
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setAvatarFile(file ?? null);
                setAvatarState("idle");
                setAvatarMessage("");
              }}
              className="text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleAvatarUpload}
                disabled={!avatarFile || avatarState === "uploading"}
              >
                {avatarState === "uploading" ? "Uploading..." : "Upload avatar"}
              </Button>
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
            {avatarUrl && (
              <div className="text-xs text-muted-foreground">
                Current avatar URL: {avatarUrl}
              </div>
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
      {user.role === "Admin" && (
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
