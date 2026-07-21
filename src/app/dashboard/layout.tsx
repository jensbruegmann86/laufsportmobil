import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { LogoutForm } from "@/components/dashboard/logout-form";
import { getAccessibleRunsForProfile } from "@/lib/runs/access";
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

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const adminSupabase = getSupabaseAdminClient();
  let profile;

  try {
    profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });
  } catch {
    profile = null;
  }

  if (!profile) {
    redirect("/onboarding");
  }

  let runOptions: RunOption[] = [];
  const { data: runs } = await getAccessibleRunsForProfile({
    supabase: adminSupabase,
    profile,
    userId: user.id,
  });

  runOptions = runs.map((run) => ({ id: run.id, title: run.title, date: run.date }));

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>
            <p className="text-xs text-zinc-500">{user.email} ({profile?.role ?? "ohne Rolle"})</p>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <p className="text-sm text-zinc-600">Angemeldet als {user.email}</p>
            <LogoutForm />
          </div>

          <details className="relative md:hidden">
            <summary className="list-none rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700">
              Menu
            </summary>

            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
              <p className="mb-2 text-xs text-zinc-500">{user.email} ({profile?.role ?? "ohne Rolle"})</p>
              <DashboardNavigation runOptions={runOptions} role={profile.role} />
              <div className="mt-3 border-t border-zinc-200 pt-3">
                <LogoutForm />
              </div>
            </div>
          </details>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="sticky top-6 hidden h-[calc(100vh-7rem)] w-72 shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:block">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>
          <p className="mb-4 text-xs text-zinc-500">Navigation</p>
          <DashboardNavigation runOptions={runOptions} role={profile.role} />
          <div className="mt-4 border-t border-zinc-200 pt-4">
            <LogoutForm />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
