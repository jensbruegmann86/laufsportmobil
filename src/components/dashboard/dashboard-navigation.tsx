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
  sponsoringOpenCashCount?: number;
};

function toLabel(run: RunOption): string {
  const date = new Intl.DateTimeFormat("de-DE").format(new Date(run.date));
  return `${run.title} (${date})`;
}

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  query?: Record<string, string>;
  badge?: number;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export function DashboardNavigation({ runOptions, role, sponsoringOpenCashCount = 0 }: DashboardNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedFromQuery = searchParams.get("runId");
  const selectedRunId =
    selectedFromQuery && runOptions.some((run) => run.id === selectedFromQuery)
      ? selectedFromQuery
      : (runOptions[0]?.id ?? "");

  const buildHref = (item: NavItem) => {
    if (!selectedRunId) {
      const urlWithoutRun = new URL(item.href, "http://localhost");

      Object.entries(item.query ?? {}).forEach(([key, value]) => {
        urlWithoutRun.searchParams.set(key, value);
      });

      return `${urlWithoutRun.pathname}${urlWithoutRun.searchParams.toString() ? `?${urlWithoutRun.searchParams.toString()}` : ""}`;
    }

    const url = new URL(item.href, "http://localhost");
    url.searchParams.set("runId", selectedRunId);
    Object.entries(item.query ?? {}).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  const isActive = (item: NavItem) => {
    if ((item.exact ?? true) && pathname !== item.href) {
      return false;
    }

    if (!item.query) {
      return true;
    }

    return Object.entries(item.query).every(([key, value]) => {
      if (item.href === "/dashboard/sponsoring" && key === "view" && value === "overview") {
        return (searchParams.get(key) ?? "overview") === value;
      }

      return searchParams.get(key) === value;
    });
  };

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
      title: "Sponsoring",
      items: [
        { href: "/dashboard/sponsoring", label: "Uebersicht", query: { view: "overview" } },
        { href: "/dashboard/sponsoring", label: "Barzahlungen", query: { view: "cash" }, badge: sponsoringOpenCashCount > 0 ? sponsoringOpenCashCount : undefined },
        { href: "/dashboard/sponsoring", label: "Liste", query: { view: "list" } },
      ],
    },
    {
      title: "Auswertung",
      items: [{ href: "/dashboard/results", label: "Ergebnisse" }],
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
                    key={`${item.href}-${item.query ? Object.entries(item.query).map(([key, value]) => `${key}:${value}`).join("-") : "base"}`}
                    href={buildHref(item)}
                  className={`block rounded-r-xl px-3 py-2 text-sm transition ${
                    isActive(item)
                      ? "border-l-2 border-zinc-900 bg-zinc-900 text-white"
                      : "border-l-2 border-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                    <span className="flex items-center justify-between gap-3">
                      <span>{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {item.badge}
                        </span>
                      ) : null}
                    </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
