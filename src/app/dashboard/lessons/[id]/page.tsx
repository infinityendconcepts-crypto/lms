import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  Download,
  Eye,
  FileText,
  Paperclip,
  Trash2,
  Video,
} from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import { deleteLessonAction, updateLessonAction } from "@/lib/actions/course";
import { deleteAttachmentAction } from "@/lib/actions/course";
import { Badge, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { RichTextEditor } from "@/components/RichTextEditor";
import { UploadField } from "@/components/UploadField";
import { MathText } from "@/components/MathText";
import { formatBytes } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Lesson editor" };

export default async function LessonEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant();
  if (!canTeach(ctx.role)) redirect("/dashboard");

  const lesson = await db.lesson.findFirst({
    where: { id, course: { tenantId: ctx.tenant.id } },
    include: {
      course: { include: { lessons: { orderBy: { order: "asc" } } } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lesson) notFound();

  const index = lesson.course.lessons.findIndex((l) => l.id === lesson.id);
  const previous = index > 0 ? lesson.course.lessons[index - 1] : null;
  const next = index >= 0 ? lesson.course.lessons[index + 1] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/dashboard/courses/${lesson.courseId}?tab=content`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-3.5" /> {lesson.course.title}
        </Link>
        <div className="flex items-center gap-2">
          {previous && (
            <Link href={`/dashboard/lessons/${previous.id}`} className="btn-ghost btn-sm">
              <ArrowLeft className="size-3" /> Prev
            </Link>
          )}
          {next && (
            <Link href={`/dashboard/lessons/${next.id}`} className="btn-ghost btn-sm">
              Next <ArrowRight className="size-3" />
            </Link>
          )}
          <Link href={`/learn/${lesson.courseId}/lessons/${lesson.id}`} className="btn-secondary btn-sm">
            <Eye className="size-3.5" /> Learner view
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lesson.published ? "green" : "slate"}>
              {lesson.published ? "Published" : "Draft"}
            </Badge>
            <Badge>
              Lesson {index + 1} of {lesson.course.lessons.length}
            </Badge>
            <Badge tone="sky">
              <Clock className="size-3" /> {lesson.estimatedMinutes} min
            </Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {lesson.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {lesson.summary || "No summary yet — add one so learners know what this lesson covers."}
          </p>
        </div>
      </div>

      {(sp.saved || sp.error) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ?? "Lesson saved."}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <form action={updateLessonAction} className="card-pad space-y-4">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="lesson-title">
                  Lesson title
                </label>
                <input
                  id="lesson-title"
                  name="title"
                  defaultValue={lesson.title}
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="lesson-summary">
                  Summary
                </label>
                <input
                  id="lesson-summary"
                  name="summary"
                  defaultValue={lesson.summary ?? ""}
                  placeholder="One sentence on what learners will master"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="lesson-minutes">
                    Minutes
                  </label>
                  <input
                    id="lesson-minutes"
                    name="estimatedMinutes"
                    type="number"
                    min={1}
                    defaultValue={lesson.estimatedMinutes}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="lesson-meeting">
                    Live meeting URL
                  </label>
                  <input
                    id="lesson-meeting"
                    name="meetingUrl"
                    type="url"
                    defaultValue={lesson.meetingUrl ?? ""}
                    placeholder="https://meet…"
                    className="input"
                  />
                </div>
              </div>
            </div>

            <RichTextEditor
              name="content"
              label="Lesson content"
              defaultValue={lesson.content}
              rows={16}
              placeholder={"# Learning objectives\n\nBy the end of this lesson you can solve $ax^2+bx+c=0$.\n\n## Worked example\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$"}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={lesson.published}
                  className="size-4"
                />
                Published — visible to enrolled learners
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">
                  Updated {formatDate(lesson.updatedAt, true)}
                </span>
                <SubmitButton pendingText="Saving…">Save lesson</SubmitButton>
              </div>
            </div>
          </form>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Paperclip className="size-4 text-slate-400" /> Lesson attachments
              </h2>
              <span className="text-[11px] text-slate-400">
                {lesson.attachments.length} file{lesson.attachments.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-2 p-4">
              <UploadField
                lessonId={lesson.id}
                courseId={lesson.courseId}
                label="Add a file to this lesson"
                refreshOnUpload
                hint="Worksheets, slides, PDFs, images, video or audio · 25 MB max"
              />
              {lesson.attachments.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-[11px] text-slate-400">
                  No files attached yet.
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {lesson.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                        {file.kind === "video" ? (
                          <Video className="size-4" />
                        ) : file.kind === "image" ? (
                          <BookOpen className="size-4" />
                        ) : (
                          <FileText className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-700">
                          {file.name}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {formatBytes(file.size)} · {formatDate(file.createdAt)}
                        </p>
                      </div>
                      <a
                        href={`/api/files/${file.id}`}
                        target="_blank"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Download"
                      >
                        <Download className="size-3.5" />
                      </a>
                      <form action={deleteAttachmentAction}>
                        <input type="hidden" name="attachmentId" value={file.id} />
                        <SubmitButton variant="ghost" className="p-1" confirm="Delete this file?">
                          <Trash2 className="size-3.5 text-rose-500" />
                        </SubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Lesson preview</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Exactly what learners see, with math rendered.
            </p>
            <div className="mt-3 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 thin-scroll">
              {lesson.content.trim() ? (
                <MathText content={lesson.content} />
              ) : (
                <p className="text-xs text-slate-400">
                  Nothing written yet. Add content in the editor.
                </p>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Course lessons</h2>
            <ol className="mt-3 space-y-1">
              {lesson.course.lessons.map((item, i) => (
                <li key={item.id}>
                  <Link
                    href={`/dashboard/lessons/${item.id}`}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition ${
                      item.id === lesson.id
                        ? "bg-brand-50 font-semibold text-brand-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="w-4 text-[10px] font-bold text-slate-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <StatusBadge status={item.published ? "PUBLISHED" : "DRAFT"} />
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="card p-5">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Calendar className="size-3.5 text-slate-400" /> Lesson metadata
            </h3>
            <dl className="mt-2.5 space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Position</dt>
                <dd className="font-medium text-slate-700">{index + 1}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Created</dt>
                <dd className="font-medium text-slate-700">{formatDate(lesson.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Attachments</dt>
                <dd className="font-medium text-slate-700">{lesson.attachments.length}</dd>
              </div>
            </dl>
            <form action={deleteLessonAction} className="mt-4 border-t border-slate-100 pt-3">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <SubmitButton
                variant="ghost"
                className="btn-sm w-full text-rose-600"
                confirm="Delete this lesson and its attachments?"
              >
                <Trash2 className="size-3.5" /> Delete lesson
              </SubmitButton>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
