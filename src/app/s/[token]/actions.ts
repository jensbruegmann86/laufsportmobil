"use server";

import { z } from "zod";

import { createServerActionSupabaseClient } from "@/lib/supabase/server";
import { SponsorPledgeFormSchema } from "@/lib/validation/sponsor-pledge";

type SponsorPledgeActionResult =
  | {
      ok: true;
      pledgeId: string;
      message: string;
    }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";
        message: string;
        details?: Record<string, string[]>;
      };
    };

const SponsorPledgeActionSchema = SponsorPledgeFormSchema.extend({
  token: z.uuid("Ungueltiger Link-Token."),
});

export async function createSponsorPledgeAction(
  input: z.input<typeof SponsorPledgeActionSchema>,
): Promise<SponsorPledgeActionResult> {
  const parsed = SponsorPledgeActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Bitte pruefe deine Eingaben.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const { token, sponsorFirstName, sponsorLastName, sponsorEmail, pledgeType, amountEuro } = parsed.data;
  const sponsorName = `${sponsorFirstName.trim()} ${sponsorLastName.trim()}`.trim();
  const normalizedAmount = Number(amountEuro.toFixed(2));
  const supabase = await createServerActionSupabaseClient();

  const { data: pledgeId, error } = await supabase.rpc("create_pledge_by_token", {
    p_student_token: token,
    p_sponsor_name: sponsorName,
    p_sponsor_email: sponsorEmail,
    p_type: pledgeType,
    p_amount_per_lap: pledgeType === "per_lap" ? normalizedAmount : undefined,
    p_fixed_amount: pledgeType === "fixed_amount" ? normalizedAmount : undefined,
  });

  if (error) {
    if (error.message.toLowerCase().includes("invalid student token")) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Der Sponsoring-Link ist ungueltig oder abgelaufen.",
        },
      };
    }

    console.error("Failed to create pledge by token", error);

    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Dein Sponsoring konnte nicht gespeichert werden. Bitte spaeter erneut versuchen.",
      },
    };
  }

  return {
    ok: true,
    pledgeId,
    message: "Vielen Dank. Dein Sponsoring wurde erfolgreich gespeichert.",
  };
}
