import Link from "next/link";

import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Registrierung</h1>
        <p className="mt-1 text-sm text-zinc-600">Erstelle einen Account fuer Admin oder Lehrkraft.</p>

        <div className="mt-6">
          <RegisterForm />
        </div>

        <p className="mt-4 text-sm text-zinc-600">
          Bereits registriert? <Link href="/auth/login" className="font-semibold text-zinc-900">Zum Login</Link>
        </p>
      </div>
    </main>
  );
}
