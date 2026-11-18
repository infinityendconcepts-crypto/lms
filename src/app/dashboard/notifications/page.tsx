import Link from "next/link";
import { Bell, Check, CheckCheck, Inbox, Mail, MessageSquare, Send } from "lucide-react";
import { db } from "@/lib/db";
import { atLeast, requireTenant, ROLE_LABELS, type Role } from "@/lib/tenant";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  sendMessageAction,
} from "@/lib/actions/notifications";
import {
  MESSAGE_AUDIENCES,
  MESSAGE_AUDIENCE_LABELS,
  audienceLabel,
  notificationKindLabel,
} from "@/lib/notifications";
import { Badge, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Notifications · Nkanyezi LMS" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    filter?: string;
    sent?: string;
    read?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant();
  const tab = sp.tab === "compose" ? "compose" : "inbox";
  const filter = sp.filter === "unread" ? "unread" : "all";
  const staff = ctx.role !== "STUDENT";

  const [notifications, unreadCount, memberships, enrolledCourses] = await Promise.all([
    db.notification.findMany({
      where: {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        ...(filter === "unread" ? { readAt: null } : {}),
      },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.notification.count({
      where: { tenantId: ctx.tenant.id, userId: ctx.user.id, readAt: null },
    }),
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    staff
      ? Promise.resolve([] as { ownerId: string }[])
      : db.course.findMany({
          where: {
            tenantId: ctx.tenant.id,
            enrollments: { some: { userId: ctx.user.id } },
          },
          select: { ownerId: true },
        }),
  ]);

  let people = memberships.map((membership) => ({
    ...membership.user,
    role: membership.role,
  }));

  if (!staff) {
    const allowed = new Set<string>();
    for (const membership of memberships) {
      if (atLeast(membership.role, "TEACHER")) allowed.add(membership.userId);
    }
    for (const course of enrolledCourses) allowed.add(course.ownerId);
    allowed.delete(ctx.user.id);
    people = people.filter((person) => allowed.has(person.id));
  }

  people.sort((a, b) => a.name.localeCompare(b.name));

  const notice = sp.sent
    ? `${sp.sent} message${sp.sent === "1" ? "" : "s"} sent and emailed.`
    : sp.read === "all"
      ? "All notifications marked as read."
      : sp.read
        ? "Notification marked as read."
        : null;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Messages & notifications"
        subtitle="Keep conversations in the app and copy every message to email."
        actions={
          <Link href={`/dashboard/notifications?tab=${tab === "inbox" ? "compose" : "inbox"}`} className="btn-secondary btn-sm">
            {tab === "inbox" ? (
              <>
                <Send className="size-3.5" /> {staff ? "Compose" : "Message teacher"}
              </>
            ) : (
              <>
                <Inbox className="size-3.5" /> Back to inbox
              </>
            )}
          </Link>
        }
      />

      {(notice || sp.error) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ?? notice}
        </div>
      )}

      <Tabs
        current={`/dashboard/notifications?tab=${tab}`}
        items={[
          {
            href: "/dashboard/notifications?tab=inbox",
            label: "Inbox",
            count: unreadCount,
          },
          {
            href: "/dashboard/notifications?tab=compose",
            label: staff ? "Compose" : "Message teacher",
          },
        ]}
      />

      {tab === "inbox" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/notifications?tab=inbox&filter=all"
              className={`btn-sm ${filter === "all" ? "btn-secondary" : "btn-ghost"}`}
            >
              All
            </Link>
            <Link
              href="/dashboard/notifications?tab=inbox&filter=unread"
              className={`btn-sm ${filter === "unread" ? "btn-secondary" : "btn-ghost"}`}
            >
              Unread ({unreadCount})
            </Link>
            {unreadCount > 0 && (
              <form action={markAllNotificationsReadAction} className="ml-auto">
                <SubmitButton variant="ghost" className="btn-sm" pendingText="Updating…">
                  <CheckCheck className="size-3.5" /> Mark all read
                </SubmitButton>
              </form>
            )}
          </div>

          {notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="size-5 text-brand-600" />}
              title={filter === "unread" ? "You are all caught up" : "No messages yet"}
              description={
                filter === "unread"
                  ? "There are no unread notifications in your inbox."
                  : "Messages from your workspace will appear here and in your email."
              }
              action={
                <Link href="/dashboard/notifications?tab=compose" className="btn-primary btn-sm">
                  <Send className="size-3.5" /> {staff ? "Compose a message" : "Message a teacher"}
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`card-pad ${notification.readAt ? "" : "border-brand-200 bg-brand-50/30"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {!notification.readAt && (
                          <span className="size-2 shrink-0 rounded-full bg-brand-500" title="Unread" />
                        )}
                        <Badge tone={notification.kind === "ANNOUNCEMENT" ? "sky" : "brand"}>
                          {notificationKindLabel(notification.kind)}
                        </Badge>
                        <span className="text-[11px] text-slate-500">{timeAgo(notification.createdAt)}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-slate-900">{notification.title}</h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        From {notification.sender?.name ?? "Nkanyezi"}
                        {notification.audience ? ` · ${audienceLabel(notification.audience)}` : ""}
                      </p>
                    </div>
                    {notification.emailSentAt && (
                      <span className="badge flex items-center gap-1 bg-emerald-50 text-emerald-700">
                        <Mail className="size-3" /> Emailed
                      </span>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
                    {notification.body}
                  </p>
                  {!notification.readAt && (
                    <form action={markNotificationReadAction} className="mt-3">
                      <input type="hidden" name="id" value={notification.id} />
                      <SubmitButton variant="secondary" className="btn-sm" pendingText="Marking…">
                        <Check className="size-3.5" /> Mark read
                      </SubmitButton>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "compose" && (
        <section className="card-pad">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <MessageSquare className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {staff ? "Compose a message" : "Message your teachers"}
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                {staff
                  ? "Send a direct message or broadcast to a role group. Everyone who receives it gets an in-app notification and an email copy."
                  : "Ask your teacher or course administrator a question. They will see it in the app and receive an email copy."}
              </p>
            </div>
          </div>

          <form action={sendMessageAction} className="mt-5 space-y-4">
            {staff && (
              <div>
                <label className="label" htmlFor="audience">
                  Audience (optional)
                </label>
                <select id="audience" name="audience" defaultValue="" className="select">
                  <option value="">Send to one person</option>
                  {MESSAGE_AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {MESSAGE_AUDIENCE_LABELS[audience]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Pick a group to broadcast, or leave this as “Send to one person” and choose a recipient below.
                </p>
              </div>
            )}

            <div>
              <label className="label" htmlFor="recipientId">
                {staff ? "Recipient" : "Teacher or administrator"}
              </label>
              <select
                id="recipientId"
                name="recipientId"
                defaultValue=""
                className="select"
                required={!staff}
              >
                <option value="">
                  {staff
                    ? "Select a person for a direct message"
                    : "Choose who should receive your message"}
                </option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {ROLE_LABELS[person.role as Role] ?? person.role}
                  </option>
                ))}
              </select>
              {!staff && people.length === 0 && (
                <p className="mt-1 text-[11px] text-rose-600">
                  You have no teachers or course administrators yet. Enrol in a course first.
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="title">
                Subject
              </label>
              <input
                id="title"
                name="title"
                required
                maxLength={120}
                minLength={3}
                placeholder={staff ? "e.g. Algebra II study group" : "e.g. Question about homework"}
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="body">
                Message
              </label>
              <textarea
                id="body"
                name="body"
                required
                rows={6}
                maxLength={5000}
                placeholder="Write your message…"
                className="textarea"
              />
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-[11px] leading-5 text-sky-800">
              Recipients see this in their in-app inbox and receive a copy by email. In this demo, sent emails
              appear in the workspace email outbox under Settings.
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <SubmitButton pendingText="Sending…">
                <Send className="size-3.5" /> Send message &amp; email
              </SubmitButton>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
