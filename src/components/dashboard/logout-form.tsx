import { logoutAndRedirectAction } from "@/app/auth/logout-action";

export function LogoutForm() {
  return (
    <form action={logoutAndRedirectAction}>
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Logout
      </button>
    </form>
  );
}
