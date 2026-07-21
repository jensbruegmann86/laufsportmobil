import type { TableRow } from "@/lib/supabase/database.types";

type PledgeRow = TableRow<"pledges">;

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function toEuro(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function calculateFinalPledgeCents(input: {
  pledge: Pick<PledgeRow, "type" | "amount_per_lap" | "fixed_amount">;
  lapsCompleted: number;
}): number {
  const { pledge, lapsCompleted } = input;

  if (lapsCompleted < 0) {
    throw new Error("lapsCompleted cannot be negative.");
  }

  if (pledge.type === "per_lap") {
    if (pledge.amount_per_lap == null) {
      throw new Error("amount_per_lap is required for per_lap pledges.");
    }

    return toCents(pledge.amount_per_lap * lapsCompleted);
  }

  if (pledge.fixed_amount == null) {
    throw new Error("fixed_amount is required for fixed_amount pledges.");
  }

  return toCents(pledge.fixed_amount);
}
