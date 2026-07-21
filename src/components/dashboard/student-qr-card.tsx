"use client";

import { useId, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

type StudentQrCardProps = {
  studentName: string;
  studentClassName: string;
  runTitle: string;
  shareUrl: string;
};

export function StudentQrCard({ studentName, studentClassName, runTitle, shareUrl }: StudentQrCardProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const reactId = useId();
  const canvasId = useMemo(() => `student-qr-${reactId.replace(/[:]/g, "")}`, [reactId]);

  const handleDownload = () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;

    if (!canvas) {
      setFeedback("QR-Code konnte nicht heruntergeladen werden.");
      return;
    }

    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `${studentName.replace(/\s+/g, "-").toLowerCase()}-sponsoring-qr.png`;
    link.click();
    setFeedback("QR-Code wurde heruntergeladen.");
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Sponsoring-Link fuer ${studentName}`,
          text: `${studentName} (${studentClassName}) - ${runTitle}`,
          url: shareUrl,
        });
        setFeedback("Link geteilt.");
        return;
      } catch {
        // Fallback to clipboard below.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("Link in die Zwischenablage kopiert.");
    } catch {
      setFeedback("Link konnte nicht kopiert werden.");
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">QR-Link teilen</p>
      <h2 className="text-xl font-semibold text-zinc-900">{studentName}</h2>
      <p className="mt-1 text-sm text-zinc-600">{studentClassName}</p>
      <p className="mb-5 text-sm text-zinc-600">{runTitle}</p>

      <div className="flex justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <QRCodeCanvas id={canvasId} value={shareUrl} size={240} includeMargin level="M" />
      </div>

      <p className="mt-3 break-all text-xs text-zinc-500">{shareUrl}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          QR herunterladen
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
        >
          Link teilen
        </button>
      </div>

      {feedback ? <p className="mt-3 text-sm text-emerald-700">{feedback}</p> : null}
    </section>
  );
}
