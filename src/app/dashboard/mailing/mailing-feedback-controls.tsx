"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  INITIAL_MAILING_ACTION_STATE,
  resendMailingFormAction,
  sendPendingMailingsFormAction,
} from "@/app/dashboard/mailing/actions";

function SubmitButton({ idleLabel, pendingLabel, className }: { idleLabel: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function FeedbackBanner({ ok, message }: { ok: boolean; message: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
      }`}
    >
      {message}
    </p>
  );
}

export function SendAllMailingsForm({ runId }: { runId: string }) {
  const [state, formAction] = useActionState(sendPendingMailingsFormAction, INITIAL_MAILING_ACTION_STATE);

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="runId" value={runId} />
      <SubmitButton
        idleLabel="Alle offenen Mailings senden"
        pendingLabel="Mailings werden versendet..."
        className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-500"
      />
      <FeedbackBanner ok={state.ok} message={state.message} />
    </form>
  );
}

export function ResendMailingForm({ pledgeId }: { pledgeId: string }) {
  const [state, formAction] = useActionState(resendMailingFormAction, INITIAL_MAILING_ACTION_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="pledgeId" value={pledgeId} />
      <SubmitButton
        idleLabel="Erneut senden"
        pendingLabel="Sende..."
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <FeedbackBanner ok={state.ok} message={state.message} />
    </form>
  );
}
