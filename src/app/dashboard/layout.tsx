import { redirect } from "next/navigation";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { LogoutForm } from "@/components/dashboard/logout-form";
import { MobileHeaderMenu } from "@/components/dashboard/mobile-header-menu";
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

type StudentRow = {
  id: string;
  run_id: string;
};

type PledgeRow = {
  student_id: string;
  status: "pending" | "notified" | "paid";
  payment_method_choice: "cash" | "stripe" | null;
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

  let sponsoringOpenCashCount = 0;
  const runIds = runOptions.map((run) => run.id);

  if (runIds.length > 0) {
    const { data: students } = await adminSupabase.from("students").select("id, run_id").in("run_id", runIds);
    const studentIds = ((students ?? []) as StudentRow[]).map((student) => student.id);

    if (studentIds.length > 0) {
      const { data: pledges } = await adminSupabase
        .from("pledges")
        .select("student_id, status, payment_method_choice")
        .in("student_id", studentIds);

      sponsoringOpenCashCount = ((pledges ?? []) as PledgeRow[]).filter(
        (pledge) => pledge.payment_method_choice === "cash" && pledge.status !== "paid",
      ).length;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>
              <p className="text-xs text-zinc-500">Dashboard Verwaltung</p>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <p className="text-sm text-zinc-600">{user.email}</p>
              <LogoutForm />
            </div>
          </div>

          <MobileHeaderMenu
            runOptions={runOptions}
            role={profile.role}
            sponsoringOpenCashCount={sponsoringOpenCashCount}
            userEmail={user.email ?? "-"}
          />
        </div>
      </header>

      <div className="grid w-full grid-cols-1 gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden self-start border-r border-zinc-200 bg-white md:block lg:sticky lg:top-[4.5rem]">
          <div className="px-5 py-6">
            <DashboardNavigation runOptions={runOptions} role={profile.role} sponsoringOpenCashCount={sponsoringOpenCashCount} />
          </div>
        </aside>

        <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
