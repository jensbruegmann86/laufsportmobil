import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutForm } from "@/components/dashboard/logout-form";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardHomePage() {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex items-start justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">Dashboard</h1>
            <p className="mt-2 text-sm text-zinc-600">Eingeloggt als {user.email} ({profile.role})</p>
          </div>
          <LogoutForm />
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/dashboard/runs" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50">
            <h2 className="text-lg font-semibold text-zinc-900">Events / Laeufe</h2>
            <p className="mt-1 text-sm text-zinc-600">Anlegen, verwalten und Ergebnisse erfassen.</p>
          </Link>

          <Link href="/dashboard/students" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50">
            <h2 className="text-lg font-semibold text-zinc-900">Schueler & QR</h2>
            <p className="mt-1 text-sm text-zinc-600">Sponsoring-Links und QR-Codes je Schueler.</p>
          </Link>

          <Link href="/dashboard/runs/new" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50">
            <h2 className="text-lg font-semibold text-zinc-900">Neues Event</h2>
            <p className="mt-1 text-sm text-zinc-600">Schnell einen neuen Sponsorenlauf erstellen.</p>
          </Link>
        </section>
      </div>
    </main>
  );
}
