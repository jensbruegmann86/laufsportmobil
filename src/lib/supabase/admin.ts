import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

let supabaseAdminClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdminClient;
}
