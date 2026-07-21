"use client";

import { useState, useTransition } from "react";

import { addStudentToRunAction, addStudentsToRunAction } from "@/app/actions/students";
import { createTeacherAccessLinkAction } from "@/app/actions/runs";

type Props = {
  runId: string;
  runTitle: string;
  initialAccessToken?: string;
  showTeacherLink?: boolean;
  showSingleForm?: boolean;
  showPdfSection?: boolean;
  showBulkSection?: boolean;
};

type ParsedStudent = {
  className: string;
  firstName: string;
  lastName: string;
};

function parseCsvStudents(rawText: string): { students: ParsedStudent[]; errors: string[] } {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { students: [], errors: ["CSV ist leer."] };
  }

  const headerCandidate = lines[0].toLowerCase();
  const delimiter = headerCandidate.includes(";") ? ";" : ",";

  const hasHeader =
    headerCandidate.includes("klasse") ||
    headerCandidate.includes("class") ||
    headerCandidate.includes("vorname") ||
    headerCandidate.includes("first") ||
    headerCandidate.includes("nachname") ||
    headerCandidate.includes("last");

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const students: ParsedStudent[] = [];
  const errors: string[] = [];

  dataLines.forEach((line, index) => {
    const parts = line.split(delimiter).map((part) => part.trim());
    const [className = "", firstName = "", lastName = ""] = parts;

    if (!className || !firstName || !lastName) {
      errors.push(`Zeile ${hasHeader ? index + 2 : index + 1}: Bitte Klasse, Vorname und Nachname angeben.`);
      return;
    }

    students.push({ className, firstName, lastName });
  });

  return { students, errors };
}

async function decodeCsvFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const decode = (encoding: string) => {
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {
      return "";
    }
  };

  let text = decode("utf-8");

  if (text.includes("\uFFFD")) {
    const windows1252 = decode("windows-1252");
    text = windows1252 && !windows1252.includes("\uFFFD") ? windows1252 : decode("iso-8859-1");
  }

  return text.replace(/^\uFEFF/, "");
}

function downloadCsvTemplate() {
  const csvContent = "Klasse;Vorname;Nachname\n5a;Anna;Mueller\n5a;Ben;Schmidt\n";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "schueler-import-vorlage.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadCsvErrorReport(errors: string[]) {
  const content = ["Fehler"].concat(errors).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "schueler-import-fehler.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudentsManagement({
  runId,
  runTitle,
  initialAccessToken,
  showTeacherLink = true,
  showSingleForm = true,
  showPdfSection = true,
  showBulkSection = true,
}: Props) {
  const [isPendingSingle, startSingle] = useTransition();
  const [isPendingBulk, startBulk] = useTransition();
  const [isPendingLink, startLink] = useTransition();
  const [isPendingCsv, startCsv] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const qrPdfUrl = initialAccessToken
    ? `/api/runs/${runId}/qr-pdf?access=${encodeURIComponent(initialAccessToken)}`
    : `/api/runs/${runId}/qr-pdf`;
  const qrPdfByClassUrl = `${qrPdfUrl}${qrPdfUrl.includes("?") ? "&" : "?"}groupByClass=true`;

  return (
    <div className="space-y-6">
      {showTeacherLink ? (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Lehrerzugang per Link</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Erzeugt einen sicheren Link fuer Lehrkraefte ohne Login. Lauf: {runTitle}
        </p>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            const formData = new FormData(event.currentTarget);
            const expiresInHours = Number(formData.get("expiresInHours") ?? "24");

            startLink(async () => {
              try {
                const result = await createTeacherAccessLinkAction({ runId, expiresInHours });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setAccessUrl(result.data.accessUrl);
                setMessage(`Lehrer-Link erstellt (gueltig fuer ${result.data.expiresInHours}h).`);
              } catch {
                setError("Lehrer-Link konnte nicht erstellt werden.");
              }
            });
          }}
        >
          <div>
            <label htmlFor="expiresInHours" className="text-sm font-medium text-zinc-700">Gueltigkeit (Stunden)</label>
            <input
              id="expiresInHours"
              name="expiresInHours"
              type="number"
              min={1}
              max={168}
              defaultValue={24}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPendingLink}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingLink ? "Erzeuge ..." : "Lehrer-Link erstellen"}
          </button>
        </form>

        {accessUrl ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zugangslink</p>
            <p className="mt-1 break-all text-sm text-zinc-800">{accessUrl}</p>
          </div>
        ) : null}
      </section>
      ) : null}

      {showSingleForm ? (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Einzelnen Schueler eintragen</h2>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);
            const formElement = event.currentTarget;

            const formData = new FormData(formElement);
            const className = String(formData.get("className") ?? "");
            const firstName = String(formData.get("firstName") ?? "");
            const lastName = String(formData.get("lastName") ?? "");
            const accessToken = String(formData.get("accessToken") ?? initialAccessToken ?? "") || undefined;

            startSingle(async () => {
              try {
                const result = await addStudentToRunAction({
                  runId,
                  accessToken,
                  student: { className, firstName, lastName },
                });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setMessage(`Schueler gespeichert (${result.data.createdCount}).`);
                formElement.reset();
              } catch {
                setError("Schueler konnte nicht gespeichert werden.");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="className" placeholder="Klasse" required className="rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500" />
            <input name="firstName" placeholder="Vorname" required className="rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500" />
            <input name="lastName" placeholder="Nachname" required className="rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500" />
          </div>
          <input
            name="accessToken"
            placeholder="Optional: Lehrer-Link Token"
            defaultValue={initialAccessToken ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={isPendingSingle}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingSingle ? "Speichert ..." : "Schueler speichern"}
          </button>
        </form>
      </section>
      ) : null}

      {showPdfSection ? (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Laufzettel als PDF</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Druckansicht mit QR-Codes, 5 Schueler pro A4 zum Ausschneiden.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={qrPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              QR-PDF Standard
            </a>
            <a
              href={qrPdfByClassUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              QR-PDF nach Klassen
            </a>
          </div>
        </div>
      </section>
      ) : null}

      {showBulkSection ? (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Bulk-Eingabe</h2>
        <p className="mt-1 text-sm text-zinc-600">Format je Zeile: Klasse;Vorname;Nachname</p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            const formData = new FormData(event.currentTarget);
            const raw = String(formData.get("bulkInput") ?? "");
            const accessToken = String(formData.get("accessToken") ?? initialAccessToken ?? "") || undefined;

            const students = raw
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [className = "", firstName = "", lastName = ""] = line.split(";").map((part) => part.trim());
                return { className, firstName, lastName };
              });

            startBulk(async () => {
              try {
                const result = await addStudentsToRunAction({ runId, accessToken, students });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setMessage(`Bulk gespeichert (${result.data.createdCount} Schueler).`);
              } catch {
                setError("Bulk-Import konnte nicht gespeichert werden.");
              }
            });
          }}
        >
          <textarea
            name="bulkInput"
            rows={8}
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
            placeholder="5a;Anna;Mueller\n5a;Ben;Schmidt"
          />
          <input
            name="accessToken"
            placeholder="Optional: Lehrer-Link Token"
            defaultValue={initialAccessToken ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={isPendingBulk}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingBulk ? "Speichert ..." : "Bulk speichern"}
          </button>
        </form>
      </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">CSV-Import</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Importiert Schueler aus CSV (Klasse;Vorname;Nachname oder Klasse,Vorname,Nachname).
            </p>
          </div>

          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            CSV-Vorlage herunterladen
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);
            setCsvErrors([]);

            const formData = new FormData(event.currentTarget);
            const file = formData.get("csvFile");
            const accessToken = String(formData.get("accessToken") ?? initialAccessToken ?? "") || undefined;

            if (!(file instanceof File)) {
              setError("Bitte eine CSV-Datei auswaehlen.");
              return;
            }

            startCsv(async () => {
              try {
                const content = await decodeCsvFile(file);
                const parsed = parseCsvStudents(content);

                if (parsed.errors.length > 0) {
                  setCsvErrors(parsed.errors);
                  setError(`CSV enthaelt ${parsed.errors.length} Fehler.`);
                  return;
                }

                if (parsed.students.length === 0) {
                  setError("CSV enthaelt keine gueltigen Schueler.");
                  return;
                }

                const result = await addStudentsToRunAction({
                  runId,
                  accessToken,
                  students: parsed.students,
                });

                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }

                setMessage(`CSV importiert (${result.data.createdCount} Schueler).`);
              } catch {
                setError("CSV konnte nicht verarbeitet werden.");
              }
            });
          }}
        >
          <input
            name="csvFile"
            type="file"
            accept=".csv,text/csv"
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          <input
            name="accessToken"
            placeholder="Optional: Lehrer-Link Token"
            defaultValue={initialAccessToken ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />

          <button
            type="submit"
            disabled={isPendingCsv}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {isPendingCsv ? "Import laeuft ..." : "CSV importieren"}
          </button>
        </form>

        {csvErrors.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-amber-900">CSV-Fehler</p>
              <button
                type="button"
                onClick={() => downloadCsvErrorReport(csvErrors)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Fehlerbericht herunterladen
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {csvErrors.slice(0, 8).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {csvErrors.length > 8 ? (
              <p className="mt-2 text-xs text-amber-700">Weitere Fehler: {csvErrors.length - 8}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
