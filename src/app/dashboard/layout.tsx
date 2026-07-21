import { redirect } from "next/navigation";

import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { LogoutForm } from "@/components/dashboard/logout-form";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

type RunOption = {
  id: string;
  title: string;
  date: string;
};

const navItems = [
  { href: "/dashboard", label: "Uebersicht" },
  { href: "/dashboard/runs", label: "Events / Laeufe" },
  { href: "/dashboard/sponsoring", label: "Sponsoring" },
  { href: "/dashboard/students", label: "Schueler & QR" },
  { href: "/dashboard/runs/new", label: "Neues Event" },
];

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const adminSupabase = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    redirect("/onboarding");
  }

  let runOptions: RunOption[] = [];

  if (profile.role === "admin") {
    const { data: runs } = await adminSupabase
      .from("runs")
      .select("id, title, date")
      .eq("school_id", profile.school_id)
      .order("date", { ascending: false });

    runOptions = (runs ?? []) as RunOption[];
  } else if (profile.role === "teacher") {
    const { data: runs } = await adminSupabase
      .from("runs")
      .select("id, title, date")
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    runOptions = (runs ?? []) as RunOption[];
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white md:hidden">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>

          <details className="relative">
            <summary className="list-none rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700">
              Menu
            </summary>

            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
              <p className="mb-2 text-xs text-zinc-500">{user.email} ({profile?.role ?? "ohne Rolle"})</p>
              <DashboardNavigation navItems={navItems} runOptions={runOptions} role={profile.role} />
              <div className="mt-3 border-t border-zinc-200 pt-3">
                <LogoutForm />
              </div>
            </div>
          </details>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:block">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>
          <p className="mb-4 text-xs text-zinc-500">{user.email} ({profile?.role ?? "ohne Rolle"})</p>
          <DashboardNavigation navItems={navItems} runOptions={runOptions} role={profile.role} />
          <div className="mt-4 border-t border-zinc-200 pt-4">
            <LogoutForm />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
