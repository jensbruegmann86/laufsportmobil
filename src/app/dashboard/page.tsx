import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type SearchParams = {
  runId?: string;
};

export default async function DashboardHomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { runId } = await searchParams;
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const adminSupabase = getSupabaseAdminClient();
  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });

  if (!profile) {
    redirect("/onboarding");
  }

  const { data: runs, error } = await getAccessibleRunsForProfile({ supabase: adminSupabase, profile, userId: user.id });
  if (error) {
    redirect("/dashboard/runs");
  }

  const selectedRun = runs.find((run) => run.id === runId) ?? runs[0];

  if (!selectedRun) {
    redirect("/dashboard/runs/new");
  }

  const { data: students } = await adminSupabase
    .from("students")
    .select("id")
    .eq("run_id", selectedRun.id);

  const studentIds = (students ?? []).map((student) => student.id);

  const { data: runResults } = studentIds.length
    ? await adminSupabase.from("run_results").select("student_id").in("student_id", studentIds)
    : { data: [] };

  const { data: pledges } = studentIds.length
    ? await adminSupabase
        .from("pledges")
        .select("id, student_id, status, payment_method_choice")
        .in("student_id", studentIds)
    : { data: [] };

  const pledgeIds = (pledges ?? []).map((pledge) => pledge.id);

  const { data: paymentLinks } = pledgeIds.length
    ? await adminSupabase
        .from("sponsor_payment_links")
        .select("pledge_id, amount_cents, paid_at")
        .in("pledge_id", pledgeIds)
    : { data: [] };

  const participantsCount = students?.length ?? 0;
  const resultsCount = runResults?.length ?? 0;
  const sponsorsCount = pledges?.length ?? 0;
  const linkByPledgeId = new Map((paymentLinks ?? []).map((item) => [item.pledge_id, item]));
  const paidCents = (pledges ?? []).reduce((sum, pledge) => {
    if (pledge.status !== "paid") {
      return sum;
    }

    return sum + (linkByPledgeId.get(pledge.id)?.amount_cents ?? 0);
  }, 0);
  const expectedCents = (paymentLinks ?? []).reduce((sum, item) => sum + item.amount_cents, 0);
  const openCents = Math.max(expectedCents - paidCents, 0);
  const cashOpen = (pledges ?? []).filter((pledge) => pledge.payment_method_choice === "cash" && pledge.status !== "paid").length;
  const resultProgress = participantsCount > 0 ? Math.round((resultsCount / participantsCount) * 100) : 0;

  const statCards = [
    { label: "Teilnehmer", value: String(participantsCount), hint: "Im ausgewaehlten Event" },
    { label: "Gesammelt", value: `${toEuro(paidCents).toFixed(2)} EUR`, hint: "Bereits bezahlt" },
    { label: "Offen", value: `${toEuro(openCents).toFixed(2)} EUR`, hint: "Noch nicht bezahlt" },
    { label: "Sponsoren", value: String(sponsorsCount), hint: "Pledges insgesamt" },
    { label: "Runden erfasst", value: `${resultsCount}/${participantsCount}`, hint: `${resultProgress}% Fortschritt` },
    { label: "Bar offen", value: String(cashOpen), hint: "Noch zu bestaetigen" },
  ];

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Uebersicht</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">{selectedRun.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {new Intl.DateTimeFormat("de-DE").format(new Date(selectedRun.date))} · Status {selectedRun.status}
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((card) => (
            <article key={card.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-zinc-900">{card.value}</p>
              <p className="mt-1 text-xs text-zinc-500">{card.hint}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Was noch hilfreich ist</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              Teilnehmer ohne Ergebnis: <span className="font-semibold text-zinc-900">{Math.max(participantsCount - resultsCount, 0)}</span>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              Noch unbezahlte Sponsoren: <span className="font-semibold text-zinc-900">{(pledges ?? []).filter((pledge) => pledge.status !== "paid").length}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
