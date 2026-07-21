import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyTeacherRunAccessToken } from "@/lib/security/teacher-run-access-token";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

const RunIdSchema = z.uuid();

function sortStudents<T extends { class_name: string; last_name: string; first_name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const classCompare = a.class_name.localeCompare(b.class_name, "de", { sensitivity: "base" });
    if (classCompare !== 0) {
      return classCompare;
    }

    const lastNameCompare = a.last_name.localeCompare(b.last_name, "de", { sensitivity: "base" });
    if (lastNameCompare !== 0) {
      return lastNameCompare;
    }

    return a.first_name.localeCompare(b.first_name, "de", { sensitivity: "base" });
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  if (!RunIdSchema.safeParse(runId).success) {
    return NextResponse.json({ error: "Ungueltiger Lauf." }, { status: 400 });
  }

  const url = new URL(request.url);
  const access = url.searchParams.get("access") ?? undefined;
  const groupByClass = url.searchParams.get("groupByClass") === "true";
  const classNameFilter = url.searchParams.get("className")?.trim() ?? "";

  const supabase = await createServerComponentSupabaseClient();
  const adminSupabase = getSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: run, error: runError } = await adminSupabase
    .from("runs")
    .select("id, title, school_id, created_by")
    .eq("id", runId)
    .maybeSingle();

  if (runError || !run) {
    return NextResponse.json({ error: "Lauf nicht gefunden." }, { status: 404 });
  }

  if (user) {
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 403 });
    }

    const hasAccess =
      (profile.role === "admin" && profile.school_id === run.school_id) ||
      (profile.role === "teacher" && run.created_by === user.id);

    if (!hasAccess) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }
  } else {
    if (!access) {
      return NextResponse.json({ error: "Token fehlt." }, { status: 401 });
    }

    let tokenPayload: ReturnType<typeof verifyTeacherRunAccessToken>;

    try {
      tokenPayload = verifyTeacherRunAccessToken(access);
    } catch {
      return NextResponse.json({ error: "Token ungueltig." }, { status: 403 });
    }

    if (tokenPayload.runId !== runId || tokenPayload.teacherId !== run.created_by) {
      return NextResponse.json({ error: "Token ungueltig fuer diesen Lauf." }, { status: 403 });
    }
  }

  const { data: studentsData, error: studentsError } = await adminSupabase
    .from("students")
    .select("id, first_name, last_name, class_name, token")
    .eq("run_id", runId)
    .order("class_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (studentsError) {
    return NextResponse.json({ error: "Schueler konnten nicht geladen werden." }, { status: 500 });
  }

  let students = sortStudents(studentsData ?? []);

  if (classNameFilter) {
    students = students.filter(
      (student) => student.class_name.toLowerCase() === classNameFilter.toLowerCase(),
    );
  }

  if (students.length === 0) {
    return NextResponse.json({ error: "Keine Schueler fuer diesen Lauf vorhanden." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 24;
  const gutter = 10;
  const cardsPerPage = 5;
  const cardWidth = pageWidth - margin * 2;

  const renderCards = async (sectionStudents: typeof students, sectionTitle?: string) => {
    let page = doc.addPage([pageWidth, pageHeight]);
    let localCardsPerPage = cardsPerPage;
    let sectionOffsetY = 0;

    if (sectionTitle) {
      page.drawText(sectionTitle, {
        x: margin,
        y: pageHeight - margin - 16,
        size: 16,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText(`Lauf: ${run.title}`, {
        x: margin,
        y: pageHeight - margin - 34,
        size: 10,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });

      sectionOffsetY = 44;
      localCardsPerPage = 4;
    }

    const localCardHeight =
      (pageHeight - margin * 2 - sectionOffsetY - gutter * (localCardsPerPage - 1)) / localCardsPerPage;

    for (let index = 0; index < sectionStudents.length; index += 1) {
      if (index > 0 && index % localCardsPerPage === 0) {
        page = doc.addPage([pageWidth, pageHeight]);

        if (sectionTitle) {
          page.drawText(sectionTitle, {
            x: margin,
            y: pageHeight - margin - 16,
            size: 16,
            font: fontBold,
            color: rgb(0.1, 0.1, 0.1),
          });

          page.drawText(`Lauf: ${run.title}`, {
            x: margin,
            y: pageHeight - margin - 34,
            size: 10,
            font,
            color: rgb(0.35, 0.35, 0.35),
          });
        }
      }

      const slotIndex = index % localCardsPerPage;
      const y =
        pageHeight -
        margin -
        sectionOffsetY -
        localCardHeight * (slotIndex + 1) -
        gutter * slotIndex;
      const x = margin;

      const student = sectionStudents[index];
      const sponsorUrl = `${appUrl}/s/${student.token}`;

      const qrPngDataUrl = await QRCode.toDataURL(sponsorUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
      });
      const qrPngBytes = Buffer.from(qrPngDataUrl.split(",")[1], "base64");
      const qrImage = await doc.embedPng(qrPngBytes);

      page.drawRectangle({
        x,
        y,
        width: cardWidth,
        height: localCardHeight,
        borderWidth: 1,
        borderColor: rgb(0.8, 0.8, 0.8),
      });

      const qrSize = Math.min(92, localCardHeight - 24);
      const qrX = x + 12;
      const qrY = y + (localCardHeight - qrSize) / 2;
      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      const textX = qrX + qrSize + 14;
      const titleY = y + localCardHeight - 22;

      page.drawText(`${student.first_name} ${student.last_name}`, {
        x: textX,
        y: titleY,
        size: 14,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText(`Klasse: ${student.class_name}`, {
        x: textX,
        y: titleY - 18,
        size: 11,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });

      page.drawText(`Lauf: ${run.title}`, {
        x: textX,
        y: titleY - 34,
        size: 11,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });

      page.drawText("Sponsoring-Link:", {
        x: textX,
        y: titleY - 52,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });

      const shortUrl = sponsorUrl.length > 65 ? `${sponsorUrl.slice(0, 62)}...` : sponsorUrl;
      page.drawText(shortUrl, {
        x: textX,
        y: titleY - 66,
        size: 9,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });

      page.drawLine({
        start: { x: x + 6, y },
        end: { x: x + cardWidth - 6, y },
        thickness: 0.8,
        color: rgb(0.87, 0.87, 0.87),
        dashArray: [3, 3],
      });
    }
  };

  if (groupByClass) {
    const classes = [...new Set(students.map((student) => student.class_name))];
    for (const className of classes) {
      const classStudents = students.filter((student) => student.class_name === className);
      await renderCards(classStudents, `Klasse ${className}`);
    }
  } else {
    await renderCards(students);
  }

  const bytes = await doc.save();
  const fileName = `laufzettel-${run.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
