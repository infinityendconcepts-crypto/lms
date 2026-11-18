import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Clock,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant, canTeach } from "@/lib/tenant";
import { createCourseAction, enrollSelfAction } from "@/lib/actions/course";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Courses" };

const SUBJECTS = [
  "Mathematics",
  "Algebra",
  "Geometry",
  "Calculus",
  "Statistics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "English",
  "Economics",
  "Other",
];

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant();
  const teacher = canTeach(ctx.role);

  if (!teacher) {
    const courses = await db.course.findMany({
      where: { tenantId: ctx.tenant.id, status: "PUBLISHED" },
      include: {
        owner: { select: { name: true } },
        _count: { select: { lessons: true, assessments: true } },
        enrollments: {
          where: { userId: ctx.user.id },
          select: { id: true, progress: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return (
      <div>
        <PageHeader
          title="My courses"
          subtitle={`Published courses available in ${ctx.tenant.name}.`}
        />
        {sp.error && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {sp.error}
          </div>
        )}
        {courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="No published courses yet"
            description="Your teachers are still preparing content. Check back soon."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => {
              const enrollment = course.enrollments[0];
              return (
                <div key={course.id} className="card flex flex-col overflow-hidden">
                  <div
                    className="flex h-24 items-end p-4"
                    style={{
                      background: `linear-gradient(135deg, ${ctx.tenant.brandColor}22, ${ctx.tenant.brandColor}55)`,
                    }}
                  >
                    <span className="rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold tracking-wide text-slate-700 uppercase backdrop-blur">
                      {course.subject}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="text-sm font-bold text-slate-900">{course.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
                      {course.subtitle || course.description || "No description yet."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3" /> {course._count.lessons} lessons
                      </span>
                      <span className="flex items-center gap-1">
                        <ClipboardCheck className="size-3" /> {course._count.assessments} assessments
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {course.owner.name}
                      </span>
                    </div>
                    <div className="mt-auto pt-4">
                      {enrollment ? (
                        <div>
                          <div className="mb-1.5 flex justify-between text-[10px] font-semibold text-slate-500">
                            <span>{enrollment.progress}% complete</span>
                            <span>Enrolled</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-brand-600"
                              style={{ width: `${enrollment.progress}%` }}
                            />
                          </div>
                          <Link href={`/learn/${course.id}`} className="btn-primary btn-sm mt-3 w-full">
                            Continue <ArrowRight className="size-3.5" />
                          </Link>
                        </div>
                      ) : (
                        <form action={enrollSelfAction}>
                          <input type="hidden" name="courseId" value={course.id} />
                          <SubmitButton className="w-full" pendingText="Joining…">
                            Join course
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const courses = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    include: {
      _count: { select: { lessons: true, enrollments: true, assessments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle="Everything you teach, in one place. Publish when you are ready."
        actions={
          <a href="#new-course" className="btn-primary btn-sm">
            <Plus className="size-3.5" /> New course
          </a>
        }
      />

      {sp.error && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.error}
        </div>
      )}

      <details id="new-course" open={Boolean(sp.new)} className="card mb-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Plus className="size-3.5" />
            </span>
            Create a course
          </span>
          <span className="text-[11px] text-slate-400">Title, subject & level</span>
        </summary>
        <form action={createCourseAction} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">
              Course title
            </label>
            <input
              id="title"
              name="title"
              required
              className="input"
              placeholder="Algebra II — Quadratics & Functions"
            />
          </div>
          <div>
            <label className="label" htmlFor="subject">
              Subject
            </label>
            <select id="subject" name="subject" className="select">
              {SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="level">
              Level
            </label>
            <select id="level" name="level" className="select">
              {["General", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "Undergraduate", "Adult"].map(
                (l) => (
                  <option key={l}>{l}</option>
                )
              )}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subtitle">
              Short subtitle
            </label>
            <input id="subtitle" name="subtitle" className="input" placeholder="A 6-week journey through parabolas" />
          </div>
          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <input id="description" name="description" className="input" placeholder="What will learners achieve?" />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Creating…">
              <Plus className="size-3.5" /> Create course
            </SubmitButton>
          </div>
        </form>
      </details>

      {courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="No courses yet"
          description="Create your first course above, then add lessons and assessments."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/dashboard/courses/${course.id}`}
              className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative flex h-24 items-start justify-between bg-gradient-to-br from-slate-900 to-slate-700 p-4">
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background: `radial-gradient(circle at 80% 20%, ${ctx.tenant.brandColor}, transparent 55%)`,
                  }}
                />
                <span className="relative rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold tracking-wide text-white uppercase backdrop-blur">
                  {course.subject}
                </span>
                <span className="relative">
                  <StatusBadge status={course.status} />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-brand-700">
                  {course.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
                  {course.subtitle || course.description || "No description yet."}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3" /> {course._count.lessons} lessons
                  </span>
                  <span className="flex items-center gap-1">
                    <ClipboardCheck className="size-3" /> {course._count.assessments} assessments
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" /> {course._count.enrollments} learners
                  </span>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> {formatDate(course.updatedAt)}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
                    Manage <ArrowRight className="size-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {courses.length > 0 && (
        <div className="mt-8 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-xs text-slate-500">
          <Search className="size-4 text-slate-400" />
          Tip: assessments can draw questions from your shared{" "}
          <Link href="/dashboard/bank" className="font-semibold text-brand-600 hover:underline">
            question bank
          </Link>{" "}
          across courses.
        </div>
      )}
    </div>
  );
}
