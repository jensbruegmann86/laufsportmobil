import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { StudentQrCard } from "@/components/dashboard/student-qr-card";
import { ensureProvisionedProfileForUser } from "@/lib/auth/provision-invited-teacher";
import { hasRunAccess } from "@/lib/runs/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type PageParams = {
  studentId: string;
};

const StudentIdSchema = z.uuid();

export default async function StudentQrPage({ params }: { params: Promise<PageParams> }) {
  const { studentId } = await params;

  if (!StudentIdSchema.safeParse(studentId).success) {
    notFound();
  }

  const supabase = await createServerComponentSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await ensureProvisionedProfileForUser({ userId: user.id, email: user.email });

  if (!profile) {
    redirect("/onboarding");
  }

  const { data: student, error: studentError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, class_name, token, run_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    console.error("Failed to load student for QR page", studentError);
    notFound();
  }

  if (!student) {
    redirect("/dashboard/students");
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, title, date, created_by, school_id, teacher_id")
    .eq("id", student.run_id)
    .maybeSingle();

  if (runError) {
    console.error("Failed to load run for QR page", runError);
    notFound();
  }

  if (!run) {
    redirect("/dashboard/students");
  }

  const canAccessRun = hasRunAccess({ profile, run, userId: user.id });

  if (!canAccessRun) {
    redirect("/dashboard/students");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/s/${student.token}`;

  return (
    <main className="min-h-screen bg-zinc-100 p-[calc(var(--spacing)*1)]">
      <div className="mx-auto w-full max-w-xl">
        <StudentQrCard
          studentName={`${student.first_name} ${student.last_name}`}
          studentClassName={student.class_name}
          runTitle={`${run.title} (${new Intl.DateTimeFormat("de-DE").format(new Date(run.date))})`}
          shareUrl={shareUrl}
        />
      </div>
    </main>
  );
}
