"use server";

import { z } from "zod";

import { createTeacherRunAccessToken } from "@/lib/security/teacher-run-access-token";
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

const CreateTeacherAccessLinkSchema = z.object({
  runId: z.uuid(),
  expiresInHours: z.number().int().positive().max(168).default(24),
});

type CreateTeacherAccessLinkResult = ActionResult<{
  runId: string;
  teacherId: string;
  accessToken: string;
  accessUrl: string;
  expiresInHours: number;
}>;

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

export async function createTeacherAccessLinkAction(input: {
  runId: string;
  expiresInHours?: number;
}): Promise<CreateTeacherAccessLinkResult> {
  const parsed = CreateTeacherAccessLinkSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Eingaben fuer Lehrerzugangs-Link.",
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
      error: { code: "UNAUTHENTICATED", message: "Bitte zuerst anmelden." },
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Profil konnte nicht geladen werden." },
    };
  }

  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, school_id, created_by")
    .eq("id", parsed.data.runId)
    .maybeSingle();

  if (runError || !run) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Lauf nicht gefunden." },
    };
  }

  const hasAccess =
    (profile.role === "admin" && run.school_id === profile.school_id) ||
    (profile.role === "teacher" && run.created_by === user.id);

  if (!hasAccess) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Keine Berechtigung fuer diesen Lauf." },
    };
  }

  const expiresInSeconds = parsed.data.expiresInHours * 60 * 60;
  const accessToken = createTeacherRunAccessToken({
    runId: run.id,
    teacherId: run.created_by,
    expiresInSeconds,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const accessUrl = `${appUrl}/dashboard/runs/${run.id}/students?access=${encodeURIComponent(accessToken)}`;

  return {
    ok: true,
    data: {
      runId: run.id,
      teacherId: run.created_by,
      accessToken,
      accessUrl,
      expiresInHours: parsed.data.expiresInHours,
    },
  };
}
