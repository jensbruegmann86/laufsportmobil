"use server";

import { z } from "zod";

import type { PublicEnum, TableRow } from "@/lib/supabase/database.types";
import { createServerActionSupabaseClient } from "@/lib/supabase/server";

type RunRow = TableRow<"runs">;

type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        details?: Record<string, string[]>;
      };
    };

const RunStatusSchema = z.enum(["draft", "active", "completed"]);

const CreateRunSchema = z.object({
  title: z.string().trim().min(3).max(120),
  date: z.iso.date(),
  status: RunStatusSchema.default("draft"),
  schoolId: z.uuid().optional(),
});

type CreateRunInput = z.input<typeof CreateRunSchema>;

type CreateRunResult = ActionResult<Pick<RunRow, "id" | "school_id" | "title" | "date" | "status" | "created_by">>;

export async function createRunAction(input: CreateRunInput): Promise<CreateRunResult> {
  const parsed = CreateRunSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Run input is invalid.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const supabase = await createServerActionSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "You must be signed in as admin." },
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unable to load your profile." },
    };
  }

  if (!profile) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Profile not found." },
    };
  }

  if (profile.role !== "admin") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Only admins can create runs." },
    };
  }

  const schoolId = parsed.data.schoolId ?? profile.school_id;

  if (schoolId !== profile.school_id) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Admin can only create runs in their own school.",
      },
    };
  }

  const payload = {
    school_id: schoolId,
    title: parsed.data.title,
    date: parsed.data.date,
    status: parsed.data.status as PublicEnum<"run_status">,
    created_by: user.id,
  };

  const { data: run, error: insertError } = await supabase
    .from("runs")
    .insert(payload)
    .select("id, school_id, title, date, status, created_by")
    .single();

  if (insertError) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to create run." },
    };
  }

  return { ok: true, data: run };
}
