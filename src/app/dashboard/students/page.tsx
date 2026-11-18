import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  GraduationCap,
  ListChecks,
  Mail,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { canAdmin, requireTenant } from "@/lib/tenant";
import {
  addLearnerAction,
  batchInviteLearnerAction,
  bulkLearnerAction,
  importLearnerAction,
} from "@/lib/actions/people";
import { Avatar, Badge, EmptyState, PageHeader, PanelHeader, Stat, StatusBadge, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SelectAllCheckbox } from "@/components/SelectAllCheckbox";
import { formatDate, pct } from "@/lib/utils";

export const metadata = { title: "Learners" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    added?: string;
    invites?: string;
    affected?: string;
    skipped?: string;
    detail?: string;
    error?: string;
    tab?: string;
  }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const activeTab = sp.tab === "invite" || sp.tab === "import" ? sp.tab : "add";
  const tabHref = (tab: string) => {
    const params = new URLSearchParams({ tab });
    if (query) params.set("q", query);
    return `?${params.toString()}`;
  };
  const ctx = await requireTenant("TEACHER");
  const admin = canAdmin(ctx.role);

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
      where: {
        tenantId: ctx.tenant.id,
        role: "STUDENT",
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
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

  const banner = sp.error
    ? { tone: "error" as const, message: sp.error }
    : sp.invites
      ? {
          tone: "ok" as const,
          message: `${sp.invites} learner ${sp.invites === "1" ? "invitation" : "invitations"} sent${sp.skipped ? ` · ${sp.skipped} skipped` : ""}. Check the email outbox for join links.`,
        }
      : sp.added
      ? {
          tone: "ok" as const,
          message: `${sp.added} learner ${sp.added === "1" ? "account" : "accounts"} added. Temporary passwords were written to the email outbox.`,
        }
      : sp.affected
        ? {
            tone: "ok" as const,
            message: `${sp.affected} learner ${sp.affected === "1" ? "record" : "records"} updated${sp.skipped ? ` · ${sp.skipped} skipped` : ""}.`,
          }
        : null;

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Learners"
        subtitle="Everyone learning in this workspace, their courses and their performance."
        actions={
          <>
            {admin && (
              <>
                <a href={tabHref("add")} className="btn-primary btn-sm">
                  <UserPlus className="size-3.5" /> Add learner
                </a>
                <a href={tabHref("invite")} className="btn-secondary btn-sm">
                  <Mail className="size-3.5" /> Batch invite
                </a>
                <a href={tabHref("import")} className="btn-secondary btn-sm">
                  <FileText className="size-3.5" /> Import CSV
                </a>
              </>
            )}
            <a href={tabHref("invite")} className="btn-secondary btn-sm">
              <Mail className="size-3.5" /> Invite learner
            </a>
          </>
        }
      />

      {banner && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            banner.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {banner.message}
          {sp.detail && <p className="mt-1 text-xs opacity-80">{sp.detail}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Learners" value={totalLearners} icon={<Users className="size-4" />} />
        <Stat label="Active" value={active} hint={`${totalLearners - active} suspended`} />
        <Stat label="Pending invites" value={invitations.length} hint="awaiting acceptance" icon={<Mail className="size-4" />} />
        <Stat label="Class average" value={`${classAverage}%`} hint={`${averages.length} learners with grades`} icon={<GraduationCap className="size-4" />} />
      </div>

      {admin && (
        <div className="mt-6">
          <Tabs
            items={[
              { href: tabHref("add"), label: "Add learner" },
              { href: tabHref("invite"), label: "Batch invite" },
              { href: tabHref("import"), label: "Import CSV" },
            ]}
            current={tabHref(activeTab)}
          />
          <div className="card overflow-hidden">
            {activeTab === "add" && (
              <>
                <PanelHeader
                  icon={<UserPlus className="size-4" />}
                  title="Add learner directly"
                  description="Create the account now and enroll them in a course if needed."
                />
                <form
                  action={addLearnerAction}
                  className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_auto] lg:items-end"
                >
                  <input type="hidden" name="returnTo" value="/dashboard/students" />
                  <input type="hidden" name="tab" value="add" />
                  <div>
                    <label className="label" htmlFor="learner-add-name">Full name</label>
                    <input id="learner-add-name" name="name" required placeholder="Lerato Dlamini" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="learner-add-email">Email address</label>
                    <input id="learner-add-email" name="email" type="email" required placeholder="lerato@school.edu" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="learner-add-course">Enroll in course</label>
                    <select id="learner-add-course" name="courseId" className="select">
                      <option value="">No course yet</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                  <SubmitButton pendingText="Adding…">
                    <CheckCircle2 className="size-3.5" /> Add learner
                  </SubmitButton>
                </form>
                <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
                  The account is active immediately. A temporary password is written to the email outbox and uses one
                  learner seat.
                </p>
              </>
            )}

            {activeTab === "invite" && (
              <>
                <PanelHeader
                  icon={<Mail className="size-4" />}
                  title="Batch invite learners"
                  description="Send 7-day join links to one learner or a whole group."
                />
                <form action={batchInviteLearnerAction} className="grid gap-4 p-5 md:grid-cols-2">
                  <input type="hidden" name="returnTo" value="/dashboard/students" />
                  <input type="hidden" name="tab" value="invite" />
                  <div>
                    <label className="label" htmlFor="learner-invite-file">CSV file (optional)</label>
                    <input id="learner-invite-file" name="file" type="file" accept=".csv,text/csv" className="input !py-2" />
                  </div>
                  <div>
                    <label className="label" htmlFor="learner-invite-course">Enroll invitees in course</label>
                    <select id="learner-invite-course" name="courseId" className="select">
                      <option value="">No course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label" htmlFor="learner-invite-emails">Or paste emails</label>
                    <textarea
                      id="learner-invite-emails"
                      name="csv"
                      rows={5}
                      placeholder={"learner1@school.edu\nlearner2@school.edu"}
                      className="textarea"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                    <SubmitButton pendingText="Sending…">
                      <Mail className="size-3.5" /> Send invites
                    </SubmitButton>
                    <a
                      href="/templates/learner-people-template.csv"
                      download
                      className="text-[11px] font-semibold text-brand-600 hover:underline"
                    >
                      Download template
                    </a>
                  </div>
                </form>
                <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
                  Upload the template or paste one email per line. Learner invites reserve seats until they expire.
                  Inviting one learner works here too.
                </p>
              </>
            )}

            {activeTab === "import" && (
              <>
                <PanelHeader
                  icon={<FileText className="size-4" />}
                  title="Import learners from CSV"
                  description="Create several learner accounts at once from a spreadsheet."
                />
                <form action={importLearnerAction} className="grid gap-4 p-5 md:grid-cols-2">
                  <input type="hidden" name="returnTo" value="/dashboard/students" />
                  <input type="hidden" name="tab" value="import" />
                  <div>
                    <label className="label" htmlFor="learner-csv-file">CSV file</label>
                    <input id="learner-csv-file" name="file" type="file" accept=".csv,text/csv" className="input !py-2" />
                  </div>
                  <div>
                    <label className="label" htmlFor="learner-csv-course">Default course when the CSV has no course column</label>
                    <select id="learner-csv-course" name="courseId" className="select">
                      <option value="">No course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label" htmlFor="learner-csv-text">Or paste CSV</label>
                    <textarea
                      id="learner-csv-text"
                      name="csv"
                      rows={5}
                      placeholder={"name,email,course\nLerato Dlamini,lerato@school.edu,Algebra I"}
                      className="textarea"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                    <SubmitButton pendingText="Importing…">
                      <FileText className="size-3.5" /> Import learners
                    </SubmitButton>
                    <a
                      href="/templates/learner-people-template.csv"
                      download
                      className="text-[11px] font-semibold text-brand-600 hover:underline"
                    >
                      Download template
                    </a>
                  </div>
                </form>
                <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
                  Columns: <code>name</code>, <code>email</code>, <code>course</code>. The course column accepts a
                  course title or ID. Learners beyond your plan&apos;s seats are skipped.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <form method="GET" className="mb-5 flex gap-2">
        <input type="hidden" name="tab" value={activeTab} />
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
          <Link href={tabHref(activeTab)} className="btn-ghost btn-sm justify-center">
            Reset
          </Link>
        )}
      </form>

      {admin && memberships.length > 0 && (
        <form id="learner-bulk-form" action={bulkLearnerAction} className="card mb-4 flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="returnTo" value="/dashboard/students" />
          <SelectAllCheckbox scopeId="learner-list" />
          <div>
            <label className="label" htmlFor="learner-bulk-action">Batch action</label>
            <select id="learner-bulk-action" name="bulkAction" className="select !w-40">
              <option value="enroll">Enroll in course</option>
              <option value="role">Change role</option>
              <option value="remove">Remove from workspace</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="learner-bulk-course">Course</label>
            <select id="learner-bulk-course" name="courseId" className="select !w-44">
              <option value="">Choose a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="learner-bulk-role">New role</label>
            <select id="learner-bulk-role" name="role" className="select !w-36" defaultValue="MODERATOR">
              <option value="MODERATOR">Moderator</option>
              <option value="TEACHER">Teacher</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <SubmitButton
            variant="secondary"
            confirm="Apply this batch action to the selected learners?"
          >
            <ListChecks className="size-3.5" /> Apply to selected
          </SubmitButton>
          <p className="w-full text-[10px] text-slate-400">
            Select learners in the table below. Changing a role to staff removes them from the learner count.
          </p>
        </form>
      )}

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
            <a href={tabHref("invite")} className="btn-primary btn-sm">
              <Mail className="size-3.5" /> Invite a learner
            </a>
          }
        />
      ) : (
        <div className="table-wrap" id="learner-list">
          <table className="table">
            <thead>
              <tr>
                <th className="w-8">{admin && <span className="sr-only">Select</span>}</th>
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
                      {admin && membership.role !== "OWNER" && membership.userId !== ctx.user.id && (
                        <input
                          type="checkbox"
                          form="learner-bulk-form"
                          name="memberIds"
                          value={membership.id}
                          data-person-id={membership.id}
                          aria-label={`Select ${learner.name}`}
                          className="size-3.5"
                        />
                      )}
                    </td>
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
