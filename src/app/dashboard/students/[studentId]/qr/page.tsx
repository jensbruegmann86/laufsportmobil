import { notFound } from "next/navigation";
import { z } from "zod";

import { StudentQrCard } from "@/components/dashboard/student-qr-card";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_name, token, run_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    console.error("Failed to load student for QR page", studentError);
    notFound();
  }

  if (!student) {
    notFound();
  }

  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, title, date")
    .eq("id", student.run_id)
    .maybeSingle();

  if (runError) {
    console.error("Failed to load run for QR page", runError);
    notFound();
  }

  if (!run) {
    notFound();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/s/${student.token}`;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6 lg:px-8">
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
