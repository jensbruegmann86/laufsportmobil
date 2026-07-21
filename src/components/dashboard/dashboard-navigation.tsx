"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

type RunOption = {
  id: string;
  title: string;
  date: string;
};

type DashboardNavigationProps = {
  navItems: NavItem[];
  runOptions: RunOption[];
  role: "admin" | "teacher" | null;
};

function toLabel(run: RunOption): string {
  const date = new Intl.DateTimeFormat("de-DE").format(new Date(run.date));
  return `${run.title} (${date})`;
}

export function DashboardNavigation({ navItems, runOptions, role }: DashboardNavigationProps) {
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
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={buildHref(item.href)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
