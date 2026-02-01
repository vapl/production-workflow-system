import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const supabaseBucket =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "order-attachments";

export const supabaseAvatarBucket =
  process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET || "user-avatars";
