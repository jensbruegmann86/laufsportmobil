"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { sendSponsorNotificationEmail } from "@/lib/email/smtp";
import { toEuro } from "@/lib/payments/calculations";
import { hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerActionSupabaseClient } from "@/lib/supabase/server";

const SendPendingSchema = z.object({
  runId: z.uuid(),
});

const ResendSingleSchema = z.object({
  pledgeId: z.uuid(),
});

export type MailingActionState = {
  ok: boolean;
  message: string;
};

export const INITIAL_MAILING_ACTION_STATE: MailingActionState = {
  ok: true,
  message: "",
};

type MailingItem = {
  pledgeId: string;
  sponsorName: string;
  sponsorEmail: string;
  studentName: string;
  lapsCompleted: number;
  amountCents: number;
  paymentLink: string;
  sendCount: number;
};

async function ensureRunAccess(runId: string) {
  const supabase = await createServerActionSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Bitte zuerst anmelden.");
  }

  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });

  if (!profile) {
    throw new Error("Profil konnte nicht geladen werden.");
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, school_id, created_by, teacher_id")
    .eq("id", runId)
    .maybeSingle();

  if (runError || !run) {
    throw new Error("Event nicht gefunden.");
  }

  if (!hasRunAccess({ profile, run, userId: user.id })) {
    throw new Error("Keine Berechtigung fuer dieses Event.");
  }

  return { adminSupabase, run, user };
}

async function loadPendingMailingsForRun(runId: string): Promise<MailingItem[]> {
  const adminSupabase = getSupabaseAdminClient();

  const { data: students, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, run_results(laps_completed)")
    .eq("run_id", runId);

  if (studentsError) {
    throw new Error("Teilnehmer konnten nicht geladen werden.");
  }

  const studentIds = (students ?? []).map((student) => student.id);

  if (studentIds.length === 0) {
    return [];
  }

  const { data: pledges, error: pledgesError } = await adminSupabase
    .from("pledges")
    .select("id, student_id, sponsor_name, sponsor_email, status, notification_sent_at, notification_send_count")
    .in("student_id", studentIds)
    .neq("status", "paid")
    .is("notification_sent_at", null);

  if (pledgesError) {
    throw new Error("Sponsoring-Eintraege konnten nicht geladen werden.");
  }

  const eligiblePledges = (pledges ?? []).filter((pledge) => Boolean(pledge.sponsor_email));
  const pledgeIds = eligiblePledges.map((pledge) => pledge.id);

  if (pledgeIds.length === 0) {
    return [];
  }

  const { data: links, error: linksError } = await adminSupabase
    .from("sponsor_payment_links")
    .select("pledge_id, token, amount_cents")
    .in("pledge_id", pledgeIds);

  if (linksError) {
    throw new Error("Zahlungslinks konnten nicht geladen werden.");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const linkByPledgeId = new Map((links ?? []).map((item) => [item.pledge_id, item]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));

  return eligiblePledges
    .map((pledge) => {
      const student = studentById.get(pledge.student_id);
      const link = linkByPledgeId.get(pledge.id);
      const lapsCompleted = student?.run_results?.laps_completed;

      if (!student || !link || lapsCompleted == null) {
        return null;
      }

      return {
        pledgeId: pledge.id,
        sponsorName: pledge.sponsor_name,
        sponsorEmail: pledge.sponsor_email as string,
        studentName: `${student.first_name} ${student.last_name}`,
        lapsCompleted,
        amountCents: link.amount_cents,
        paymentLink: `${appUrl}/pay/${link.token}`,
        sendCount: pledge.notification_send_count ?? 0,
      };
    })
    .filter((item): item is MailingItem => item != null);
}

export async function sendPendingMailingsAction(input: { runId: string }) {
  const parsed = SendPendingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, message: "Ungueltiges Event." };
  }

  try {
    const { adminSupabase } = await ensureRunAccess(parsed.data.runId);
    const pendingMailings = await loadPendingMailingsForRun(parsed.data.runId);

    if (pendingMailings.length === 0) {
      return { ok: true as const, message: "Keine offenen Mailings gefunden.", attempted: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;
    const batchSize = 20;

    for (let offset = 0; offset < pendingMailings.length; offset += batchSize) {
      const batch = pendingMailings.slice(offset, offset + batchSize);

      const results = await Promise.allSettled(
        batch.map((mailing) =>
          sendSponsorNotificationEmail({
            sponsorName: mailing.sponsorName,
            sponsorEmail: mailing.sponsorEmail,
            studentName: mailing.studentName,
            lapsCompleted: mailing.lapsCompleted,
            totalAmountEuro: toEuro(mailing.amountCents),
            paymentLink: mailing.paymentLink,
          }),
        ),
      );

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const mailing = batch[index];

        if (result.status === "fulfilled") {
          sent += 1;
          await adminSupabase
            .from("pledges")
            .update({
              status: "notified",
              notification_sent_at: new Date().toISOString(),
              notification_send_count: mailing.sendCount + 1,
            })
            .eq("id", mailing.pledgeId)
            .neq("status", "paid");
        } else {
          failed += 1;
          console.error("Failed to send sponsor notification", result.reason);
        }
      }
    }

    revalidatePath(`/dashboard/mailing?runId=${parsed.data.runId}`);
    revalidatePath(`/dashboard/results?runId=${parsed.data.runId}`);

    return {
      ok: true as const,
      message: failed > 0 ? `${sent}/${pendingMailings.length} Mailings versendet, ${failed} fehlgeschlagen.` : `${sent} Mailings erfolgreich versendet.`,
      attempted: pendingMailings.length,
      sent,
      failed,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Mailings konnten nicht versendet werden.",
    };
  }
}

export async function resendMailingAction(input: { pledgeId: string }) {
  const parsed = ResendSingleSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, message: "Ungueltiger Mailing-Eintrag." };
  }

  const adminSupabase = getSupabaseAdminClient();

  try {
    const { data: pledge, error: pledgeError } = await adminSupabase
      .from("pledges")
      .select("id, student_id, sponsor_name, sponsor_email, status, notification_send_count")
      .eq("id", parsed.data.pledgeId)
      .maybeSingle();

    if (pledgeError || !pledge) {
      return { ok: false as const, message: "Mailing-Eintrag nicht gefunden." };
    }

    const { data: student, error: studentError } = await adminSupabase
      .from("students")
      .select("id, run_id, first_name, last_name, run_results(laps_completed)")
      .eq("id", pledge.student_id)
      .maybeSingle();

    if (studentError || !student) {
      return { ok: false as const, message: "Teilnehmer zum Mailing nicht gefunden." };
    }

    await ensureRunAccess(student.run_id);

    if (!pledge.sponsor_email) {
      return { ok: false as const, message: "Keine Sponsor-E-Mail vorhanden." };
    }

    if (pledge.status === "paid") {
      return { ok: false as const, message: "Diese Spende ist bereits bezahlt. Kein erneutes Mailing noetig." };
    }

    const { data: paymentLink, error: paymentLinkError } = await adminSupabase
      .from("sponsor_payment_links")
      .select("token, amount_cents")
      .eq("pledge_id", pledge.id)
      .maybeSingle();

    if (paymentLinkError || !paymentLink) {
      return { ok: false as const, message: "Zahlungslink fehlt. Bitte zuerst Ergebnisse speichern." };
    }

    const lapsCompleted = student.run_results?.laps_completed;
    if (lapsCompleted == null) {
      return { ok: false as const, message: "Es sind noch keine Runden fuer den Teilnehmer hinterlegt." };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    await sendSponsorNotificationEmail({
      sponsorName: pledge.sponsor_name,
      sponsorEmail: pledge.sponsor_email,
      studentName: `${student.first_name} ${student.last_name}`,
      lapsCompleted,
      totalAmountEuro: toEuro(paymentLink.amount_cents),
      paymentLink: `${appUrl}/pay/${paymentLink.token}`,
    });

    await adminSupabase
      .from("pledges")
      .update({
        status: "notified",
        notification_sent_at: new Date().toISOString(),
        notification_send_count: (pledge.notification_send_count ?? 0) + 1,
      })
      .eq("id", pledge.id)
      .neq("status", "paid");

    revalidatePath(`/dashboard/mailing?runId=${student.run_id}`);

    return { ok: true as const, message: "Mailing wurde erneut versendet." };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Mailing konnte nicht versendet werden.",
    };
  }
}

export async function sendPendingMailingsFormAction(
  _previousState: MailingActionState,
  formData: FormData,
): Promise<MailingActionState> {
  const runId = formData.get("runId");
  const result = await sendPendingMailingsAction({ runId: typeof runId === "string" ? runId : "" });

  return {
    ok: result.ok,
    message: result.message,
  };
}

export async function resendMailingFormAction(
  _previousState: MailingActionState,
  formData: FormData,
): Promise<MailingActionState> {
  const pledgeId = formData.get("pledgeId");
  const result = await resendMailingAction({ pledgeId: typeof pledgeId === "string" ? pledgeId : "" });

  return {
    ok: result.ok,
    message: result.message,
  };
}
