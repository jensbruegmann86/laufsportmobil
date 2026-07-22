import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type AdminSupabase = SupabaseClient<Database>;

export type AppProfile = {
  id?: string;
  role: "admin" | "teacher";
  school_id: string;
};

export type AccessibleRun = {
  id: string;
  title: string;
  date: string;
  lap_distance_km: number | null;
  status: "draft" | "active" | "completed";
  school_id: string;
  created_by: string;
  teacher_id: string | null;
};

export async function getAccessibleRunsForProfile(input: {
  supabase: AdminSupabase;
  profile: AppProfile;
  userId: string;
}) {
  const { supabase, profile, userId } = input;

  if (profile.role === "admin") {
    const { data, error } = await supabase
      .from("runs")
      .select("id, title, date, lap_distance_km, status, school_id, created_by, teacher_id")
      .eq("school_id", profile.school_id)
      .order("date", { ascending: false });

    return { data: (data ?? []) as AccessibleRun[], error };
  }

  const { data, error } = await supabase
    .from("runs")
    .select("id, title, date, lap_distance_km, status, school_id, created_by, teacher_id")
    .eq("teacher_id", userId)
    .order("date", { ascending: false });

  return { data: (data ?? []) as AccessibleRun[], error };
}

export function hasRunAccess(input: {
  profile: AppProfile;
  run: Pick<AccessibleRun, "school_id" | "teacher_id">;
  userId: string;
}) {
  const { profile, run, userId } = input;

  return (
    (profile.role === "admin" && run.school_id === profile.school_id) ||
    (profile.role === "teacher" && run.teacher_id === userId)
  );
}
