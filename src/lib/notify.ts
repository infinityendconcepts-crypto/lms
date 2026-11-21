import "server-only";

import { db } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";

export async function notifyUsers(input: {
  tenantId: string;
  recipientIds: string[];
  senderId?: string | null;
  kind?: string;
  audience?: string | null;
  title: string;
  body: string;
  emailSubject?: string;
  link?: string;
}) {
  const recipientIds = [...new Set(input.recipientIds)].filter(Boolean);
  if (recipientIds.length === 0) return;

  const recipients = await db.user.findMany({
    where: {
      id: { in: recipientIds },
      memberships: { some: { tenantId: input.tenantId, status: "ACTIVE" } },
    },
    select: { id: true, email: true, name: true },
  });
  if (recipients.length === 0) return;

  const createdAt = new Date();
  await db.notification.createMany({
    data: recipients.map((recipient) => ({
      tenantId: input.tenantId,
      userId: recipient.id,
      senderId: input.senderId ?? null,
      kind: input.kind ?? "SYSTEM",
      audience: input.audience ?? null,
      title: input.title,
      body: input.body,
      createdAt,
    })),
  });

  const link = input.link ? appUrl(input.link) : appUrl("/dashboard/notifications");
  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        await sendEmail({
          to: recipient.email,
          subject: input.emailSubject ?? input.title,
          body: [input.body, "", `Open in Nkanyezi LMS: ${link}`].join("\n"),
          tenantId: input.tenantId,
          kind: input.kind ?? "SYSTEM",
        });
      } catch (error) {
        console.error(`[notify] Failed email to ${recipient.email}`, error);
      }
    })
  );

  await db.notification.updateMany({
    where: {
      tenantId: input.tenantId,
      userId: { in: recipients.map((r) => r.id) },
      title: input.title,
      createdAt,
    },
    data: { emailSentAt: new Date() },
  });
}
