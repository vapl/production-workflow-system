import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          fetch: async (input, init) => {
            try {
              return await fetch(input, init);
            } catch (err) {
              if (err instanceof Error && err.name === "AbortError") {
                return new Response(null, {
                  status: 499,
                  statusText: "Client Closed Request",
                });
              }
              throw err;
            }
          },
        },
      })
    : null;

export const supabaseBucket =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "order-attachments";

export const supabaseAvatarBucket =
  process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET || "user-avatars";

export const supabaseTenantLogoBucket =
  process.env.NEXT_PUBLIC_SUPABASE_TENANT_BUCKET || "tenant-logos";
