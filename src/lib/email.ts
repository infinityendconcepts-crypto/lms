import "server-only";

import { db } from "@/lib/db";

/**
 * Dev transport: persists messages to the in-app outbox so invite / reset
 * flows are fully testable without SMTP. Swap this function for Resend,
 * Postmark, SES, etc. in production.
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
      sentAt: new Date(),
    },
  });
  console.log(`\n📧 [${input.kind ?? "GENERAL"}] → ${input.to}\n   ${input.subject}\n`);
  return message;
}

export function appUrl(path = "") {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
