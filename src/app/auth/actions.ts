"use server";

import { z } from "zod";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerActionSupabaseClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type AuthResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

const BootstrapAdminSchema = z.object({
  schoolName: z.string().trim().min(2).max(120),
});

type BootstrapAdminResult =
  | { ok: true; message: string }
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });
  }

  return { ok: true };
}

export async function registerAction(input: { email: string; password: string }): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Bitte pruefe E-Mail und Passwort (min. 8 Zeichen)." };
  }

  const supabase = await createServerActionSupabaseClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${appUrl}/auth/login?confirmed=1`,
    },
  });

  if (error) {
    return { ok: false, message: "Registrierung fehlgeschlagen. Eventuell existiert die E-Mail bereits." };
  }

  return { ok: true, message: "Registrierung erfolgreich. Falls aktiv, bitte E-Mail bestaetigen." };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerActionSupabaseClient();
  await supabase.auth.signOut();
}

export async function bootstrapAdminAction(input: {
  schoolName: string;
}): Promise<BootstrapAdminResult> {
  const parsed = BootstrapAdminSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Bitte einen gueltigen Schulnamen eingeben." };
  }

  const supabase = await createServerActionSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Bitte zuerst anmelden." };
  }

  const adminSupabase = getSupabaseAdminClient();

  const { count: schoolCount, error: schoolCountError } = await adminSupabase
    .from("schools")
    .select("id", { count: "exact", head: true });

  if (schoolCountError) {
    return { ok: false, message: "Systemstatus konnte nicht geladen werden." };
  }

  if ((schoolCount ?? 0) > 0) {
    return { ok: false, message: "Die Ersteinrichtung ist bereits abgeschlossen. Dieser Account braucht eine Einladung." };
  }

  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return { ok: false, message: "Profilpruefung fehlgeschlagen." };
  }

  if (existingProfile) {
    return { ok: true, message: "Profil ist bereits vorhanden." };
  }

  const { data: school, error: schoolError } = await adminSupabase
    .from("schools")
    .insert({ name: parsed.data.schoolName })
    .select("id")
    .single();

  if (schoolError || !school) {
    return { ok: false, message: "Schule konnte nicht erstellt werden." };
  }

  const { error: profileError } = await adminSupabase.from("profiles").insert({
    id: user.id,
    role: "admin",
    school_id: school.id,
  });

  if (profileError) {
    return { ok: false, message: "Admin-Profil konnte nicht erstellt werden." };
  }

  return { ok: true, message: "Onboarding abgeschlossen. Admin-Profil wurde erstellt." };
}
