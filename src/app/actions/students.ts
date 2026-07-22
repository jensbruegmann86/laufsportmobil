"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { verifyTeacherRunAccessToken } from "@/lib/security/teacher-run-access-token";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TableInsert } from "@/lib/supabase/database.types";
import { createServerActionSupabaseClient } from "@/lib/supabase/server";

type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        details?: Record<string, string[]>;
      };
    };

const StudentInputSchema = z.object({
  className: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
});

const AddSingleStudentSchema = z.object({
  runId: z.uuid(),
  student: StudentInputSchema,
  accessToken: z.string().min(16).optional(),
});

const AddStudentsBulkSchema = z.object({
  runId: z.uuid(),
  students: z.array(StudentInputSchema).min(1).max(500),
  accessToken: z.string().min(16).optional(),
});

const UpdateStudentSchema = z.object({
  studentId: z.uuid(),
  className: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
});

const DeleteStudentSchema = z.object({
  studentId: z.uuid(),
});

const AssignStudentStartNumberSchema = z.object({
  studentId: z.uuid(),
  startNumber: z.number().int().positive(),
});

const AutoAssignStartNumbersSchema = z.object({
  runId: z.uuid(),
});

type StudentInput = z.infer<typeof StudentInputSchema>;

type AddSingleStudentInput = z.input<typeof AddSingleStudentSchema>;

type AddStudentsBulkInput = z.input<typeof AddStudentsBulkSchema>;
type UpdateStudentInput = z.input<typeof UpdateStudentSchema>;
type DeleteStudentInput = z.input<typeof DeleteStudentSchema>;
type AssignStudentStartNumberInput = z.input<typeof AssignStudentStartNumberSchema>;
type AutoAssignStartNumbersInput = z.input<typeof AutoAssignStartNumbersSchema>;

type StudentInsertPayload = TableInsert<"students">;

type ExistingStudentRow = {
  class_name: string;
  first_name: string;
  last_name: string;
};

type StudentWriteResult = ActionResult<{
  createdCount: number;
  runId: string;
  students: Pick<
    StudentInsertPayload,
    "first_name" | "last_name" | "class_name" | "slug" | "qr_code"
  >[];
}>;

type StudentMutateResult = ActionResult<{
  studentId: string;
  runId: string;
}>;

type StartNumberMutationResult = ActionResult<{
  runId: string;
  updatedCount: number;
}>;

type RunAccessContext =
  | {
      mode: "session";
      runId: string;
    }
  | {
      mode: "token";
      runId: string;
    };

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildStudentInsertPayload(runId: string, student: StudentInput): StudentInsertPayload {
  const baseSlug = slugify(`${student.firstName}-${student.lastName}-${student.className}`);
  const randomSuffix = randomUUID().slice(0, 8);
  const slug = `${baseSlug || "student"}-${randomSuffix}`;

  return {
    run_id: runId,
    class_name: student.className,
    first_name: student.firstName,
    last_name: student.lastName,
    slug,
    qr_code: `student:${slug}`,
  };
}

function normalizeStudentKey(student: {
  className: string;
  firstName: string;
  lastName: string;
}): string {
  return `${student.className.trim().toLowerCase()}|${student.firstName.trim().toLowerCase()}|${student.lastName
    .trim()
    .toLowerCase()}`;
}

async function resolveRunAccessContext(runId: string, accessToken?: string): Promise<ActionResult<RunAccessContext>> {
  const supabase = await createServerActionSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load profile for authorization.",
        },
      };
    }

    if (!profile) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Profile not found for current user.",
        },
      };
    }

    if (profile.role === "teacher") {
      const { data: run, error: runError } = await adminSupabase
        .from("runs")
        .select("id")
        .eq("id", runId)
        .eq("teacher_id", user.id)
        .maybeSingle();

      if (runError) {
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Could not verify run ownership.",
          },
        };
      }

      if (!run) {
        return {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Teacher is not assigned to this run.",
          },
        };
      }

      return { ok: true, data: { mode: "session", runId } };
    }

    if (profile.role === "admin") {
      const { data: run, error: runError } = await adminSupabase
        .from("runs")
        .select("id, created_by")
        .eq("id", runId)
        .eq("school_id", profile.school_id)
        .maybeSingle();

      if (runError) {
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Could not verify run school access.",
          },
        };
      }

      if (!run) {
        return {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Run does not belong to your school.",
          },
        };
      }

      return { ok: true, data: { mode: "session", runId } };
    }
  }

  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Teacher login or secure access token is required.",
      },
    };
  }

  let tokenPayload: ReturnType<typeof verifyTeacherRunAccessToken>;
  try {
    tokenPayload = verifyTeacherRunAccessToken(accessToken);
  } catch {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Secure access token is invalid or expired.",
      },
    };
  }

  if (tokenPayload.runId !== runId) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Token does not match requested run.",
      },
    };
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id")
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Could not validate token against run assignment.",
      },
    };
  }

  if (!run) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Token is no longer valid for this run.",
      },
    };
  }

  return {
    ok: true,
    data: { mode: "token", runId },
  };
}

async function resolveStudentAccess(studentId: string): Promise<ActionResult<{ runId: string }>> {
  const supabase = await createServerActionSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Bitte zuerst anmelden.",
      },
    };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Profil konnte nicht geladen werden.",
      },
    };
  }

  const { data: student, error: studentError } = await adminSupabase
    .from("students")
    .select("id, run_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Schueler nicht gefunden.",
      },
    };
  }

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, school_id, teacher_id")
    .eq("id", student.run_id)
    .maybeSingle();

  if (runError || !run) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Event zum Schueler nicht gefunden.",
      },
    };
  }

  const allowed =
    (profile.role === "admin" && run.school_id === profile.school_id) ||
    (profile.role === "teacher" && run.teacher_id === user.id);

  if (!allowed) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Keine Berechtigung fuer diesen Schueler.",
      },
    };
  }

  return {
    ok: true,
    data: { runId: student.run_id },
  };
}

async function ensureStartNumberAvailable(input: {
  runId: string;
  startNumber: number;
  ignoreStudentId?: string;
}): Promise<ActionResult<null>> {
  const adminSupabase = getSupabaseAdminClient();
  const { runId, startNumber, ignoreStudentId } = input;

  let query = adminSupabase
    .from("students")
    .select("id")
    .eq("run_id", runId)
    .eq("start_number", startNumber)
    .limit(1);

  if (ignoreStudentId) {
    query = query.neq("id", ignoreStudentId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Startnummern konnten nicht geprueft werden.",
      },
    };
  }

  if (data) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: `Startnummer ${startNumber} ist in diesem Event bereits vergeben.`,
      },
    };
  }

  return { ok: true, data: null };
}

async function insertStudents(runId: string, students: StudentInput[]): Promise<StudentWriteResult> {
  const adminSupabase = getSupabaseAdminClient();

  // Guard against duplicates in the incoming payload.
  const inputKeySet = new Set<string>();
  for (const student of students) {
    const key = normalizeStudentKey(student);
    if (inputKeySet.has(key)) {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message:
            "Doppelte Schueler in der Eingabe erkannt (gleiche Klasse, Vorname, Nachname). Bitte CSV/Bulk-Eingabe pruefen.",
        },
      };
    }

    inputKeySet.add(key);
  }

  // Guard against duplicates that already exist in this run.
  const { data: existingStudents, error: existingStudentsError } = await adminSupabase
    .from("students")
    .select("class_name, first_name, last_name")
    .eq("run_id", runId);

  if (existingStudentsError) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Vorhandene Schueler konnten nicht geprueft werden.",
      },
    };
  }

  const existingKeySet = new Set(
    ((existingStudents ?? []) as ExistingStudentRow[]).map((student) =>
      normalizeStudentKey({
        className: student.class_name,
        firstName: student.first_name,
        lastName: student.last_name,
      }),
    ),
  );

  for (const student of students) {
    const key = normalizeStudentKey(student);
    if (existingKeySet.has(key)) {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message:
            "Ein oder mehrere Schueler existieren bereits in diesem Event (gleiche Klasse, Vorname, Nachname).",
        },
      };
    }
  }

  const payload = students.map((student) => buildStudentInsertPayload(runId, student));

  const { data, error } = await adminSupabase
    .from("students")
    .insert(payload)
    .select("class_name, first_name, last_name, slug, qr_code");

  if (error) {
    const code = error.code === "23505" ? "CONFLICT" : "INTERNAL_ERROR";

    return {
      ok: false,
      error: {
        code,
        message:
          code === "CONFLICT"
            ? "A student identifier already exists. Please retry."
            : "Failed to save students.",
      },
    };
  }

  return {
    ok: true,
    data: {
      createdCount: data.length,
      runId,
      students: data,
    },
  };
}

export async function addStudentToRunAction(input: AddSingleStudentInput): Promise<StudentWriteResult> {
  const parsed = AddSingleStudentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Student input is invalid.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const access = await resolveRunAccessContext(parsed.data.runId, parsed.data.accessToken);
  if (!access.ok) {
    return access;
  }

  return insertStudents(parsed.data.runId, [parsed.data.student]);
}

export async function addStudentsToRunAction(input: AddStudentsBulkInput): Promise<StudentWriteResult> {
  const parsed = AddStudentsBulkSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Bulk student payload is invalid.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const access = await resolveRunAccessContext(parsed.data.runId, parsed.data.accessToken);
  if (!access.ok) {
    return access;
  }

  return insertStudents(parsed.data.runId, parsed.data.students);
}

export async function updateStudentAction(input: UpdateStudentInput): Promise<StudentMutateResult> {
  const parsed = UpdateStudentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Schuelerdaten.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const access = await resolveStudentAccess(parsed.data.studentId);
  if (!access.ok) {
    return access;
  }

  const adminSupabase = getSupabaseAdminClient();

  const { error } = await adminSupabase
    .from("students")
    .update({
      class_name: parsed.data.className,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
    })
    .eq("id", parsed.data.studentId);

  if (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Schueler konnte nicht aktualisiert werden.",
      },
    };
  }

  return {
    ok: true,
    data: {
      studentId: parsed.data.studentId,
      runId: access.data.runId,
    },
  };
}

export async function deleteStudentAction(input: DeleteStudentInput): Promise<StudentMutateResult> {
  const parsed = DeleteStudentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Loeschanfrage.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const access = await resolveStudentAccess(parsed.data.studentId);
  if (!access.ok) {
    return access;
  }

  const adminSupabase = getSupabaseAdminClient();
  const { error } = await adminSupabase.from("students").delete().eq("id", parsed.data.studentId);

  if (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Schueler konnte nicht geloescht werden.",
      },
    };
  }

  return {
    ok: true,
    data: {
      studentId: parsed.data.studentId,
      runId: access.data.runId,
    },
  };
}

export async function assignStudentStartNumberAction(
  input: AssignStudentStartNumberInput,
): Promise<StartNumberMutationResult> {
  const parsed = AssignStudentStartNumberSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Startnummer.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const access = await resolveStudentAccess(parsed.data.studentId);
  if (!access.ok) {
    return access;
  }

  const runId = access.data.runId;
  const availability = await ensureStartNumberAvailable({
    runId,
    startNumber: parsed.data.startNumber,
    ignoreStudentId: parsed.data.studentId,
  });

  if (!availability.ok) {
    return availability;
  }

  const adminSupabase = getSupabaseAdminClient();
  const { error } = await adminSupabase
    .from("students")
    .update({ start_number: parsed.data.startNumber })
    .eq("id", parsed.data.studentId);

  if (error) {
    return {
      ok: false,
      error: {
        code: error.code === "23505" ? "CONFLICT" : "INTERNAL_ERROR",
        message:
          error.code === "23505"
            ? `Startnummer ${parsed.data.startNumber} ist in diesem Event bereits vergeben.`
            : "Startnummer konnte nicht gespeichert werden.",
      },
    };
  }

  return {
    ok: true,
    data: {
      runId,
      updatedCount: 1,
    },
  };
}

export async function autoAssignStudentStartNumbersAction(
  input: AutoAssignStartNumbersInput,
): Promise<StartNumberMutationResult> {
  const parsed = AutoAssignStartNumbersSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ungueltige Event-Auswahl fuer Startnummern.",
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const access = await resolveRunAccessContext(parsed.data.runId);
  if (!access.ok) {
    return access;
  }

  const adminSupabase = getSupabaseAdminClient();
  const { data: students, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, class_name, last_name, first_name, start_number")
    .eq("run_id", parsed.data.runId)
    .order("class_name", { ascending: true })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (studentsError) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Teilnehmer konnten nicht geladen werden.",
      },
    };
  }

  const existingNumbers = new Set(
    (students ?? []).map((student) => student.start_number).filter((value): value is number => value != null),
  );
  const unassigned = (students ?? []).filter((student) => student.start_number == null);

  if (unassigned.length === 0) {
    return {
      ok: true,
      data: {
        runId: parsed.data.runId,
        updatedCount: 0,
      },
    };
  }

  let nextNumber = existingNumbers.size > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const updates = unassigned.map((student) => {
    while (existingNumbers.has(nextNumber)) {
      nextNumber += 1;
    }

    const assignedNumber = nextNumber;
    existingNumbers.add(assignedNumber);
    nextNumber += 1;

    return {
      id: student.id,
      start_number: assignedNumber,
    };
  });

  for (const update of updates) {
    const { error } = await adminSupabase
      .from("students")
      .update({ start_number: update.start_number })
      .eq("id", update.id);

    if (error) {
      return {
        ok: false,
        error: {
          code: error.code === "23505" ? "CONFLICT" : "INTERNAL_ERROR",
          message:
            error.code === "23505"
              ? "Eine Startnummer wurde parallel bereits vergeben. Bitte erneut versuchen."
              : "Startnummern konnten nicht automatisch gespeichert werden.",
        },
      };
    }
  }

  return {
    ok: true,
    data: {
      runId: parsed.data.runId,
      updatedCount: updates.length,
    },
  };
}
