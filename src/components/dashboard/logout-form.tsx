import { redirect } from "next/navigation";

import { logoutAction } from "@/app/auth/actions";

export function LogoutForm() {
  return (
    <form
      action={async () => {
        "use server";
        await logoutAction();
        redirect("/auth/login");
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Logout
      </button>
    </form>
  );
}
