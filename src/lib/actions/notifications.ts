"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { atLeast, requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/email";
import { isMessageAudience, type MessageAudience } from "@/lib/notifications";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function messageRecipients(
  ctx: Awaited<ReturnType<typeof requireTenant>>,
  allowedIds?: Set<string>
) {
  return db.user.findMany({
    where: {
      id: allowedIds ? { in: [...allowedIds] } : undefined,
      memberships: { some: { tenantId: ctx.tenant.id, status: "ACTIVE" } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

async function broadcastRecipientIds(
  ctx: Awaited<ReturnType<typeof requireTenant>>,
  audience: MessageAudience
) {
  const memberships = await db.membership.findMany({
    where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
    select: { userId: true, role: true },
  });

  return memberships
    .filter((membership) => {
      if (membership.userId === ctx.user.id) return false;
      switch (audience) {
        case "ALL":
          return true;
        case "STAFF":
          return membership.role !== "STUDENT";
        case "TEACHERS":
          return atLeast(membership.role, "TEACHER");
        case "LEARNERS":
          return membership.role === "STUDENT";
        default:
          return false;
      }
    })
    .map((membership) => membership.userId);
}

async function learnerRecipientIds(ctx: Awaited<ReturnType<typeof requireTenant>>) {
  const memberships = await db.membership.findMany({
    where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
    select: { userId: true, role: true },
  });
  const ids = new Set<string>();

  for (const membership of memberships) {
    if (atLeast(membership.role, "TEACHER")) ids.add(membership.userId);
  }

  const enrolledCourses = await db.course.findMany({
    where: {
      tenantId: ctx.tenant.id,
      enrollments: { some: { userId: ctx.user.id } },
    },
    select: { ownerId: true },
  });
  for (const course of enrolledCourses) ids.add(course.ownerId);

  ids.delete(ctx.user.id);
  return ids;
}

export async function sendMessageAction(formData: FormData) {
  const ctx = await requireTenant();
  const title = text(formData, "title");
  const body = text(formData, "body");
  const rawAudience = text(formData, "audience");
  const audience = isMessageAudience(rawAudience) ? rawAudience : null;
  const staff = ctx.role !== "STUDENT";

  if (title.length < 3 || title.length > 120) {
    redirect(`/dashboard/notifications?tab=compose&error=${encodeURIComponent("Use a subject between 3 and 120 characters")}`);
  }
  if (body.length < 2 || body.length > 5000) {
    redirect(`/dashboard/notifications?tab=compose&error=${encodeURIComponent("Write a message between 2 and 5000 characters")}`);
  }
  if (audience && !staff) {
    redirect(`/dashboard/notifications?tab=compose&error=${encodeURIComponent("Learners can message their teachers and course administrators only")}`);
  }

  let allowedIds: Set<string> | undefined;
  let recipientIds: string[];

  if (audience) {
    recipientIds = await broadcastRecipientIds(ctx, audience);
  } else {
    const recipientId = text(formData, "recipientId");
    allowedIds = staff
      ? new Set(
          (
            await db.membership.findMany({
              where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
              select: { userId: true },
            })
          ).map((membership) => membership.userId)
        )
      : await learnerRecipientIds(ctx);

    if (!recipientId || !allowedIds.has(recipientId)) {
      redirect(`/dashboard/notifications?tab=compose&error=${encodeURIComponent("Choose a recipient you are allowed to message")}`);
    }
    recipientIds = [recipientId];
  }

  recipientIds = [...new Set(recipientIds)].filter((id) => id !== ctx.user.id);
  if (recipientIds.length === 0) {
    redirect(`/dashboard/notifications?tab=compose&error=${encodeURIComponent("No recipients were found for that audience")}`);
  }
  if (recipientIds.length > 500) {
    redirect(`/dashboard/notifications?tab=compose&error=${encodeURIComponent("This audience is too large. Split the message into smaller groups")}`);
  }

  const recipients = await messageRecipients(ctx, new Set(recipientIds));
  const kind = audience ? "ANNOUNCEMENT" : "MESSAGE";
  const createdAt = new Date();

  await db.notification.createMany({
    data: recipients.map((recipient) => ({
      tenantId: ctx.tenant.id,
      userId: recipient.id,
      senderId: ctx.user.id,
      kind,
      audience,
      title,
      body,
    })),
  });

  await Promise.all(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient.email,
        subject: `${ctx.tenant.name}: ${title}`,
        body: [
          `${ctx.user.name} sent you a ${audience ? "workspace announcement" : "message"} on ${ctx.tenant.name}.`,
          "",
          title,
          "",
          body,
          "",
          `Read it in the app: ${appUrl("/dashboard/notifications")}`,
        ].join("\n"),
        tenantId: ctx.tenant.id,
        kind,
      })
    )
  );

  await db.notification.updateMany({
    where: {
      tenantId: ctx.tenant.id,
      userId: { in: recipients.map((recipient) => recipient.id) },
      senderId: ctx.user.id,
      title,
      createdAt: { gte: createdAt },
    },
    data: { emailSentAt: new Date() },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: audience ? "message.broadcast" : "message.sent",
    target: audience ?? recipients[0]?.id ?? null,
    meta: { title, recipients: recipients.length },
  });

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  redirect(`/dashboard/notifications?tab=compose&sent=${recipients.length}`);
}

export async function markNotificationReadAction(formData: FormData) {
  const ctx = await requireTenant();
  const id = text(formData, "id");
  const notification = id
    ? await db.notification.findFirst({
        where: { id, tenantId: ctx.tenant.id, userId: ctx.user.id },
        select: { id: true },
      })
    : null;

  if (!notification) {
    redirect(`/dashboard/notifications?error=${encodeURIComponent("Notification not found")}`);
  }

  await db.notification.update({
    where: { id: notification.id },
    data: { readAt: new Date() },
  });

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  redirect("/dashboard/notifications?tab=inbox&read=1");
}

export async function markAllNotificationsReadAction() {
  const ctx = await requireTenant();
  await db.notification.updateMany({
    where: { tenantId: ctx.tenant.id, userId: ctx.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  redirect("/dashboard/notifications?tab=inbox&read=all");
}
