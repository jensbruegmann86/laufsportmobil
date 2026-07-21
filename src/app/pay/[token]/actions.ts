"use server";

import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const SetCashChoiceSchema = z.object({
  token: z.uuid(),
});

type SetCashChoiceResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
    };

export async function setCashPaymentChoiceAction(input: { token: string }): Promise<SetCashChoiceResult> {
  const parsed = SetCashChoiceSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Ungueltiger Zahlungslink." };
  }

  const supabase = getSupabaseAdminClient();

  const { data: link, error: linkError } = await supabase
    .from("sponsor_payment_links")
    .select("pledge_id, paid_at, expires_at")
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (linkError || !link) {
    return { ok: false, error: "Zahlungslink wurde nicht gefunden." };
  }

  if (link.paid_at) {
    return { ok: true, message: "Diese Spende ist bereits als bezahlt markiert." };
  }

  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Dieser Zahlungslink ist abgelaufen." };
  }

  const { error: pledgeError } = await supabase
    .from("pledges")
    .update({ payment_method_choice: "cash", status: "notified" })
    .eq("id", link.pledge_id)
    .neq("status", "paid");

  if (pledgeError) {
    return { ok: false, error: "Zahlungsart konnte nicht gespeichert werden." };
  }

  return {
    ok: true,
    message: "Danke. Die Zahlung wird bar in der Schule erfolgen.",
  };
}
