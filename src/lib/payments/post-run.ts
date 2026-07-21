import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateFinalPledgeCents, toEuro } from "@/lib/payments/calculations";

const ProcessRunSchema = z.object({
  runId: z.uuid(),
});

type NotificationPayload = {
  pledgeId: string;
  sponsorName: string;
  sponsorEmail: string | null;
  studentName: string;
  lapsCompleted: number;
  totalAmountEuro: number;
  paymentLink: string;
};

type StudentWithRunResultAndPledges = {
  id: string;
  first_name: string;
  last_name: string;
  run_results: { laps_completed: number } | null;
  pledges:
    | {
        id: string;
        sponsor_name: string;
        sponsor_email: string | null;
        type: "per_lap" | "fixed_amount";
        amount_per_lap: number | null;
        fixed_amount: number | null;
        status: "pending" | "notified" | "paid";
      }[]
    | null;
};

export async function processRunResultsAndGenerateNotifications(input: {
  runId: string;
}): Promise<NotificationPayload[]> {
  const parsed = ProcessRunSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("Invalid run id.");
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, run_results(laps_completed), pledges(id, sponsor_name, sponsor_email, type, amount_per_lap, fixed_amount, status)",
    )
    .eq("run_id", parsed.data.runId);

  if (error) {
    throw new Error(`Failed to fetch students for post-run processing: ${error.message}`);
  }

  const students = (data ?? []) as StudentWithRunResultAndPledges[];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const notifications: NotificationPayload[] = [];

  for (const student of students) {
    const lapsCompleted = student.run_results?.laps_completed;

    if (lapsCompleted == null) {
      continue;
    }

    for (const pledge of student.pledges ?? []) {
      if (pledge.status === "paid") {
        continue;
      }

      const totalCents = calculateFinalPledgeCents({
        pledge,
        lapsCompleted,
      });

      if (totalCents <= 0) {
        continue;
      }

      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

      const { data: paymentLink, error: paymentLinkError } = await supabase
        .from("sponsor_payment_links")
        .upsert(
          {
            pledge_id: pledge.id,
            amount_cents: totalCents,
            currency: "eur",
            expires_at: expiresAt,
            paid_at: null,
          },
          { onConflict: "pledge_id" },
        )
        .select("token")
        .single();

      if (paymentLinkError) {
        throw new Error(`Failed to upsert payment link for pledge ${pledge.id}: ${paymentLinkError.message}`);
      }

      const { error: pledgeUpdateError } = await supabase
        .from("pledges")
        .update({ status: "notified", payment_method_choice: null })
        .eq("id", pledge.id)
        .neq("status", "paid");

      if (pledgeUpdateError) {
        throw new Error(`Failed to update pledge status for ${pledge.id}: ${pledgeUpdateError.message}`);
      }

      notifications.push({
        pledgeId: pledge.id,
        sponsorName: pledge.sponsor_name,
        sponsorEmail: pledge.sponsor_email,
        studentName: `${student.first_name} ${student.last_name}`,
        lapsCompleted,
        totalAmountEuro: toEuro(totalCents),
        paymentLink: `${appUrl}/pay/${paymentLink.token}`,
      });
    }
  }

  return notifications;
}
