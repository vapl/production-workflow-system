import { supabase, supabaseBucket } from "@/lib/supabaseClient";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadOrderAttachment(
  file: File,
  orderId: string,
): Promise<{
  attachment?: { name: string; url: string; size?: number; mimeType?: string };
  error?: string;
}> {
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const safeName = sanitizeFileName(file.name);
  const path = `${orderId}/${Date.now()}-${safeName}`;

  try {
    const uploadPromise = supabase.storage
      .from(supabaseBucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    const timeoutPromise = new Promise<{ error: { message: string } }>(
      (resolve) =>
        setTimeout(
          () => resolve({ error: { message: "Upload timed out." } }),
          15000,
        ),
    );
    const { error } = await Promise.race([uploadPromise, timeoutPromise]);

    if (error) {
      return { error: error.message };
    }

    const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(path);
    return {
      attachment: {
        name: file.name,
        url: data.publicUrl,
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
