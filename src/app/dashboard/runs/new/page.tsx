import { redirect } from "next/navigation";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

import { CreateRunForm } from "./create-run-form";

export default async function NewRunPage() {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Neues Event anlegen</h1>
        <p className="mt-1 text-sm text-zinc-600">Lege einen neuen Sponsorenlauf an.</p>
        <div className="mt-6">
          <CreateRunForm />
        </div>
      </div>
    </main>
  );
}
