import Link from "next/link";

import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; invited?: string }>;
}) {
  const { email, invited } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Laufsportmobil</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">Registrierung</h1>
        <p className="mt-2 text-sm text-zinc-600">Nutze deine eingeladene E-Mail-Adresse, damit der Eventzugang direkt zugeordnet werden kann.</p>

        {invited === "1" ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Einladung erkannt. Nach der Registrierung wird dein Eventzugang automatisch freigeschaltet.
          </p>
        ) : null}

        <div className="mt-6">
          <RegisterForm initialEmail={email ?? ""} />
        </div>

        <p className="mt-5 text-sm text-zinc-600">
          Bereits registriert? <Link href="/auth/login" className="font-semibold text-zinc-900">Zum Login</Link>
        </p>
      </div>
    </main>
  );
}
