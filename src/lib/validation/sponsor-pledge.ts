import { z } from "zod";

export const SponsorPledgeFormSchema = z.object({
  sponsorFirstName: z.string().trim().min(2, "Bitte einen Vornamen mit mindestens 2 Zeichen eingeben."),
  sponsorLastName: z.string().trim().min(2, "Bitte einen Nachnamen mit mindestens 2 Zeichen eingeben."),
  sponsorEmail: z.email("Bitte eine gueltige E-Mail-Adresse eingeben.").trim(),
  pledgeType: z.enum(["fixed_amount", "per_lap"]),
  amountEuro: z
    .number({ error: "Bitte einen gueltigen Betrag eingeben." })
    .positive("Der Betrag muss groesser als 0 sein.")
    .max(100000, "Der Betrag ist zu hoch.")
    .refine((value) => Number.isFinite(value), "Bitte einen gueltigen Betrag eingeben."),
});

export type SponsorPledgeFormInput = z.infer<typeof SponsorPledgeFormSchema>;
