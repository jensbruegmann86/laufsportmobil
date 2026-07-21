"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type RunOption = {
  id: string;
  title: string;
  date: string;
};

type DashboardNavigationProps = {
  runOptions: RunOption[];
  role: "admin" | "teacher" | null;
};

function toLabel(run: RunOption): string {
  const date = new Intl.DateTimeFormat("de-DE").format(new Date(run.date));
  return `${run.title} (${date})`;
}

export function DashboardNavigation({ runOptions, role }: DashboardNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedFromQuery = searchParams.get("runId");
  const selectedRunId =
    selectedFromQuery && runOptions.some((run) => run.id === selectedFromQuery)
      ? selectedFromQuery
      : (runOptions[0]?.id ?? "");

  const buildHref = (href: string) => {
    if (!selectedRunId) {
      return href;
    }

    const url = new URL(href, "http://localhost");
    url.searchParams.set("runId", selectedRunId);
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  const isActive = (href: string) => pathname === href;

  const eventLinks = [
    ...(role === "admin" ? [{ href: "/dashboard/runs/new", label: "Neues Event" }] : []),
    { href: "/dashboard/event/settings", label: "Einstellungen" },
    { href: "/dashboard/event/teacher-access", label: "Lehrerzugang per Link" },
  ];

  const participantLinks = [
    { href: "/dashboard/students", label: "Uebersicht" },
    { href: "/dashboard/students/new", label: "Neue Teilnehmer" },
  ];

  const handleRunChange = (nextRunId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("runId", nextRunId);

    const runDetailMatch = pathname.match(/^\/dashboard\/runs\/[^/]+(\/results|\/students)$/);

    if (runDetailMatch) {
      router.push(`/dashboard/runs/${nextRunId}${runDetailMatch[1]}?${nextParams.toString()}`);
      return;
    }

    router.push(`${pathname}?${nextParams.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="dashboard-run-filter" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
          {role === "admin" ? "Event auswaehlen" : "Dein Event"}
        </label>
        <select
          id="dashboard-run-filter"
          value={selectedRunId}
          onChange={(event) => handleRunChange(event.target.value)}
          disabled={runOptions.length <= 1}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
        >
          {runOptions.length === 0 ? <option value="">Keine Events verfuegbar</option> : null}
          {runOptions.map((run) => (
            <option key={run.id} value={run.id}>
              {toLabel(run)}
            </option>
          ))}
        </select>
      </div>

      <nav className="space-y-2">
        <Link
          href={buildHref("/dashboard")}
          className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive("/dashboard") ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          Uebersicht
        </Link>

        <details open={pathname.startsWith("/dashboard/event") || pathname.startsWith("/dashboard/runs/new")} className="rounded-lg border border-zinc-200">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-zinc-800">Event</summary>
          <div className="space-y-1 px-2 pb-2">
            {eventLinks.map((item) => (
              <Link
                key={item.href}
                href={buildHref(item.href)}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  isActive(item.href) ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>

        <details open={pathname.startsWith("/dashboard/students")} className="rounded-lg border border-zinc-200">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-zinc-800">Teilnehmer</summary>
          <div className="space-y-1 px-2 pb-2">
            {participantLinks.map((item) => (
              <Link
                key={item.href}
                href={buildHref(item.href)}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  isActive(item.href) ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>

        <Link
          href={buildHref("/dashboard/sponsoring")}
          className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive("/dashboard/sponsoring") ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          Sponsoring
        </Link>

        <Link
          href={buildHref("/dashboard/results")}
          className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive("/dashboard/results") ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          Ergebnisse
        </Link>
      </nav>
    </div>
  );
}
