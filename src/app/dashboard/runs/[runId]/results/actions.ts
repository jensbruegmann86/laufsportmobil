"use server";

import { z } from "zod";

import { sendSponsorNotificationEmail } from "@/lib/email/smtp";
import { processRunResultsAndGenerateNotifications } from "@/lib/payments/post-run";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerActionSupabaseClient } from "@/lib/supabase/server";

type SaveLapResultsResult =
  | {
      ok: true;
      notifications: {
        pledgeId: string;
        sponsorName: string;
        sponsorEmail: string | null;
        studentName: string;
        lapsCompleted: number;
        totalAmountEuro: number;
        paymentLink: string;
      }[];
    }
  | {
      ok: false;
      error: {
        code: "UNAUTHENTICATED" | "FORBIDDEN" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
        message: string;
      };
    };

const SaveLapResultsSchema = z.object({
  runId: z.uuid(),
  entries: z
    .array(
      z.object({
        studentId: z.uuid(),
        lapsCompleted: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export async function saveLapResultsAction(input: {
  runId: string;
  entries: { studentId: string; lapsCompleted: number }[];
}): Promise<SaveLapResultsResult> {
  const parsed = SaveLapResultsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Eingaben fuer Runden-Ergebnisse.",
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
    .select("id, school_id, created_by")
    .eq("id", parsed.data.runId)
    .maybeSingle();

  if (runError || !run) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Lauf konnte nicht geladen werden." },
    };
  }

  const hasAccess =
    (profile.role === "admin" && run.school_id === profile.school_id) ||
    (profile.role === "teacher" && run.created_by === user.id);

  if (!hasAccess) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Keine Berechtigung fuer diesen Lauf.",
      },
    };
  }

  const upsertPayload = parsed.data.entries.map((entry) => ({
    student_id: entry.studentId,
    laps_completed: entry.lapsCompleted,
  }));

  const { error: upsertError } = await adminSupabase
    .from("run_results")
    .upsert(upsertPayload, { onConflict: "student_id" });

  if (upsertError) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Runden konnten nicht gespeichert werden." },
    };
  }

  try {
    const notifications = await processRunResultsAndGenerateNotifications({ runId: parsed.data.runId });

    for (const payload of notifications) {
      if (!payload.sponsorEmail) {
        continue;
      }

      await sendSponsorNotificationEmail({
        sponsorName: payload.sponsorName,
        sponsorEmail: payload.sponsorEmail,
        studentName: payload.studentName,
        lapsCompleted: payload.lapsCompleted,
        totalAmountEuro: payload.totalAmountEuro,
        paymentLink: payload.paymentLink,
      });
    }

    return { ok: true, notifications };
  } catch (error) {
    console.error("Post-run processing failed", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Runden gespeichert, aber Benachrichtigungen konnten nicht erstellt werden.",
      },
    };
  }
}
