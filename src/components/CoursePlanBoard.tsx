"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, GripVertical, LayoutGrid } from "lucide-react";
import {
  PLAN_STATUSES,
  PLAN_STATUS_META,
  type PlanStatus,
} from "@/lib/course-plan";
import { setCoursePlanTaskStatusAction } from "@/lib/actions/course-plan";
import { clamp, cn, formatDate } from "@/lib/utils";

export type PlanTaskView = {
  id: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  startAt: string | null;
  dueAt: string | null;
  stageTitle: string | null;
  assigneeName: string | null;
};

const DAY = 86_400_000;

export function CoursePlanBoard({
  tasks,
  todayIso,
}: {
  tasks: PlanTaskView[];
  todayIso: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "gantt">("board");
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const timeline = useMemo(() => {
    const today = new Date(todayIso);
    today.setHours(12, 0, 0, 0);
    const dates = tasks.flatMap((task) =>
      [task.startAt, task.dueAt].filter((value): value is string => Boolean(value)).map((value) => new Date(value))
    );
    const minTime = dates.length ? Math.min(today.getTime(), ...dates.map((d) => d.getTime())) : today.getTime() - 7 * DAY;
    const maxTime = dates.length ? Math.max(today.getTime(), ...dates.map((d) => d.getTime())) : today.getTime() + 14 * DAY;
    const start = new Date(minTime);
    start.setDate(start.getDate() - 3);
    const end = new Date(maxTime);
    end.setDate(end.getDate() + 3);
    const totalDays = Math.max(14, Math.ceil((end.getTime() - start.getTime()) / DAY) + 1);
    const position = (date: Date) => clamp(((date.getTime() - start.getTime()) / DAY / totalDays) * 100, 0, 100);
    const ticks = Array.from({ length: 8 }, (_, index) => {
      const tick = new Date(start);
      tick.setDate(start.getDate() + Math.round((index * (totalDays - 1)) / 7));
      return tick;
    });
    return { today, start, totalDays, position, ticks };
  }, [tasks, todayIso]);

  function move(taskId: string, status: PlanStatus) {
    startTransition(async () => {
      await setCoursePlanTaskStatusAction({ taskId, status });
      router.refresh();
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>, status: PlanStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || dragging;
    setDragging(null);
    if (taskId) move(taskId, status);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Course plan board</h2>
          <p className="text-[11px] text-slate-400">
            Drag a card between columns, or use its status selector. Changes save immediately.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView("board")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
              view === "board" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <LayoutGrid className="size-3.5" /> Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("gantt")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
              view === "gantt" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <CalendarDays className="size-3.5" /> Gantt
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-semibold text-slate-700">No plan tasks yet</p>
          <p className="mt-1 text-xs text-slate-400">Add a task to start the board and timeline.</p>
        </div>
      ) : view === "board" ? (
        <div className="thin-scroll grid min-w-[840px] grid-cols-3 gap-3 overflow-x-auto p-4">
          {PLAN_STATUSES.map((status) => {
            const meta = PLAN_STATUS_META[status];
            const columnTasks = tasks.filter((task) => task.status === status);
            return (
              <div
                key={status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, status)}
                className={cn(
                  "min-h-64 rounded-2xl border border-dashed p-3 transition-colors",
                  dragging ? "border-brand-300 bg-brand-50/40" : "border-slate-200 bg-slate-50/60"
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", meta.dot)} />
                    <span className="text-xs font-bold text-slate-700">{meta.label}</span>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {columnTasks.map((task) => {
                    const index = PLAN_STATUSES.indexOf(task.status);
                    return (
                      <article
                        key={task.id}
                        draggable={!pending}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", task.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(task.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        className={cn(
                          "rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                          dragging === task.id && "opacity-40",
                          pending && "pointer-events-none opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="mt-0.5 size-3.5 shrink-0 text-slate-300" />
                          <p className="flex-1 text-[12px] leading-4 font-bold text-slate-800">{task.title}</p>
                        </div>
                        {task.description && (
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{task.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.stageTitle && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                              {task.stageTitle}
                            </span>
                          )}
                          {task.dueAt && (
                            <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 ring-1 ring-slate-200 ring-inset">
                              Due {formatDate(task.dueAt)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                          <span className="truncate text-[9px] text-slate-400">
                            {task.assigneeName ?? "Unassigned"}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={pending || index === 0}
                              onClick={() => move(task.id, PLAN_STATUSES[index - 1])}
                              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                              aria-label={`Move ${task.title} back`}
                            >
                              <ArrowLeft className="size-3" />
                            </button>
                            <select
                              value={task.status}
                              disabled={pending}
                              onChange={(event) => move(task.id, event.target.value as PlanStatus)}
                              className="select !w-auto !px-1 !py-0.5 text-[9px]"
                              aria-label={`Status for ${task.title}`}
                            >
                              {PLAN_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                  {PLAN_STATUS_META[option].short}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={pending || index === PLAN_STATUSES.length - 1}
                              onClick={() => move(task.id, PLAN_STATUSES[index + 1])}
                              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                              aria-label={`Move ${task.title} forward`}
                            >
                              <ArrowRight className="size-3" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {columnTasks.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
                      Drop a task here
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="thin-scroll overflow-x-auto p-4">
          <div className="min-w-[920px]">
            <div className="flex border-b border-slate-200 pb-2">
              <div className="w-56 shrink-0 px-2 pt-5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Task
              </div>
              <div className="relative h-7 flex-1">
                {Array.from({ length: 8 }, (_, index) => (
                  <span className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${index * 100 / 7}%` }} key={`grid-${index}`} />
                ))}
                {timeline.ticks.map((tick, index) => (
                  <span
                    key={`tick-${index}`}
                    className="absolute top-1 -translate-x-1/2 text-[9px] font-semibold text-slate-400"
                    style={{ left: `${timeline.position(tick)}%` }}
                  >
                    {tick.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                ))}
                <span
                  className="absolute inset-y-0 w-px bg-rose-400"
                  style={{ left: `${timeline.position(timeline.today)}%` }}
                  title="Today"
                />
              </div>
            </div>

            <div>
              {tasks.map((task) => {
                const meta = PLAN_STATUS_META[task.status];
                const start = task.startAt ? new Date(task.startAt) : null;
                const due = task.dueAt ? new Date(task.dueAt) : null;
                const left = start ? timeline.position(start) : 0;
                const width = start && due
                  ? clamp(timeline.position(due) - left + 100 / timeline.totalDays, 2, 100 - left)
                  : 0;
                return (
                  <div key={task.id} className="flex items-center border-b border-slate-100 py-2.5 last:border-b-0">
                    <div className="w-56 shrink-0 px-2">
                      <p className="truncate text-[11px] font-semibold text-slate-800">{task.title}</p>
                      <p className="truncate text-[9px] text-slate-400">{task.stageTitle ?? "No stage"}</p>
                    </div>
                    <div className="relative h-8 flex-1 rounded-lg bg-slate-50/70">
                      {Array.from({ length: 8 }, (_, index) => (
                        <span className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${index * 100 / 7}%` }} key={`row-grid-${index}`} />
                      ))}
                      <span
                        className="absolute inset-y-0 w-px bg-rose-300"
                        style={{ left: `${timeline.position(timeline.today)}%` }}
                      />
                      {start && due && width > 0 ? (
                        <div
                          className={cn(
                            "absolute top-1.5 flex h-5 items-center overflow-hidden rounded-md px-2 text-[9px] font-bold text-white shadow-sm",
                            meta.bar
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${task.title}: ${formatDate(start)} – ${formatDate(due)}`}
                        >
                          <span className="truncate">{meta.short}</span>
                        </div>
                      ) : (
                        <span className="absolute top-2 left-2 text-[9px] text-slate-400">No dates scheduled</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-400" /> Today marker · bars span start to due date
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
