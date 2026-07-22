import { redirect } from "next/navigation";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const adminSupabase = getSupabaseAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Ersteinrichtung</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Lege jetzt deine Schule an. Danach wird dein Account als Admin verknuepft.
        </p>
        <div className="mt-6">
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
