import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Code2, Terminal } from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import { Badge } from "@/components/ui";
import { MathText } from "@/components/MathText";
import { CodePadRunner } from "@/components/CodePadRunner";

export const metadata = { title: "Coding pad" };

export default async function LearnerCodePadPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; padId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { courseId, padId } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant();
  if (canTeach(ctx.role)) redirect(`/dashboard/courses/${courseId}?tab=coding`);

  const pad = await db.codePad.findFirst({
    where: { id: padId, courseId, tenantId: ctx.tenant.id },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!pad) notFound();

  const enrollment = await db.enrollment.findUnique({
    where: { courseId_userId: { courseId, userId: ctx.user.id } },
  });
  if (!enrollment) redirect(`/learn/${courseId}?error=Join+the+course+to+use+this+pad`);
  if (!pad.published) redirect(`/learn/${courseId}?error=This+pad+is+not+open+yet`);

  const submission = await db.codePadSubmission.findUnique({
    where: { padId_userId: { padId, userId: ctx.user.id } },
  });

  const otherPads = await db.codePad.findMany({
    where: { courseId, tenantId: ctx.tenant.id, published: true, id: { not: pad.id } },
    select: { id: true, title: true, language: true },
    orderBy: { order: "asc" },
    take: 6,
  });

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            href={`/learn/${courseId}`}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" /> {pad.course.title}
          </Link>
          <Link href="/dashboard/results" className="btn-ghost btn-sm">
            My results
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        {(sp.saved || sp.error) && (
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              sp.error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {sp.error ??
              (sp.saved === "submitted"
                ? "Submitted for teacher review."
                : "Draft saved.")}
          </div>
        )}

        <div className="card mb-5 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">
                  <Code2 className="size-3" /> {pad.language}
                </Badge>
                <Badge
                  tone={
                    submission?.status === "REVIEWED"
                      ? "green"
                      : submission?.status === "SUBMITTED"
                        ? "sky"
                        : "slate"
                  }
                >
                  {submission?.status === "REVIEWED"
                    ? "Reviewed"
                    : submission?.status === "SUBMITTED"
                      ? "Submitted"
                      : submission
                        ? "Draft"
                        : "Not started"}
                </Badge>
              </div>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{pad.title}</h1>
              {pad.prompt && <MathText content={pad.prompt} className="mt-1 text-sm text-slate-600" />}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
              <Terminal className="size-3.5" /> Coding lab
            </span>
          </div>
          <div className="px-5 py-4">
            <CodePadRunner
              padId={pad.id}
              language={pad.language}
              starterCode={pad.starterCode}
              initialCode={submission?.code ?? ""}
              status={(submission?.status as "DRAFT" | "SUBMITTED" | "REVIEWED") ?? "DRAFT"}
              score={submission?.score ?? null}
              feedback={submission?.feedback ?? null}
            />
          </div>
        </div>

        {otherPads.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">More coding pads in this course</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {otherPads.map((other) => (
                <Link
                  key={other.id}
                  href={`/learn/${courseId}/pads/${other.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
                >
                  <Code2 className="size-3" /> {other.title}
                  <span className="text-[9px] uppercase text-slate-400">{other.language}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
