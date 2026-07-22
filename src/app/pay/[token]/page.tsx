import { notFound } from "next/navigation";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";

import { setCashPaymentChoiceAction } from "./actions";

type PageParams = {
  token: string;
};

const TokenSchema = z.uuid();

type SearchParams = {
  payment?: string;
};

export default async function SponsorPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { token } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

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
  const isCashSelected = pledge.payment_method_choice === "cash" && !isPaid;
  const finalAmountEuro = toEuro(paymentLink.amount_cents).toFixed(2);
  const paymentState = resolvedSearchParams?.payment;

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50 p-[calc(var(--spacing)*1)]">
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
            {paymentState === "success"
              ? "Deine Spende wurde erfolgreich bezahlt. Vielen Dank!"
              : "Diese Spende wurde bereits erfolgreich bezahlt. Vielen Dank!"}
          </section>
        ) : isCashSelected ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
            <p className="font-semibold">Barzahlung vorgemerkt</p>
            <p className="mt-1">
              Danke! Die Schule hat vermerkt, dass du den Betrag bar zahlst. Die Lehrkraft markiert die Zahlung nach
              Erhalt als abgeschlossen.
            </p>

            <div className="mt-4">
              <form action="/api/checkout" method="post">
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                >
                  Stattdessen online via Stripe zahlen
                </button>
              </form>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Zahlungsart waehlen</h2>
            <p className="mt-2 text-sm text-zinc-600">Waehle die passende Zahlungsart fuer deinen Abschluss.</p>

            {paymentState === "cancelled" ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Stripe-Zahlung wurde abgebrochen. Du kannst es erneut versuchen oder Barzahlung waehlen.
              </p>
            ) : null}

            {paymentState === "success" ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Zahlung erfolgreich gestartet. Die finale Bestaetigung erfolgt automatisch per Stripe-Webhook.
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <form action={async () => {
                "use server";
                await setCashPaymentChoiceAction({ token });
              }}>
                <button
                  type="submit"
                  className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <span className="block text-sm font-semibold text-zinc-900">Bar in der Schule</span>
                  <span className="mt-1 block text-sm text-zinc-600">Wird spaeter von der Schule als eingegangen markiert.</span>
                </button>
              </form>

              <form action="/api/checkout" method="post">
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="w-full rounded-2xl border border-zinc-900 bg-zinc-900 p-4 text-left transition hover:bg-zinc-800"
                >
                  <span className="block text-sm font-semibold text-white">Online via Stripe</span>
                  <span className="mt-1 block text-sm text-zinc-300">Direkt weiter zur sicheren Online-Zahlung.</span>
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
