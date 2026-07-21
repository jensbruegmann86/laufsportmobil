"use server";

import { z } from "zod";

import { createServerActionSupabaseClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type AuthResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export async function loginAction(input: { email: string; password: string }): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Bitte pruefe E-Mail und Passwort." };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, message: "Login fehlgeschlagen. Bitte Daten pruefen." };
  }

  return { ok: true };
}

export async function registerAction(input: { email: string; password: string }): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Bitte pruefe E-Mail und Passwort (min. 8 Zeichen)." };
  }

  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { ok: false, message: "Registrierung fehlgeschlagen. Eventuell existiert die E-Mail bereits." };
  }

  return { ok: true, message: "Registrierung erfolgreich. Falls aktiv, bitte E-Mail bestaetigen." };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerActionSupabaseClient();
  await supabase.auth.signOut();
}
