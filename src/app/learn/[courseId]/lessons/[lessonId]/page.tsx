import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  GraduationCap,
  Pencil,
} from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import { markLessonCompleteAction } from "@/lib/actions/course";
import { SubmitButton } from "@/components/SubmitButton";
import { LessonBlocks } from "@/components/LessonBlocks";
import { parseLessonBlocks } from "@/lib/lesson-blocks";
import { formatBytes } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lesson" };

export default async function LearnLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const ctx = await requireTenant();
  const teacher = canTeach(ctx.role);

  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, courseId, course: { tenantId: ctx.tenant.id } },
    include: {
      course: {
        include: {
          lessons: { orderBy: { order: "asc" } },
          codePads: {
            select: { id: true, title: true, language: true, published: true },
          },
        },
      },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lesson) notFound();
  if (!lesson.published && !teacher) notFound();

  const enrolled = teacher
    ? true
    : Boolean(
        await db.enrollment.findUnique({
          where: { courseId_userId: { courseId, userId: ctx.user.id } },
        })
      );
  if (!enrolled) redirect(`/learn/${courseId}`);

  const completion = await db.lessonCompletion.findUnique({
    where: { lessonId_userId: { lessonId, userId: ctx.user.id } },
  });
  const blocks = parseLessonBlocks(lesson.contentBlocks, {
    content: lesson.content,
    meetingUrl: lesson.meetingUrl,
    codePadId: lesson.codePadId,
    videoAttachments: lesson.attachments
      .filter((file) => file.kind === "video")
      .map((file) => ({ id: file.id, name: file.name })),
  });

  const index = lesson.course.lessons.findIndex((l) => l.id === lesson.id);
  const previous = index > 0 ? lesson.course.lessons[index - 1] : null;
  const next = index >= 0 && index < lesson.course.lessons.length - 1 ? lesson.course.lessons[index + 1] : null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href={`/learn/${courseId}`}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">{lesson.course.title}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {teacher && (
              <Link href={`/dashboard/lessons/${lesson.id}`} className="btn-secondary btn-sm">
                <Pencil className="size-3.5" /> Edit
              </Link>
            )}
            <span className="hidden items-center gap-1 text-[11px] text-slate-400 sm:flex">
              <Clock className="size-3" /> {lesson.estimatedMinutes} min
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="badge bg-brand-50 text-brand-700">
            Lesson {index + 1} of {lesson.course.lessons.length}
          </span>
          {completion && (
            <span className="badge bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="mr-1 size-3" /> Completed
            </span>
          )}
          {teacher && <span className="badge bg-amber-50 text-amber-700">Teacher preview</span>}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{lesson.title}</h1>
        {lesson.summary && <p className="mt-1 text-sm leading-6 text-slate-500">{lesson.summary}</p>}

        <div className="mt-6">
          <LessonBlocks
            blocks={blocks}
            courseId={courseId}
            codePads={lesson.course.codePads}
            teacher={teacher}
          />
        </div>

        {lesson.attachments.some((file) => file.kind !== "video") && (
          <section className="card mt-5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <FileText className="size-3.5" />
                Lesson files
              </h2>
              <span className="text-[11px] text-slate-400">
                {lesson.attachments.filter((file) => file.kind !== "video").length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {lesson.attachments.filter((file) => file.kind !== "video").map((file) => (
                <li key={file.id}>
                  <a
                    href={`/api/files/${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{file.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {file.kind} · {formatBytes(file.size)}
                      </span>
                    </span>
                    <Download className="size-4 shrink-0 text-slate-400" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {previous ? (
            <Link
              href={`/learn/${courseId}/lessons/${previous.id}`}
              className="btn-secondary btn-sm max-w-full min-w-0 sm:max-w-[45%]"
            >
              <ArrowLeft className="size-3.5 shrink-0" />
              <span className="truncate">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/learn/${courseId}/lessons/${next.id}`}
              className="btn-secondary btn-sm max-w-full min-w-0 sm:ml-auto sm:max-w-[45%]"
            >
              <span className="truncate">{next.title}</span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          )}
        </nav>

        <div className="mt-8 border-t border-slate-200 pt-6">
          {teacher ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">You are previewing as a teacher.</p>
                <p className="text-xs text-slate-500">Completion tracking is student-only.</p>
              </div>
              <Link href={`/dashboard/lessons/${lesson.id}`} className="btn-secondary btn-sm shrink-0">
                <GraduationCap className="size-3.5" /> Manage
              </Link>
            </div>
          ) : completion ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
              <CheckCircle2 className="size-7 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-900">Lesson complete — nice work.</p>
              <Link href={`/learn/${courseId}`} className="btn-secondary btn-sm mt-1">
                Back to course
              </Link>
            </div>
          ) : (
            <form action={markLessonCompleteAction} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <p className="text-sm font-semibold text-slate-800">Finished this lesson?</p>
              <p className="text-xs text-slate-500">Mark it complete to update your course progress.</p>
              <SubmitButton className={cn("mt-1")} pendingText="Saving…">
                <CheckCircle2 className="size-4" /> Mark complete
              </SubmitButton>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
