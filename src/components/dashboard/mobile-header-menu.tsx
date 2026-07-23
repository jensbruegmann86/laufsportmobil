"use client";

import { useState } from "react";

import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { LogoutForm } from "@/components/dashboard/logout-form";

type RunOption = {
  id: string;
  title: string;
  date: string;
};

type Props = {
  runOptions: RunOption[];
  role: "admin" | "teacher" | null;
  sponsoringOpenCashCount: number;
  userEmail: string;
};

export function MobileHeaderMenu({ runOptions, role, sponsoringOpenCashCount, userEmail }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
          aria-controls="mobile-dashboard-menu"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700"
        >
          Menu
        </button>
      </div>

      {isOpen ? (
        <div id="mobile-dashboard-menu" className="mt-3 w-full border-t border-zinc-200 bg-white px-4 py-4">
          <p className="mb-3 text-xs text-zinc-500">{userEmail} ({role ?? "ohne Rolle"})</p>
          <DashboardNavigation
            runOptions={runOptions}
            role={role}
            sponsoringOpenCashCount={sponsoringOpenCashCount}
            onItemSelect={() => setIsOpen(false)}
          />
          <div className="mt-4 border-t border-zinc-200 pt-3">
            <LogoutForm />
          </div>
        </div>
      ) : null}
    </div>
  );
}
