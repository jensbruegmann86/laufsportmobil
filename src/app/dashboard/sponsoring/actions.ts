"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerActionSupabaseClient } from "@/lib/supabase/server";

const ConfirmCashPaymentSchema = z.object({
  pledgeId: z.uuid(),
});

type PledgeRow = {
  id: string;
  status: "pending" | "notified" | "paid";
  payment_method_choice: "cash" | "stripe" | null;
  student_id: string;
};

type StudentRow = {
  id: string;
  run_id: string;
};

type RunRow = {
  id: string;
  school_id: string;
  created_by: string;
  teacher_id: string | null;
};

export async function confirmCashPaymentReceivedAction(formData: FormData): Promise<void> {
  const rawPledgeId = formData.get("pledgeId");

  const parsed = ConfirmCashPaymentSchema.safeParse({
    pledgeId: typeof rawPledgeId === "string" ? rawPledgeId : "",
  });

  if (!parsed.success) {
    return;
  }

  const supabase = await createServerActionSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return;
  }

  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });
  if (!profile) return;

  const { data: pledge, error: pledgeError } = await adminSupabase
    .from("pledges")
    .select("id, status, payment_method_choice, student_id")
    .eq("id", parsed.data.pledgeId)
    .maybeSingle();

  if (pledgeError || !pledge) {
    return;
  }

  const typedPledge = pledge as PledgeRow;

  if (typedPledge.payment_method_choice !== "cash") {
    return;
  }

  const { data: student, error: studentError } = await adminSupabase
    .from("students")
    .select("id, run_id")
    .eq("id", typedPledge.student_id)
    .maybeSingle();

  if (studentError || !student) {
    return;
  }

  const typedStudent = student as StudentRow;

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, school_id, created_by, teacher_id")
    .eq("id", typedStudent.run_id)
    .maybeSingle();

  if (runError || !run) {
    return;
  }

  const typedRun = run as RunRow;

  const hasAccess = hasRunAccess({ profile, run: typedRun, userId: user.id });

  if (!hasAccess) {
    return;
  }

  const nowIso = new Date().toISOString();

  const { error: pledgeUpdateError } = await adminSupabase
    .from("pledges")
    .update({ status: "paid", payment_method_choice: "cash" })
    .eq("id", typedPledge.id)
    .neq("status", "paid");

  if (pledgeUpdateError) {
    return;
  }

  const { error: paymentLinkUpdateError } = await adminSupabase
    .from("sponsor_payment_links")
    .update({ paid_at: nowIso })
    .eq("pledge_id", typedPledge.id)
    .is("paid_at", null);

  if (paymentLinkUpdateError) {
    return;
  }

  revalidatePath("/dashboard/sponsoring");
  revalidatePath("/dashboard/runs");
}
