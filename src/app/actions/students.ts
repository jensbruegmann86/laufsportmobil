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

type StudentInput = z.infer<typeof StudentInputSchema>;

type AddSingleStudentInput = z.input<typeof AddSingleStudentSchema>;

type AddStudentsBulkInput = z.input<typeof AddStudentsBulkSchema>;

type StudentInsertPayload = TableInsert<"students">;

type StudentWriteResult = ActionResult<{
  createdCount: number;
  runId: string;
  students: Pick<
    StudentInsertPayload,
    "first_name" | "last_name" | "class_name" | "slug" | "qr_code"
  >[];
}>;

type RunAccessContext =
  | {
      mode: "session";
      runId: string;
      teacherId: string;
    }
  | {
      mode: "token";
      runId: string;
      teacherId: string;
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
        .eq("created_by", user.id)
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

      return { ok: true, data: { mode: "session", runId, teacherId: user.id } };
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

      return { ok: true, data: { mode: "session", runId, teacherId: run.created_by } };
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
    .eq("created_by", tokenPayload.teacherId)
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
    data: { mode: "token", runId, teacherId: tokenPayload.teacherId },
  };
}

async function insertStudents(runId: string, students: StudentInput[]): Promise<StudentWriteResult> {
  const adminSupabase = getSupabaseAdminClient();
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
