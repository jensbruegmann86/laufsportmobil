"use server";

import { redirect } from "next/navigation";

import { logoutAction } from "@/app/auth/actions";

export async function logoutAndRedirectAction() {
  await logoutAction();
  redirect("/auth/login");
}
