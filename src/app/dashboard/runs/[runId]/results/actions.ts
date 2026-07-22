"use server";

import { z } from "zod";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { sendSponsorNotificationEmail } from "@/lib/email/smtp";
import { processRunResultsAndGenerateNotifications } from "@/lib/payments/post-run";
import { hasRunAccess } from "@/lib/runs/access";
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
      emailDelivery: {
        attempted: number;
        sent: number;
        failed: number;
      };
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

  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });

  if (!profile) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Profil konnte nicht geladen werden." },
    };
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, school_id, created_by, teacher_id")
    .eq("id", parsed.data.runId)
    .maybeSingle();

  if (runError || !run) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Lauf konnte nicht geladen werden." },
    };
  }

  const hasAccess = hasRunAccess({ profile, run, userId: user.id });

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
    const mailTargets = notifications.filter((payload) => Boolean(payload.sponsorEmail));

    const deliverySummary = {
      attempted: mailTargets.length,
      sent: 0,
      failed: 0,
    };

    const batchSize = 20;

    for (let offset = 0; offset < mailTargets.length; offset += batchSize) {
      const batch = mailTargets.slice(offset, offset + batchSize);

      const results = await Promise.allSettled(
        batch.map((payload) =>
          sendSponsorNotificationEmail({
            sponsorName: payload.sponsorName,
            sponsorEmail: payload.sponsorEmail as string,
            studentName: payload.studentName,
            lapsCompleted: payload.lapsCompleted,
            totalAmountEuro: payload.totalAmountEuro,
            paymentLink: payload.paymentLink,
          }),
        ),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          deliverySummary.sent += 1;
        } else {
          deliverySummary.failed += 1;
          console.error("Sponsor notification email failed", result.reason);
        }
      }
    }

    return { ok: true, notifications, emailDelivery: deliverySummary };
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
