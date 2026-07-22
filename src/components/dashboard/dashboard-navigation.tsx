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

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

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

  const isActive = (item: NavItem) => (item.exact ?? true ? pathname === item.href : pathname.startsWith(item.href));

  const eventLinks: NavItem[] = [
    ...(role === "admin" ? [{ href: "/dashboard/runs/new", label: "Neues Event" }] : []),
    { href: "/dashboard/event/settings", label: "Einstellungen" },
    { href: "/dashboard/event/teacher-access", label: "Lehrerzugang per Link" },
  ];

  const participantLinks: NavItem[] = [
    { href: "/dashboard/students", label: "Uebersicht" },
    { href: "/dashboard/students/new", label: "Neue Teilnehmer" },
    { href: "/dashboard/students/start-numbers", label: "Startnummern zuordnen" },
  ];

  const sections: NavSection[] = [
    {
      title: "Dashboard",
      items: [{ href: "/dashboard", label: "Uebersicht" }],
    },
    {
      title: "Event",
      items: eventLinks,
    },
    {
      title: "Teilnehmer",
      items: participantLinks,
    },
    {
      title: "Auswertung",
      items: [
        { href: "/dashboard/sponsoring", label: "Sponsoring" },
        { href: "/dashboard/results", label: "Ergebnisse" },
      ],
    },
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
        <label htmlFor="dashboard-run-filter" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {role === "admin" ? "Event auswaehlen" : "Dein Event"}
        </label>
        <select
          id="dashboard-run-filter"
          value={selectedRunId}
          onChange={(event) => handleRunChange(event.target.value)}
          disabled={runOptions.length <= 1}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100"
        >
          {runOptions.length === 0 ? <option value="">Keine Events verfuegbar</option> : null}
          {runOptions.map((run) => (
            <option key={run.id} value={run.id}>
              {toLabel(run)}
            </option>
          ))}
        </select>
      </div>

      <nav className="space-y-4">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{section.title}</p>
            <div className="space-y-1 border-l border-zinc-200 pl-3">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={buildHref(item.href)}
                  className={`block rounded-r-xl px-3 py-2 text-sm transition ${
                    isActive(item)
                      ? "border-l-2 border-zinc-900 bg-zinc-900 text-white"
                      : "border-l-2 border-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
