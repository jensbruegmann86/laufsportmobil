"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";

import { createSponsorPledgeAction } from "@/app/s/[token]/actions";
import { useToast } from "@/components/ui/toast-provider";
import {
  SponsorPledgeFormSchema,
  type SponsorPledgeFormInput,
} from "@/lib/validation/sponsor-pledge";

type SponsorshipFormProps = {
  token: string;
};

export function SponsorshipForm({ token }: SponsorshipFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const router = useRouter();
  const { pushToast } = useToast();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SponsorPledgeFormInput>({
    resolver: zodResolver(SponsorPledgeFormSchema),
    defaultValues: {
      sponsorName: "",
      sponsorEmail: "",
      pledgeType: "fixed_amount",
      amountEuro: 10,
    },
  });

  const pledgeType = useWatch({ control, name: "pledgeType" });
  const amountPlaceholder = pledgeType === "per_lap" ? "z. B. 2,00 pro Runde" : "z. B. 25,00 einmalig";

  const onSubmit = (values: SponsorPledgeFormInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await createSponsorPledgeAction({
        token,
        ...values,
      });

      if (!result.ok) {
        setServerError(result.error.message);
        pushToast({ tone: "error", title: "Sponsoring nicht gespeichert", message: result.error.message });
        return;
      }

      router.replace(`/s/${token}?submitted=1`);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
        <input
          id="sponsorName"
          type="text"
          autoComplete="name"
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:bg-white"
          placeholder="Dein Name"
          {...register("sponsorName")}
        />
        {errors.sponsorName?.message ? (
          <p className="text-sm text-rose-600">{errors.sponsorName.message}</p>
        ) : null}
        </div>

        <div className="space-y-2">
        <input
          id="sponsorEmail"
          type="email"
          autoComplete="email"
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:bg-white"
          placeholder="E-Mail fuer die Bestaetigung"
          {...register("sponsorEmail")}
        />
        {errors.sponsorEmail?.message ? (
          <p className="text-sm text-rose-600">{errors.sponsorEmail.message}</p>
        ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">1. Sponsoring waehlen</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={`group block cursor-pointer rounded-2xl border p-4 transition ${pledgeType === "fixed_amount" ? "border-zinc-900 bg-zinc-900 text-white shadow-lg shadow-zinc-900/10" : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50"}`}>
            <input
              type="radio"
              value="fixed_amount"
              className="sr-only"
              {...register("pledgeType")}
            />
            <p className={`text-sm font-semibold ${pledgeType === "fixed_amount" ? "text-white" : "text-zinc-900"}`}>Festbetrag</p>
            <p className={`mt-1 text-sm ${pledgeType === "fixed_amount" ? "text-zinc-300" : "text-zinc-600"}`}>Einmaliger Betrag, unabhaengig von den gelaufenen Runden.</p>
          </label>
          <label className={`group block cursor-pointer rounded-2xl border p-4 transition ${pledgeType === "per_lap" ? "border-emerald-700 bg-emerald-700 text-white shadow-lg shadow-emerald-700/10" : "border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"}`}>
            <input
              type="radio"
              value="per_lap"
              className="sr-only"
              {...register("pledgeType")}
            />
            <p className={`text-sm font-semibold ${pledgeType === "per_lap" ? "text-white" : "text-zinc-900"}`}>Pro Runde</p>
            <p className={`mt-1 text-sm ${pledgeType === "per_lap" ? "text-emerald-100" : "text-zinc-600"}`}>Der finale Betrag ergibt sich automatisch aus den gelaufenen Runden.</p>
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">2. Betrag eingeben</p>
        <input
          id="amountEuro"
          type="number"
          min={0.01}
          step={0.01}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
          placeholder={amountPlaceholder}
          {...register("amountEuro", { valueAsNumber: true })}
        />
        <p className="text-xs text-zinc-500">
          {pledgeType === "per_lap" ? "Der Endbetrag wird nach dem Lauf automatisch berechnet." : "Der Betrag wird direkt als feste Zusage gespeichert."}
        </p>
        {errors.amountEuro?.message ? (
          <p className="text-sm text-rose-600">{errors.amountEuro.message}</p>
        ) : null}
      </div>

      {serverError ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{serverError}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Wird gespeichert ..." : "Sponsoring speichern"}
      </button>
    </form>
  );
}
