import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Laufsportmobil</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900">Sponsorenlaeufe digital verwalten</h1>
        <p className="mt-3 text-zinc-600">
          Login, Event-Setup, Schueler-QR, Sponsorenformular und Zahlungsabwicklung in einem Flow.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href="/auth/login" className="rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-zinc-700">
            Login
          </Link>
          <Link href="/auth/register" className="rounded-xl border border-zinc-300 px-4 py-3 text-center text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
            Registrierung
          </Link>
          <Link href="/dashboard" className="rounded-xl border border-zinc-300 px-4 py-3 text-center text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
