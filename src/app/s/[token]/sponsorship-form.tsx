"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { createSponsorPledgeAction } from "@/app/s/[token]/actions";
import {
  SponsorPledgeFormSchema,
  type SponsorPledgeFormInput,
} from "@/lib/validation/sponsor-pledge";

type SponsorshipFormProps = {
  token: string;
};

export function SponsorshipForm({ token }: SponsorshipFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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

  const onSubmit = (values: SponsorPledgeFormInput) => {
    setServerMessage(null);
    setServerError(null);

    startTransition(async () => {
      const result = await createSponsorPledgeAction({
        token,
        ...values,
      });

      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }

      setServerMessage(result.message);
      reset({
        sponsorName: "",
        sponsorEmail: "",
        pledgeType: values.pledgeType,
        amountEuro: values.amountEuro,
      });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="sponsorName" className="text-sm font-medium text-zinc-800">
          Sponsor Name
        </label>
        <input
          id="sponsorName"
          type="text"
          autoComplete="name"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
          placeholder="z. B. Mama Mueller"
          {...register("sponsorName")}
        />
        {errors.sponsorName?.message ? (
          <p className="text-sm text-rose-600">{errors.sponsorName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="sponsorEmail" className="text-sm font-medium text-zinc-800">
          Sponsor E-Mail
        </label>
        <input
          id="sponsorEmail"
          type="email"
          autoComplete="email"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
          placeholder="name@beispiel.de"
          {...register("sponsorEmail")}
        />
        {errors.sponsorEmail?.message ? (
          <p className="text-sm text-rose-600">{errors.sponsorEmail.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-800">Sponsoring-Typ</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 px-3 py-3 text-sm text-zinc-900">
            <input
              type="radio"
              value="fixed_amount"
              className="h-4 w-4 accent-zinc-900"
              {...register("pledgeType")}
            />
            Festbetrag
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 px-3 py-3 text-sm text-zinc-900">
            <input
              type="radio"
              value="per_lap"
              className="h-4 w-4 accent-zinc-900"
              {...register("pledgeType")}
            />
            Pro Runde
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="amountEuro" className="text-sm font-medium text-zinc-800">
          {pledgeType === "per_lap" ? "Betrag pro Runde (EUR)" : "Festbetrag (EUR)"}
        </label>
        <input
          id="amountEuro"
          type="number"
          min={0.01}
          step={0.01}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
          {...register("amountEuro", { valueAsNumber: true })}
        />
        {errors.amountEuro?.message ? (
          <p className="text-sm text-rose-600">{errors.amountEuro.message}</p>
        ) : null}
      </div>

      {serverError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{serverError}</p> : null}
      {serverMessage ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{serverMessage}</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Wird gespeichert ..." : "Sponsoring speichern"}
      </button>
    </form>
  );
}
