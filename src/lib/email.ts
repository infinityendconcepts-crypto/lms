import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

let transporter: Transporter | null | undefined;

function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user: user || undefined,
    pass: pass || undefined,
    from,
  };
}

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const cfg = smtpConfig();
  if (!cfg) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
  });
  return transporter;
}

export function isSmtpConfigured() {
  return smtpConfig() !== null;
}

/**
 * Persists every email to the in-app outbox and sends it via SMTP when
 * SMTP_HOST/SMTP_FROM are configured. Without SMTP, messages remain in the
 * outbox for local/dev testing.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
  tenantId?: string | null;
  kind?: string;
}) {
  const message = await db.emailMessage.create({
    data: {
      to: input.to,
      subject: input.subject,
      body: input.body,
      tenantId: input.tenantId ?? null,
      kind: input.kind ?? "GENERAL",
    },
  });

  const tx = getTransporter();
  const cfg = smtpConfig();
  if (tx && cfg) {
    try {
      await tx.sendMail({
        from: cfg.from,
        to: input.to,
        subject: input.subject,
        text: input.body,
      });
      await db.emailMessage.update({
        where: { id: message.id },
        data: { sentAt: new Date() },
      });
      return { ...message, sentAt: new Date() };
    } catch (error) {
      console.error(`[email] Failed to send ${input.kind ?? "GENERAL"} to ${input.to}`, error);
      return message;
    }
  }

  await db.emailMessage.update({
    where: { id: message.id },
    data: { sentAt: new Date() },
  });
  console.log(`\n📧 [${input.kind ?? "GENERAL"}] → ${input.to}\n   ${input.subject}\n`);
  return { ...message, sentAt: new Date() };
}

export function appUrl(path = "") {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
