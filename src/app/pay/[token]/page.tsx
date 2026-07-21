import { notFound } from "next/navigation";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";

import { setCashPaymentChoiceAction } from "./actions";

type PageParams = {
  token: string;
};

const TokenSchema = z.uuid();

export default async function SponsorPaymentPage({ params }: { params: Promise<PageParams> }) {
  const { token } = await params;

  if (!TokenSchema.safeParse(token).success) {
    notFound();
  }

  const supabase = getSupabaseAdminClient();

  const { data: paymentLink, error: paymentLinkError } = await supabase
    .from("sponsor_payment_links")
    .select("token, amount_cents, currency, expires_at, paid_at, pledge_id")
    .eq("token", token)
    .maybeSingle();

  if (paymentLinkError) {
    console.error("Failed to load sponsor payment link", paymentLinkError);
    notFound();
  }

  if (!paymentLink) {
    notFound();
  }

  const { data: pledge, error: pledgeError } = await supabase
    .from("pledges")
    .select("id, sponsor_name, sponsor_email, status, payment_method_choice, student_id")
    .eq("id", paymentLink.pledge_id)
    .maybeSingle();

  if (pledgeError || !pledge) {
    console.error("Failed to load pledge for sponsor payment page", pledgeError);
    notFound();
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("first_name, last_name, class_name")
    .eq("id", pledge.student_id)
    .maybeSingle();

  if (studentError || !student) {
    console.error("Failed to load student for sponsor payment page", studentError);
    notFound();
  }

  const isPaid = pledge.status === "paid" || paymentLink.paid_at != null;
  const finalAmountEuro = toEuro(paymentLink.amount_cents).toFixed(2);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Sponsoring Abschluss</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Danke, {pledge.sponsor_name}!</h1>
          <p className="mt-3 text-sm text-zinc-700">
            Fuer <span className="font-semibold">{student.first_name} {student.last_name}</span> ({student.class_name})
            betraegt deine finale Spende:
          </p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{finalAmountEuro} EUR</p>
        </section>

        {isPaid ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 shadow-sm">
            Diese Spende wurde bereits erfolgreich bezahlt. Vielen Dank!
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Zahlungsart waehlen</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Du kannst entweder bar in der Schule zahlen oder direkt online per Stripe. Falls der Link
              abgelaufen ist, wird der Abschluss im naechsten Schritt blockiert.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <form action={async () => {
                "use server";
                await setCashPaymentChoiceAction({ token });
              }}>
                <button
                  type="submit"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                >
                  Bar in der Schule
                </button>
              </form>

              <form action="/api/checkout" method="post">
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
                >
                  Online via Stripe
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
