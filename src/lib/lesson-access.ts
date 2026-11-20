/**
 * Client-safe helpers for lesson availability rules. Prerequisites are stored
 * as a JSON string on Lesson, and all rules are evaluated against a snapshot
 * of the sibling lessons so the same logic can run in server pages, actions
 * and the learner UI.
 */

import { formatDate } from "@/lib/utils";

export type LessonAvailability = {
  id: string;
  title: string;
  prerequisiteIds?: unknown;
  opensAt?: Date | string | null;
  closesAt?: Date | string | null;
};

/** Accept both the stored JSON string and FormData checkbox values. */
export function parsePrerequisiteIds(value: unknown): string[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const ids = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Check whether the proposed prerequisite list would create a dependency
 * cycle, directly or through another lesson in the same course.
 */
export function hasPrerequisiteCycle({
  lessonId,
  prerequisiteIds,
  lessons,
}: {
  lessonId: string;
  prerequisiteIds: string[];
  lessons: LessonAvailability[];
}) {
  const graph = new Map<string, string[]>();
  for (const lesson of lessons) {
    graph.set(
      lesson.id,
      lesson.id === lessonId ? prerequisiteIds : parsePrerequisiteIds(lesson.prerequisiteIds)
    );
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function reaches(targetId: string, fromId: string): boolean {
    if (fromId === targetId) return true;
    if (visited.has(fromId) || visiting.has(fromId)) return false;
    visiting.add(fromId);
    for (const prerequisite of graph.get(fromId) ?? []) {
      if (reaches(targetId, prerequisite)) return true;
    }
    visiting.delete(fromId);
    visited.add(fromId);
    return false;
  }

  return prerequisiteIds.some((id) => reaches(lessonId, id));
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Return the first reason a learner cannot open a lesson, or null when it is
 * available. Teachers bypass both prerequisites and the schedule.
 */
export function getLessonLockReason({
  lesson,
  lessons,
  completedLessonIds,
  now,
  teacher = false,
}: {
  lesson: LessonAvailability;
  lessons: LessonAvailability[];
  completedLessonIds: ReadonlySet<string>;
  now: number;
  teacher?: boolean;
}) {
  if (teacher) return null;

  const opensAt = asDate(lesson.opensAt);
  if (opensAt && opensAt.getTime() > now) return `Opens ${formatDate(opensAt, true)}`;

  const closesAt = asDate(lesson.closesAt);
  if (closesAt && closesAt.getTime() < now) return `Closed ${formatDate(closesAt, true)}`;

  const titles = new Map(lessons.map((item) => [item.id, item.title]));
  const missing = parsePrerequisiteIds(lesson.prerequisiteIds).filter(
    (id) => !completedLessonIds.has(id)
  );
  if (missing.length === 0) return null;

  const names = missing.map((id) => titles.get(id) || "another lesson");
  if (names.length === 1) return `Complete "${names[0]}" first`;
  if (names.length === 2) return `Complete "${names[0]}" and "${names[1]}" first`;
  return `Complete ${names.length} prerequisite lessons first`;
}
