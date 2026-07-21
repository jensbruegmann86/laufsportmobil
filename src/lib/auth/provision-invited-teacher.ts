import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type ProvisionedProfile = {
  id: string;
  role: "admin" | "teacher";
  school_id: string;
};

type TeacherInviteRow = {
  id: string;
  run_id: string;
  school_id: string;
  email: string;
  teacher_user_id: string | null;
  accepted_at: string | null;
};

export async function ensureProvisionedProfileForUser(input: {
  userId: string;
  email: string | null | undefined;
}): Promise<ProvisionedProfile | null> {
  const { userId, email } = input;
  const supabase = getSupabaseAdminClient();

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, role, school_id")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error("Profil konnte nicht geladen werden.");
  }

  if (existingProfile) {
    if (existingProfile.role === "teacher" && email) {
      await attachPendingTeacherInvites({ userId, email, schoolId: existingProfile.school_id });
    }

    return existingProfile as ProvisionedProfile;
  }

  if (!email) {
    return null;
  }

  const { data: invites, error: inviteError } = await supabase
    .from("teacher_invites")
    .select("id, run_id, school_id, email, teacher_user_id, accepted_at")
    .ilike("email", email)
    .is("teacher_user_id", null)
    .order("created_at", { ascending: true });

  if (inviteError) {
    throw new Error("Lehrer-Einladung konnte nicht geladen werden.");
  }

  const typedInvites = (invites ?? []) as TeacherInviteRow[];

  if (typedInvites.length === 0) {
    return null;
  }

  const schoolId = typedInvites[0].school_id;

  const { error: profileInsertError } = await supabase.from("profiles").insert({
    id: userId,
    role: "teacher",
    school_id: schoolId,
  });

  if (profileInsertError) {
    throw new Error("Lehrer-Profil konnte nicht erstellt werden.");
  }

  await attachPendingTeacherInvites({ userId, email, schoolId });

  return {
    id: userId,
    role: "teacher",
    school_id: schoolId,
  };
}

async function attachPendingTeacherInvites(input: {
  userId: string;
  email: string;
  schoolId: string;
}) {
  const { userId, email, schoolId } = input;
  const supabase = getSupabaseAdminClient();

  const { data: invites, error: inviteError } = await supabase
    .from("teacher_invites")
    .select("id, run_id")
    .ilike("email", email)
    .eq("school_id", schoolId)
    .is("teacher_user_id", null);

  if (inviteError) {
    throw new Error("Teacher-Invites konnten nicht aktualisiert werden.");
  }

  const runIds = (invites ?? []).map((invite) => invite.run_id);
  if (runIds.length === 0) {
    return;
  }

  const nowIso = new Date().toISOString();

  const { error: runsUpdateError } = await supabase
    .from("runs")
    .update({ teacher_id: userId })
    .in("id", runIds)
    .eq("school_id", schoolId);

  if (runsUpdateError) {
    throw new Error("Event-Lehrerzuordnung konnte nicht gespeichert werden.");
  }

  const { error: inviteUpdateError } = await supabase
    .from("teacher_invites")
    .update({ teacher_user_id: userId, accepted_at: nowIso })
    .in("id", (invites ?? []).map((invite) => invite.id));

  if (inviteUpdateError) {
    throw new Error("Teacher-Invite konnte nicht bestaetigt werden.");
  }
}
