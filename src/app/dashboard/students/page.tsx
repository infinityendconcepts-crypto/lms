import Link from "next/link";
import { ArrowRight, GraduationCap, Mail, Search, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { inviteMemberAction } from "@/lib/actions/tenant";
import { Avatar, Badge, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, pct } from "@/lib/utils";

export const metadata = { title: "Learners" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const query = sp.q?.trim() ?? "";

  const [memberships, invitations, courses] = await Promise.all([
    db.membership.findMany({
      where: {
        tenantId: ctx.tenant.id,
        role: "STUDENT",
        ...(query
          ? {
              user: {
                OR: [{ name: { contains: query } }, { email: { contains: query } }],
              },
            }
          : {}),
      },
      include: {
        user: {
          include: {
            enrollments: {
              where: { tenantId: ctx.tenant.id },
              include: { course: { select: { id: true, title: true } } },
            },
            attempts: {
              where: { tenantId: ctx.tenant.id, status: "GRADED" },
              select: { score: true, maxScore: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.invitation.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    db.course.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const totalLearners = await db.membership.count({
    where: { tenantId: ctx.tenant.id, role: "STUDENT" },
  });
  const active = memberships.filter((m) => m.status === "ACTIVE").length;

  const averages = memberships
    .map((m) => {
      const graded = m.user.attempts;
      return graded.length
        ? Math.round(graded.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / graded.length)
        : null;
    })
    .filter((n): n is number => n !== null);
  const classAverage = averages.length
    ? Math.round(averages.reduce((sum, n) => sum + n, 0) / averages.length)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Learners"
        subtitle="Everyone learning in this workspace, their courses and their performance."
        actions={
          <a href="#invite-learner" className="btn-primary btn-sm">
            <UserPlus className="size-3.5" /> Invite learner
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Learners" value={totalLearners} icon={<Users className="size-4" />} />
        <Stat label="Active" value={active} hint={`${totalLearners - active} suspended`} />
        <Stat label="Pending invites" value={invitations.length} hint="awaiting acceptance" icon={<Mail className="size-4" />} />
        <Stat label="Class average" value={`${classAverage}%`} hint={`${averages.length} learners with grades`} icon={<GraduationCap className="size-4" />} />
      </div>

      <details id="invite-learner" className="card mt-6 mb-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-600 text-white">
              <UserPlus className="size-3.5" />
            </span>
            Invite a learner
          </span>
          <span className="text-[11px] text-slate-400">Sends an email with a join link</span>
        </summary>
        <form action={inviteMemberAction} className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
          <input type="hidden" name="role" value="STUDENT" />
          <div>
            <label className="label" htmlFor="invite-email">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              name="email"
              required
              placeholder="learner@school.edu"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-course">
              Enroll in course (optional)
            </label>
            <select id="invite-course" name="courseId" className="select">
              <option value="">No course yet</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton pendingText="Sending…">
            <Mail className="size-3.5" /> Send invite
          </SubmitButton>
        </form>
      </details>

      <form method="GET" className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search learners by name or email…"
            className="input pl-9"
          />
        </div>
        <button className="btn-secondary">Search</button>
        {query && (
          <Link href="/dashboard/students" className="btn-ghost btn-sm justify-center">
            Reset
          </Link>
        )}
      </form>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">
          {query ? `${memberships.length} match${memberships.length === 1 ? "" : "es"}` : "All learners"}
        </h2>
        <Link
          href="/dashboard/settings?tab=members"
          className="text-[11px] font-semibold text-brand-600 hover:underline"
        >
          Manage members & roles →
        </Link>
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title={query ? "No learners match" : "No learners yet"}
          description={
            query
              ? "Try a different name or email."
              : "Invite learners above or share an invite link. They will appear here once they join."
          }
          action={
            <a href="#invite-learner" className="btn-primary btn-sm">
              <UserPlus className="size-3.5" /> Invite a learner
            </a>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Status</th>
                <th>Courses</th>
                <th>Graded work</th>
                <th>Average</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => {
                const learner = membership.user;
                const graded = learner.attempts;
                const average = graded.length
                  ? Math.round(
                      graded.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / graded.length
                    )
                  : null;
                return (
                  <tr key={membership.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={learner.name} src={learner.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">{learner.name}</p>
                          <p className="truncate text-[10px] text-slate-400">{learner.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={membership.status} />
                    </td>
                    <td>
                      {learner.enrollments.length === 0 ? (
                        <span className="text-[11px] text-slate-400">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {learner.enrollments.slice(0, 2).map((e) => (
                            <Link
                              key={e.id}
                              href={`/dashboard/courses/${e.course.id}`}
                              className="badge bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                              title={e.course.title}
                            >
                              {e.course.title.length > 22 ? `${e.course.title.slice(0, 22)}…` : e.course.title}
                            </Link>
                          ))}
                          {learner.enrollments.length > 2 && (
                            <Badge>+{learner.enrollments.length - 2}</Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="tabular-nums text-xs">{graded.length}</td>
                    <td>
                      {average === null ? (
                        <span className="text-[11px] text-slate-400">—</span>
                      ) : (
                        <span
                          className={`text-xs font-bold ${
                            average >= 80 ? "text-emerald-600" : average >= 60 ? "text-sky-600" : "text-rose-600"
                          }`}
                        >
                          {average}%
                        </span>
                      )}
                    </td>
                    <td className="text-[11px] text-slate-500">{formatDate(membership.createdAt)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/students/${learner.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-brand-700 hover:underline"
                        >
                          Profile <ArrowRight className="size-3" />
                        </Link>
                        <Link
                          href={`/dashboard/gradebook${learner.enrollments[0] ? `?course=${learner.enrollments[0].course.id}` : ""}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          Gradebook
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {invitations.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Pending invitations</h2>
            <Link href="/dashboard/settings?tab=members" className="text-[11px] font-semibold text-brand-600 hover:underline">
              Manage invites
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Course</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const course = courses.find((c) => c.id === invitation.courseId);
                  return (
                    <tr key={invitation.id}>
                      <td className="font-medium text-slate-800">{invitation.email}</td>
                      <td>
                        <Badge tone="brand">{invitation.role.toLowerCase()}</Badge>
                      </td>
                      <td className="text-[11px] text-slate-500">{course?.title ?? "—"}</td>
                      <td className="text-[11px] text-slate-500">{formatDate(invitation.expiresAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
