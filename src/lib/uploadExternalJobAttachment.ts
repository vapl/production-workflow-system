import { supabase, supabaseBucket } from "@/lib/supabaseClient";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadExternalJobAttachment(
  file: File,
  externalJobId: string,
): Promise<{
  attachment?: { name: string; url: string; size?: number; mimeType?: string };
  error?: string;
}> {
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const safeName = sanitizeFileName(file.name);
  const path = `external-jobs/${externalJobId}/${Date.now()}-${safeName}`;

  try {
    const { error } = await supabase.storage
      .from(supabaseBucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (error) {
      return { error: error.message };
    }

    return {
      attachment: {
        name: file.name,
        url: path,
        size: file.size,
        mimeType: file.type,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Upload failed unexpectedly.",
    };
  }
}
