import { supabase, supabaseTenantLogoBucket } from "@/lib/supabaseClient";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadTenantLogo(
  file: File,
  tenantId: string,
): Promise<{ url?: string; error?: string }> {
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const safeName = sanitizeFileName(file.name);
  const path = `${tenantId}/${Date.now()}-${safeName}`;

  try {
    const { error } = await supabase.storage
      .from(supabaseTenantLogoBucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (error) {
      return { error: error.message };
    }

    const { data } = supabase.storage
      .from(supabaseTenantLogoBucket)
      .getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Upload failed unexpectedly.",
    };
  }
}
