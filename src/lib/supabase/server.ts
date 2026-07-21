import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/database.types";

async function createServerSupabaseClient(
  allowCookieWrite: boolean,
): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!allowCookieWrite) {
          return;
        }

        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie writes can fail in server components; middleware handles refresh.
        }
      },
    },
  });
}

export async function createServerComponentSupabaseClient(): Promise<SupabaseClient<Database>> {
  return createServerSupabaseClient(false);
}

export async function createServerActionSupabaseClient(): Promise<SupabaseClient<Database>> {
  return createServerSupabaseClient(true);
}

export const createClient = createServerComponentSupabaseClient;
