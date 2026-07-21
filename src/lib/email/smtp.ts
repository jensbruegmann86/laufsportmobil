import nodemailer from "nodemailer";

type SponsorNotificationEmail = {
  sponsorName: string;
  sponsorEmail: string;
  studentName: string;
  lapsCompleted: number;
  totalAmountEuro: number;
  paymentLink: string;
};

type TeacherInvitationEmail = {
  teacherEmail: string;
  eventTitle: string;
  registerUrl: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from || Number.isNaN(port)) {
    throw new Error("Missing SMTP configuration. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM");
  }

  return {
    host,
    port,
    auth: { user, pass },
    secure: port === 465,
    from,
  };
}

function createTransporter() {
  const config = getSmtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
}

export async function sendSponsorNotificationEmail(input: SponsorNotificationEmail): Promise<void> {
  const config = getSmtpConfig();
  const transporter = createTransporter();

  const subject = `Sponsorenlauf: finale Spendensumme fuer ${input.studentName}`;
  const text = [
    `Hallo ${input.sponsorName},`,
    "",
    `vielen Dank fuer dein Sponsoring beim Schullauf von ${input.studentName}.`,
    `Gelaufene Runden: ${input.lapsCompleted}`,
    `Finale Spendensumme: ${input.totalAmountEuro.toFixed(2)} EUR`,
    "",
    "Bitte waehle jetzt deine Zahlungsart (Bar in der Schule oder Online via Stripe):",
    input.paymentLink,
    "",
    "Vielen Dank fuer deine Unterstuetzung!",
  ].join("\n");

  const html = `
    <p>Hallo ${input.sponsorName},</p>
    <p>vielen Dank fuer dein Sponsoring beim Schullauf von <strong>${input.studentName}</strong>.</p>
    <ul>
      <li>Gelaufene Runden: <strong>${input.lapsCompleted}</strong></li>
      <li>Finale Spendensumme: <strong>${input.totalAmountEuro.toFixed(2)} EUR</strong></li>
    </ul>
    <p>Bitte waehle jetzt deine Zahlungsart (Bar in der Schule oder Online via Stripe):</p>
    <p><a href="${input.paymentLink}">${input.paymentLink}</a></p>
    <p>Vielen Dank fuer deine Unterstuetzung.</p>
  `;

  await transporter.sendMail({
    from: config.from,
    to: input.sponsorEmail,
    subject,
    text,
    html,
  });
}

export async function sendTeacherInvitationEmail(input: TeacherInvitationEmail): Promise<void> {
  const config = getSmtpConfig();
  const transporter = createTransporter();

  const subject = `Einladung als Lehrkraft fuer ${input.eventTitle}`;
  const text = [
    "Hallo,",
    "",
    `du wurdest als Lehrkraft fuer das Event \"${input.eventTitle}\" eingeladen.`,
    "Bitte registriere dich mit dieser E-Mail-Adresse und logge dich danach ein:",
    input.registerUrl,
    "",
    "Nach erfolgreicher Registrierung ist das Event automatisch in deinem Dashboard sichtbar.",
  ].join("\n");

  const html = `
    <p>Hallo,</p>
    <p>du wurdest als Lehrkraft fuer das Event <strong>${input.eventTitle}</strong> eingeladen.</p>
    <p>Bitte registriere dich mit dieser E-Mail-Adresse und logge dich danach ein:</p>
    <p><a href="${input.registerUrl}">${input.registerUrl}</a></p>
    <p>Nach erfolgreicher Registrierung ist das Event automatisch in deinem Dashboard sichtbar.</p>
  `;

  await transporter.sendMail({
    from: config.from,
    to: input.teacherEmail,
    subject,
    text,
    html,
  });
}
