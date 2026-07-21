import Link from "next/link";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Login</h1>
        <p className="mt-1 text-sm text-zinc-600">Melde dich als Admin oder Lehrkraft an.</p>

        <div className="mt-6">
          <LoginForm />
        </div>

        <p className="mt-4 text-sm text-zinc-600">
          Noch kein Account? <Link href="/auth/register" className="font-semibold text-zinc-900">Registrieren</Link>
        </p>
      </div>
    </main>
  );
}
