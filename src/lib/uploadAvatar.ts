import { supabase, supabaseAvatarBucket } from "@/lib/supabaseClient";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadAvatar(
  file: File,
  userId: string,
): Promise<{ url?: string; error?: string }> {
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const safeName = sanitizeFileName(file.name);
  const path = `${userId}/${Date.now()}-${safeName}`;

  try {
    const { error } = await supabase.storage
      .from(supabaseAvatarBucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (error) {
      return { error: error.message };
    }

    const { data } = supabase.storage
      .from(supabaseAvatarBucket)
      .getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Upload failed unexpectedly.",
    };
  }
}
