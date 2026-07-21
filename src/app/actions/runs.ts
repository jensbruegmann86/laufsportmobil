"use server";

import { z } from "zod";

import { sendTeacherInvitationEmail } from "@/lib/email/smtp";
import { createTeacherRunAccessToken } from "@/lib/security/teacher-run-access-token";
import { hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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
  teacherEmail: z.email(),
  status: RunStatusSchema.default("draft"),
  schoolId: z.uuid().optional(),
});

type CreateRunInput = z.input<typeof CreateRunSchema>;

type CreateRunResult = ActionResult<Pick<RunRow, "id" | "school_id" | "title" | "date" | "status" | "created_by">>;

const UpdateRunSettingsSchema = z.object({
  runId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  date: z.iso.date(),
  teacherEmail: z.email(),
});

type UpdateRunSettingsResult = ActionResult<Pick<RunRow, "id" | "title" | "date" | "teacher_id">>;

const CreateTeacherAccessLinkSchema = z.object({
  runId: z.uuid(),
  expiresInHours: z.number().int().positive().max(168 * 4).optional(),
});

type CreateTeacherAccessLinkResult = ActionResult<{
  runId: string;
  accessToken: string;
  accessUrl: string;
  expiresInHours: number;
}>;

async function createOrRefreshTeacherInvite(input: {
  runId: string;
  schoolId: string;
  invitedBy: string;
  teacherEmail: string;
  eventTitle: string;
}) {
  const { runId, schoolId, invitedBy, teacherEmail, eventTitle } = input;
  const adminSupabase = getSupabaseAdminClient();

  const { error: resetRunTeacherError } = await adminSupabase
    .from("runs")
    .update({ teacher_id: null })
    .eq("id", runId);

  if (resetRunTeacherError) {
    throw new Error("Lehrerzuordnung konnte nicht vorbereitet werden.");
  }

  const { error: inviteError } = await adminSupabase
    .from("teacher_invites")
    .upsert(
      {
        run_id: runId,
        school_id: schoolId,
        invited_by: invitedBy,
        email: teacherEmail,
        teacher_user_id: null,
        accepted_at: null,
      },
      { onConflict: "run_id" },
    );

  if (inviteError) {
    throw new Error("Lehrer-Einladung konnte nicht gespeichert werden.");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const registerUrl = `${appUrl}/auth/register?email=${encodeURIComponent(teacherEmail)}&invited=1`;

  await sendTeacherInvitationEmail({
    teacherEmail,
    eventTitle,
    registerUrl,
  });
}

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
  const adminSupabase = getSupabaseAdminClient();
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

  const { data: profile, error: profileError } = await adminSupabase
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
    teacher_id: null,
  };

  const { data: run, error: insertError } = await adminSupabase
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

  try {
    await createOrRefreshTeacherInvite({
      runId: run.id,
      schoolId,
      invitedBy: user.id,
      teacherEmail: parsed.data.teacherEmail,
      eventTitle: parsed.data.title,
    });
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Event wurde erstellt, aber die Lehrer-Einladung konnte nicht versendet werden." },
    };
  }

  return { ok: true, data: run };
}

export async function updateRunSettingsAction(input: {
  runId: string;
  title: string;
  date: string;
  teacherEmail: string;
}): Promise<UpdateRunSettingsResult> {
  const parsed = UpdateRunSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Event-Einstellungen.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const supabase = await createServerActionSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();
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

  const { data: profile, error: profileError } = await adminSupabase
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

  if (profile.role !== "admin") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Nur Admins duerfen Event-Einstellungen aendern." },
    };
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, school_id")
    .eq("id", parsed.data.runId)
    .maybeSingle();

  if (runError || !run || run.school_id !== profile.school_id) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Event nicht gefunden." },
    };
  }

  const { data: updatedRun, error: updateError } = await adminSupabase
    .from("runs")
    .update({ title: parsed.data.title, date: parsed.data.date })
    .eq("id", parsed.data.runId)
    .select("id, title, date, teacher_id")
    .single();

  if (updateError || !updatedRun) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Event konnte nicht aktualisiert werden." },
    };
  }

  try {
    await createOrRefreshTeacherInvite({
      runId: parsed.data.runId,
      schoolId: profile.school_id,
      invitedBy: user.id,
      teacherEmail: parsed.data.teacherEmail,
      eventTitle: parsed.data.title,
    });
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Event aktualisiert, aber Lehrer-Einladung konnte nicht versendet werden." },
    };
  }

  return { ok: true, data: updatedRun };
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
  const adminSupabase = getSupabaseAdminClient();
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

  const { data: profile, error: profileError } = await adminSupabase
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

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, school_id, created_by, teacher_id, date")
    .eq("id", parsed.data.runId)
    .maybeSingle();

  if (runError || !run) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Lauf nicht gefunden." },
    };
  }

  if (profile.role !== "admin") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Nur Admins duerfen Lehrerzugangs-Links erstellen." },
    };
  }

  const hasAccess = hasRunAccess({ profile, run, userId: user.id });

  if (!hasAccess) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Keine Berechtigung fuer diesen Lauf." },
    };
  }

  const eventEndDate = new Date(`${run.date}T23:59:59`);
  const fallbackHours = parsed.data.expiresInHours ?? 24;
  const expiresInSeconds = Math.max(
    60 * 60,
    Math.floor(
      parsed.data.expiresInHours != null
        ? parsed.data.expiresInHours * 60 * 60
        : (eventEndDate.getTime() - Date.now()) / 1000,
    ),
  );

  const accessToken = createTeacherRunAccessToken({
    runId: run.id,
    expiresInSeconds,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const accessUrl = `${appUrl}/teacher/runs/${run.id}/students?access=${encodeURIComponent(accessToken)}`;

  return {
    ok: true,
    data: {
      runId: run.id,
      accessToken,
      accessUrl,
      expiresInHours: Math.max(1, Math.round(expiresInSeconds / 3600)) || fallbackHours,
    },
  };
}
