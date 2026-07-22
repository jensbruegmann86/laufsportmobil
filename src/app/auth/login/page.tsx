import Link from "next/link";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { confirmed } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Laufsportmobil</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">Login</h1>
        <p className="mt-2 text-sm text-zinc-600">Admins und Lehrkraefte melden sich hier mit ihrem Zugang an.</p>

        {confirmed === "1" ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            E-Mail bestaetigt. Du kannst dich jetzt einloggen.
          </p>
        ) : null}

        <div className="mt-6">
          <LoginForm />
        </div>

        <p className="mt-5 text-sm text-zinc-600">
          Noch kein Account? <Link href="/auth/register" className="font-semibold text-zinc-900">Registrieren</Link>
        </p>
      </div>
    </main>
  );
}
