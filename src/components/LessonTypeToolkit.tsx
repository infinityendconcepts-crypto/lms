import { ArrowUpRight, Wrench } from "lucide-react";
import { LESSON_TYPE_META, lessonTypeFrom } from "@/lib/lesson-types";
import { cn } from "@/lib/utils";

export function LessonTypeToolkit({
  type,
  className,
}: {
  type?: string | null;
  className?: string;
}) {
  const value = lessonTypeFrom(type);
  const meta = LESSON_TYPE_META[value];

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-slate-50/70 p-3", className)}>
      <div className="flex items-center gap-2">
        <Wrench className="size-3.5 text-slate-500" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
          Recommended tools
        </h3>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{meta.toolkitHint}</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {meta.tools.map((tool) => (
          <a
            key={tool.name}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-800 group-hover:text-brand-700">
                {tool.name}
                <ArrowUpRight className="size-3 shrink-0 text-slate-400 group-hover:text-brand-500" />
              </span>
              <span className="mt-0.5 block text-[9px] leading-3 text-slate-500">
                {tool.description}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
