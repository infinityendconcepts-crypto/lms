import Link from "next/link";
import { Copy, Library, Plus, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { deleteQuestionAction, duplicateQuestionAction } from "@/lib/actions/assessment";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MathText } from "@/components/MathText";
import { QuestionBuilder } from "@/components/QuestionBuilder";
import {
  QUESTION_META,
  QUESTION_TYPE_LIST,
  parseData,
  type QuestionDataShape,
  type QuestionType,
} from "@/lib/questions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Question bank" };

function answerKey(type: string, data: string) {
  const d = parseData<QuestionDataShape>(data);
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "IMAGE_BASED": {
      const options = (d.options ?? []) as { id: string; text: string }[];
      const correct = (d.correct ?? []) as string[];
      const labels = options
        .filter((o) => correct.includes(o.id))
        .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text || "(empty)"}`);
      return labels.length ? labels.join("  ·  ") : "No correct option set";
    }
    case "YES_NO":
      return d.correct ? "Yes" : "No";
    case "NUMERIC":
      return `${d.answer}${d.tolerance ? ` ± ${d.tolerance}` : ""}${d.units ? ` ${d.units}` : ""}`;
    case "FORMULA":
      return `$$${d.answer}$$`;
    case "FILL_BLANK":
      return ((d.blanks ?? []) as { accepted: string[] }[])
        .map((b, i) => `${i + 1}. ${(b.accepted ?? []).join(" / ")}`)
        .join("  ·  ");
    case "MATCHING":
      return `${Object.keys(d.pairs ?? {}).length} pairs`;
    case "OPEN_ENDED":
      return "Rubric graded";
    case "CASE_STUDY":
      return `${((d.subQuestions ?? []) as unknown[]).length} nested questions`;
    default:
      return "";
  }
}

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; saved?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const query = sp.q?.trim() ?? "";
  const typeFilter = QUESTION_TYPE_LIST.includes(sp.type as QuestionType) ? sp.type : "";

  const questions = await db.question.findMany({
    where: {
      tenantId: ctx.tenant.id,
      assessmentId: null,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(query
        ? { OR: [{ prompt: { contains: query } }, { tags: { contains: query } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const allBank = await db.question.groupBy({
    by: ["type"],
    where: { tenantId: ctx.tenant.id, assessmentId: null },
    _count: { _all: true },
  });
  const total = allBank.reduce((sum, g) => sum + g._count._all, 0);
  const typeCounts = Object.fromEntries(allBank.map((g) => [g.type, g._count._all]));

  return (
    <div>
      <PageHeader
        eyebrow="Reusable content"
        title="Question bank"
        subtitle="Build questions once, reuse them across courses and assessments. Math, media and case studies included."
        actions={
          <a href="#new-bank-question" className="btn-primary btn-sm">
            <Plus className="size-3.5" /> New question
          </a>
        }
      />

      {(sp.saved || sp.deleted) && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {sp.deleted ? "Question deleted." : sp.saved === "duplicate" ? "Question duplicated." : "Question saved to the bank."}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {QUESTION_TYPE_LIST.slice(0, 5).map((type) => {
          const meta = QUESTION_META[type];
          return (
            <Link
              key={type}
              href={`/dashboard/bank?type=${type}`}
              className={`card flex items-center justify-between p-3.5 transition hover:-translate-y-0.5 hover:shadow-md ${
                typeFilter === type ? "ring-2 ring-brand-400" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-slate-700">{meta.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{meta.auto ? "Auto-graded" : "Manual"}</p>
              </div>
              <span className={`badge ${meta.badge}`}>{typeCounts[type] ?? 0}</span>
            </Link>
          );
        })}
      </div>

      <form method="GET" className="mb-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search prompts and tags…"
            className="input pl-9"
          />
        </div>
        <select name="type" defaultValue={typeFilter} className="select sm:w-52">
          <option value="">All types</option>
          {QUESTION_TYPE_LIST.map((type) => (
            <option key={type} value={type}>
              {QUESTION_META[type].label}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Search</button>
        {(query || typeFilter) && (
          <Link href="/dashboard/bank" className="btn-ghost btn-sm justify-center">
            Reset
          </Link>
        )}
      </form>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">
          {total} question{total === 1 ? "" : "s"} in the bank
        </h2>
        <span className="text-[11px] text-slate-400">
          {questions.length} shown{typeFilter ? ` · ${QUESTION_META[typeFilter as QuestionType].label}` : ""}
        </span>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={<Library className="size-5" />}
          title={total === 0 ? "Your question bank is empty" : "No questions match"}
          description={
            total === 0
              ? "Create a reusable question below, or use “To bank” on any assessment question."
              : "Try another search term or clear the type filter."
          }
          action={
            total === 0 ? (
              <a href="#new-bank-question" className="btn-primary btn-sm">
                <Plus className="size-3.5" /> Create the first one
              </a>
            ) : (
              <Link href="/dashboard/bank" className="btn-secondary btn-sm">
                Clear filters
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {questions.map((q) => {
            const meta = QUESTION_META[q.type as QuestionType] ?? QUESTION_META.MULTIPLE_CHOICE;
            const key = answerKey(q.type, q.data);
            return (
              <div key={q.id} className="card overflow-hidden">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      <Badge>
                        {q.points} pt{q.points === 1 ? "" : "s"}
                      </Badge>
                      <Badge tone={q.difficulty === "HARD" ? "red" : q.difficulty === "EASY" ? "green" : "slate"}>
                        {q.difficulty.toLowerCase()}
                      </Badge>
                      {q.tags &&
                        q.tags.split(",").filter(Boolean).map((tag) => (
                          <span key={tag} className="text-[10px] text-slate-400">
                            #{tag.trim()}
                          </span>
                        ))}
                    </div>
                    <div className="mt-2">
                      <MathText content={q.prompt || "_No prompt_"} />
                    </div>
                    {q.mediaUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={q.mediaUrl}
                        alt="Question media"
                        className="mt-2 max-h-40 rounded-lg border border-slate-200"
                      />
                    )}
                    <p className="mt-2 rounded-lg bg-emerald-50/60 px-2.5 py-1.5 text-[10px] text-emerald-800">
                      <span className="font-bold uppercase">Key</span>{" "}
                      {key.includes("$") ? <MathText content={key} inline /> : key}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      Added {formatDate(q.createdAt)}
                    </p>

                    <details className="mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline">
                        Edit question
                      </summary>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <QuestionBuilder
                          mode="bank"
                          initial={{
                            id: q.id,
                            type: q.type,
                            prompt: q.prompt,
                            mediaUrl: q.mediaUrl,
                            points: q.points,
                            difficulty: q.difficulty,
                            tags: q.tags,
                            data: q.data,
                            explanation: q.explanation,
                          }}
                        />
                      </div>
                    </details>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1 sm:flex-col sm:items-stretch">
                    <form action={duplicateQuestionAction}>
                      <input type="hidden" name="questionId" value={q.id} />
                      <SubmitButton variant="ghost" className="btn-sm w-full justify-start" pendingText="…">
                        <Copy className="size-3" /> Duplicate
                      </SubmitButton>
                    </form>
                    <form action={deleteQuestionAction}>
                      <input type="hidden" name="questionId" value={q.id} />
                      <SubmitButton
                        variant="ghost"
                        className="btn-sm w-full justify-start text-rose-600"
                        confirm="Delete this question from the bank?"
                      >
                        <Trash2 className="size-3" /> Delete
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <details id="new-bank-question" open={Boolean(sp.saved)} className="card mt-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Plus className="size-3.5" />
            </span>
            Add a question to the bank
          </span>
          <span className="text-[11px] text-slate-400">Any of nine types · LaTeX ready</span>
        </summary>
        <div className="border-t border-slate-100 p-5">
          <QuestionBuilder mode="bank" />
        </div>
      </details>
    </div>
  );
}
