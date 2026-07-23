import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getAccessibleRunsForProfile, hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toEuro } from "@/lib/payments/calculations";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { ResendMailingForm, SendAllMailingsForm } from "./mailing-feedback-controls";

type SearchParams = {
  runId?: string;
};

type MailingRow = {
  pledgeId: string;
  sponsorName: string;
  sponsorEmail: string;
  studentName: string;
  className: string;
  amountCents: number;
  status: "offen" | "verschickt";
  sentAt: string | null;
  sendCount: number;
};

function formatEuro(cents: number): string {
  return `${toEuro(cents).toFixed(2)} EUR`;
}

export default async function MailingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { runId } = await searchParams;
  const supabase = await createServerComponentSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });
  if (!profile) {
    redirect("/onboarding");
  }

  const { data: runs, error } = await getAccessibleRunsForProfile({ supabase: adminSupabase, profile, userId: user.id });
  if (error) {
    redirect("/dashboard");
  }

  const selectedRun = runs.find((run) => run.id === runId) ?? runs[0];
  if (!selectedRun) {
    redirect("/dashboard/runs/new");
  }

  if (!hasRunAccess({ profile, run: selectedRun, userId: user.id })) {
    redirect("/dashboard");
  }

  const { data: students, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, class_name")
    .eq("run_id", selectedRun.id);

  if (studentsError) {
    redirect("/dashboard");
  }

  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const studentIds = [...studentById.keys()];

  let rows: MailingRow[] = [];
  if (studentIds.length > 0) {
    const { data: pledges, error: pledgesError } = await adminSupabase
      .from("pledges")
      .select("id, student_id, sponsor_name, sponsor_email, status, notification_sent_at, notification_send_count")
      .in("student_id", studentIds)
      .neq("status", "paid");

    if (pledgesError) {
      redirect("/dashboard");
    }

    const pledgeIds = (pledges ?? []).map((pledge) => pledge.id);

    const { data: links, error: linksError } = pledgeIds.length
      ? await adminSupabase
          .from("sponsor_payment_links")
          .select("pledge_id, amount_cents")
          .in("pledge_id", pledgeIds)
      : { data: [], error: null };

    if (linksError) {
      redirect("/dashboard");
    }

    const linkByPledgeId = new Map((links ?? []).map((link) => [link.pledge_id, link]));

    rows = (pledges ?? [])
      .map((pledge) => {
        const student = studentById.get(pledge.student_id);
        const link = linkByPledgeId.get(pledge.id);

        if (!student || !link || !pledge.sponsor_email) {
          return null;
        }

        return {
          pledgeId: pledge.id,
          sponsorName: pledge.sponsor_name,
          sponsorEmail: pledge.sponsor_email,
          studentName: `${student.first_name} ${student.last_name}`,
          className: student.class_name,
          amountCents: link.amount_cents,
          status: pledge.notification_sent_at ? "verschickt" : "offen",
          sentAt: pledge.notification_sent_at,
          sendCount: pledge.notification_send_count ?? 0,
        } as MailingRow;
      })
      .filter((row): row is MailingRow => row != null)
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "offen" ? -1 : 1;
        }

        return b.amountCents - a.amountCents;
      });
  }

  const openCount = rows.filter((row) => row.status === "offen").length;
  const sentCount = rows.filter((row) => row.status === "verschickt").length;

  return (
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Auswertung</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Mailing</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Versand der Sponsoren-Mails ist vom Ergebnis-Speichern getrennt. Event: {selectedRun.title}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Offen</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{openCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Verschickt</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{sentCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Gesamt</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{rows.length}</p>
            </div>
          </div>

          <SendAllMailingsForm runId={selectedRun.id} />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Mailingliste</h2>

          {rows.length === 0 ? (
            <p className="text-sm text-zinc-600">Noch keine Mailing-Eintraege vorhanden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.1em] text-zinc-500">
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Sponsor</th>
                    <th className="px-2 py-3">Schueler</th>
                    <th className="px-2 py-3">Betrag</th>
                    <th className="px-2 py-3">Zuletzt versendet</th>
                    <th className="px-2 py-3">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.pledgeId} className="border-b border-zinc-100 align-top">
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.status === "offen" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {row.status === "offen" ? "Offen" : "Verschickt"}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-medium text-zinc-900">{row.sponsorName}</p>
                        <p className="text-xs text-zinc-500">{row.sponsorEmail}</p>
                      </td>
                      <td className="px-2 py-3 text-zinc-700">
                        {row.studentName}
                        <p className="text-xs text-zinc-500">Klasse {row.className}</p>
                      </td>
                      <td className="px-2 py-3 font-medium text-zinc-900">{formatEuro(row.amountCents)}</td>
                      <td className="px-2 py-3 text-zinc-700">
                        {row.sentAt ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.sentAt)) : "-"}
                        <p className="text-xs text-zinc-500">Versuche: {row.sendCount}</p>
                      </td>
                      <td className="px-2 py-3">
                        <ResendMailingForm pledgeId={row.pledgeId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
