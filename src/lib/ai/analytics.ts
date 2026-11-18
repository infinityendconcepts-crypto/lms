/**
 * Student success analytics.
 *
 * This module deliberately has no `server-only` import and no path aliases so
 * the demo seed can reuse it. It builds explainable features from attendance,
 * grades, submission behaviour and engagement, then produces a calibrated
 * baseline prediction. A hosted LLM can refine that baseline later.
 */
import type { PrismaClient } from "@prisma/client";
import { riskBandFor, type RiskBand } from "./format";

const DAY = 86_400_000;

export type DriverImpact = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type BenchmarkDriver = {
  label: string;
  impact: DriverImpact;
  detail: string;
};

export type HeuristicPrediction = {
  successProbability: number;
  confidence: number;
  riskBand: RiskBand;
  headline: string;
  summary: string;
  drivers: BenchmarkDriver[];
  recommendations: string[];
};

export type StudentFeatureBase = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  avatarUrl: string | null;
  courseIds: string[];
  courseTitles: string[];
  enrolledCourseIds: string[];
  attendance: {
    registers: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    attendanceRate: number | null;
    recentRate: number | null;
    absenceStreak: number;
    excusedShare: number | null;
    lastAttendedAt: string | null;
  };
  grades: {
    gradedAttempts: number;
    submittedAttempts: number;
    average: number | null;
    passRate: number | null;
    trend: number | null;
    best: number | null;
    worst: number | null;
    averageTimeSpentSec: number | null;
    lateSubmissions: number;
    overdueAssessments: number;
    assessmentCompletion: number | null;
    publishedAssessments: number;
  };
  learning: {
    lessonsPublished: number;
    lessonsCompleted: number;
    lessonCompletion: number | null;
  };
  engagement: {
    lastActivityAt: string | null;
    daysSinceLastActivity: number | null;
    activeDays30: number;
  };
  dataPoints?: number;
};

export type StudentFeatures = StudentFeatureBase & {
  dataPoints: number;
  heuristic: HeuristicPrediction;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n);
const pctOf = (score: number | null, max: number) =>
  score !== null && max > 0 ? (score / max) * 100 : null;

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Build features for every (or a subset of) learner in a tenant.
 * A course filter narrows attendance, assessments and lessons to that course.
 */
export async function buildStudentFeatures(
  db: PrismaClient,
  opts: { tenantId: string; courseId?: string | null; studentIds?: string[] }
): Promise<StudentFeatures[]> {
  const { tenantId, courseId } = opts;

  const memberships = await db.membership.findMany({
    where: {
      tenantId,
      role: "STUDENT",
      ...(opts.studentIds && opts.studentIds.length
        ? { userId: { in: opts.studentIds } }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  if (memberships.length === 0) return [];
  const studentIds = memberships.map((m) => m.userId);

  const courses = await db.course.findMany({
    where: { tenantId, ...(courseId ? { id: courseId } : {}) },
    select: {
      id: true,
      title: true,
      lessons: { where: { published: true }, select: { id: true } },
      assessments: {
        where: { status: "PUBLISHED" },
        select: { id: true, passScore: true, dueAt: true },
      },
    },
  });
  if (courses.length === 0) return [];
  const courseIds = courses.map((c) => c.id);
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const lessonCourse = new Map<string, string>();
  for (const course of courses) {
    for (const lesson of course.lessons) lessonCourse.set(lesson.id, course.id);
  }

  const [enrollments, attendanceSessions, attempts, completions] = await Promise.all([
    db.enrollment.findMany({
      where: { tenantId, userId: { in: studentIds }, courseId: { in: courseIds } },
      select: { userId: true, courseId: true },
    }),
    db.attendanceSession.findMany({
      where: { tenantId, courseId: { in: courseIds } },
      select: {
        id: true,
        courseId: true,
        date: true,
        records: {
          where: { studentId: { in: studentIds } },
          select: { studentId: true, status: true },
        },
      },
      orderBy: { date: "desc" },
    }),
    db.attempt.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        assessment: { courseId: { in: courseIds } },
      },
      select: {
        studentId: true,
        status: true,
        score: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        timeSpentSec: true,
        assessment: { select: { id: true, courseId: true, passScore: true, dueAt: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    db.lessonCompletion.findMany({
      where: { userId: { in: studentIds }, lesson: { courseId: { in: courseIds } } },
      select: { userId: true, lessonId: true, completedAt: true },
    }),
  ]);

  const now = Date.now();
  const recentCutoff = now - 30 * DAY;

  return memberships.map((membership) => {
    const student = membership.user;

    const enrolledCourseIds = new Set(
      enrollments.filter((e) => e.userId === student.id).map((e) => e.courseId)
    );
    const studentRecords = attendanceSessions.flatMap((session) =>
      session.records
        .filter((record) => record.studentId === student.id)
        .map((record) => ({
          status: record.status,
          courseId: session.courseId,
          date: session.date,
        }))
    );
    const studentAttempts = attempts.filter((a) => a.studentId === student.id);
    const studentCompletions = completions.filter((c) => c.userId === student.id);

    // Any course where the learner has a signal (enrolment, mark, attempt or
    // completed lesson) describes their experience, even if they later left.
    const signalCourseIds = new Set<string>(enrolledCourseIds);
    for (const record of studentRecords) signalCourseIds.add(record.courseId);
    for (const attempt of studentAttempts) signalCourseIds.add(attempt.assessment.courseId);
    for (const completion of studentCompletions) {
      const course = lessonCourse.get(completion.lessonId);
      if (course) signalCourseIds.add(course);
    }
    const scope = [...signalCourseIds]
      .map((id) => courseMap.get(id))
      .filter((course): course is (typeof courses)[number] => Boolean(course));

    const publishedAssessments = scope.flatMap((course) =>
      course.assessments.map((assessment) => ({ ...assessment, courseId: course.id }))
    );
    const publishedLessons = scope.flatMap((course) =>
      course.lessons.map((lesson) => ({ ...lesson, courseId: course.id }))
    );
    const publishedLessonIds = new Set(publishedLessons.map((l) => l.id));

    // ── attendance ────────────────────────────────────────────────────────
    const sortedRecords = [...studentRecords].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
    const present = sortedRecords.filter((r) => r.status === "PRESENT").length;
    const late = sortedRecords.filter((r) => r.status === "LATE").length;
    const absent = sortedRecords.filter((r) => r.status === "ABSENT").length;
    const excused = sortedRecords.filter((r) => r.status === "EXCUSED").length;
    const considered = present + late + absent;
    const attendanceRate = considered > 0 ? round(((present + late) / considered) * 100) : null;

    const recentRecords = sortedRecords.filter((r) => r.date.getTime() >= recentCutoff);
    const recentConsidered =
      recentRecords.filter((r) => r.status !== "EXCUSED").length;
    const recentAttended = recentRecords.filter(
      (r) => r.status === "PRESENT" || r.status === "LATE"
    ).length;
    const recentRate =
      recentConsidered > 0 ? round((recentAttended / recentConsidered) * 100) : null;

    let absenceStreak = 0;
    for (const record of sortedRecords) {
      if (record.status === "ABSENT") absenceStreak += 1;
      else break;
    }

    const lastAttended = sortedRecords.find(
      (r) => r.status === "PRESENT" || r.status === "LATE"
    );

    // ── grades ────────────────────────────────────────────────────────────
    const scored = studentAttempts.filter(
      (a) => a.status !== "IN_PROGRESS" && a.score !== null && a.maxScore > 0
    );
    const scoreSum = scored.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const maxSum = scored.reduce((sum, a) => sum + a.maxScore, 0);
    const average = maxSum > 0 ? round((scoreSum / maxSum) * 100) : null;
    const percentages = scored
      .map((a) => pctOf(a.score, a.maxScore))
      .filter((n): n is number => n !== null);
    const passRate =
      percentages.length > 0
        ? round(
            (scored.filter((a) => {
              const pct = pctOf(a.score, a.maxScore);
              return pct !== null && pct >= a.assessment.passScore;
            }).length /
              percentages.length) *
              100
          )
        : null;

    const chronological = [...scored].sort(
      (a, b) =>
        (a.submittedAt ?? a.startedAt).getTime() - (b.submittedAt ?? b.startedAt).getTime()
    );
    let trend: number | null = null;
    if (chronological.length >= 2) {
      const mid = Math.ceil(chronological.length / 2);
      const earlier = chronological.slice(0, mid);
      const recent = chronological.slice(mid);
      if (recent.length > 0) {
        trend = round(
          mean(recent.map((a) => pctOf(a.score, a.maxScore) ?? 0)) -
            mean(earlier.map((a) => pctOf(a.score, a.maxScore) ?? 0))
        );
      }
    }

    const submittedAttempts = studentAttempts.filter((a) =>
      ["SUBMITTED", "GRADED"].includes(a.status)
    ).length;
    const lateSubmissions = studentAttempts.filter(
      (a) =>
        a.submittedAt !== null && a.assessment.dueAt !== null
          ? a.submittedAt.getTime() > a.assessment.dueAt.getTime()
          : false
    ).length;
    const completedAssessmentIds = new Set(
      studentAttempts
        .filter((a) => ["SUBMITTED", "GRADED"].includes(a.status))
        .map((a) => a.assessment.id)
    );
    const relevantPublished = publishedAssessments.filter((a) =>
      signalCourseIds.has(a.courseId)
    );
    const completedPublished = relevantPublished.filter((a) =>
      completedAssessmentIds.has(a.id)
    ).length;
    const assessmentCompletion =
      relevantPublished.length > 0
        ? round((completedPublished / relevantPublished.length) * 100)
        : null;
    const overdueAssessments = relevantPublished.filter(
      (a) => a.dueAt !== null && a.dueAt.getTime() < now && !completedAssessmentIds.has(a.id)
    ).length;

    const withTime = studentAttempts.filter((a) => a.timeSpentSec > 0);
    const averageTimeSpentSec =
      withTime.length > 0 ? round(mean(withTime.map((a) => a.timeSpentSec))) : null;

    // ── learning ──────────────────────────────────────────────────────────
    const relevantLessons = publishedLessons.filter((lesson) =>
      signalCourseIds.has(lesson.courseId)
    );
    const completedLessonIds = new Set(
      studentCompletions
        .filter((c) => publishedLessonIds.has(c.lessonId))
        .map((c) => c.lessonId)
    );
    const lessonsCompleted = relevantLessons.filter((lesson) =>
      completedLessonIds.has(lesson.id)
    ).length;
    const lessonCompletion =
      relevantLessons.length > 0
        ? round((lessonsCompleted / relevantLessons.length) * 100)
        : null;

    // ── engagement ────────────────────────────────────────────────────────
    const activityDates: Date[] = [
      ...studentAttempts
        .map((a) => a.submittedAt ?? a.startedAt)
        .filter((d): d is Date => Boolean(d)),
      ...studentCompletions.map((c) => c.completedAt),
      ...sortedRecords.map((r) => r.date),
    ].sort((a, b) => b.getTime() - a.getTime());
    const lastActivity = activityDates[0] ?? null;
    const daysSinceLastActivity = lastActivity
      ? Math.max(0, Math.floor((now - lastActivity.getTime()) / DAY))
      : null;
    const activeDays30 = new Set(
      activityDates
        .filter((date) => date.getTime() >= recentCutoff)
        .map((date) => dayKey(date))
    ).size;

    const dataPoints =
      sortedRecords.length +
      scored.length +
      studentCompletions.length +
      studentAttempts.filter((a) => a.status !== "IN_PROGRESS").length;

    const base: StudentFeatureBase = {
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      avatarUrl: student.avatarUrl,
      courseIds: scope.map((course) => course.id),
      courseTitles: scope.map((course) => course.title),
      enrolledCourseIds: [...enrolledCourseIds],
      attendance: {
        registers: sortedRecords.length,
        present,
        late,
        absent,
        excused,
        attendanceRate,
        recentRate,
        absenceStreak,
        excusedShare:
          sortedRecords.length > 0
            ? round((excused / sortedRecords.length) * 100)
            : null,
        lastAttendedAt: lastAttended ? lastAttended.date.toISOString() : null,
      },
      grades: {
        gradedAttempts: scored.length,
        submittedAttempts,
        average,
        passRate,
        trend,
        best: percentages.length > 0 ? round(Math.max(...percentages)) : null,
        worst: percentages.length > 0 ? round(Math.min(...percentages)) : null,
        averageTimeSpentSec,
        lateSubmissions,
        overdueAssessments,
        assessmentCompletion,
        publishedAssessments: relevantPublished.length,
      },
      learning: {
        lessonsPublished: relevantLessons.length,
        lessonsCompleted,
        lessonCompletion,
      },
      engagement: {
        lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
        daysSinceLastActivity,
        activeDays30,
      },
    };

    return { ...base, dataPoints, heuristic: heuristicFor(base) };
  });
}

/** Deterministic, explainable baseline model. */
export function heuristicFor(features: StudentFeatureBase): HeuristicPrediction {
  const { attendance, grades, learning, engagement } = features;

  const parts: { weight: number; value: number }[] = [];
  if (grades.average !== null) parts.push({ weight: 0.34, value: grades.average / 100 });
  if (attendance.attendanceRate !== null) {
    parts.push({ weight: 0.26, value: attendance.attendanceRate / 100 });
  }
  if (grades.assessmentCompletion !== null) {
    parts.push({ weight: 0.14, value: grades.assessmentCompletion / 100 });
  }
  if (learning.lessonCompletion !== null) {
    parts.push({ weight: 0.1, value: learning.lessonCompletion / 100 });
  }
  if (engagement.daysSinceLastActivity !== null) {
    parts.push({
      weight: 0.09,
      value: Math.exp(-engagement.daysSinceLastActivity / 21),
    });
  }
  if (grades.trend !== null) {
    parts.push({ weight: 0.05, value: clamp(0.5 + grades.trend / 40, 0, 1) });
  }

  let score = 0.5;
  if (parts.length > 0) {
    const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
    score = parts.reduce((sum, p) => sum + p.weight * p.value, 0) / totalWeight;
  }

  // Behavioural penalties. These are deliberately modest: the baseline is a
  // conversation starter, not a verdict.
  score -= Math.min(0.12, grades.overdueAssessments * 0.035);
  score -= Math.min(0.06, grades.lateSubmissions * 0.02);
  score -= Math.min(0.1, attendance.absenceStreak * 0.03);
  if (attendance.excusedShare !== null && attendance.excusedShare > 30) {
    score -= Math.min(0.06, ((attendance.excusedShare - 30) / 100) * 0.25);
  }
  score = clamp(score, 0.02, 0.98);

  const probability = round((1 / (1 + Math.exp(-5.5 * (score - 0.52)))) * 100);

  let confidence = 15;
  confidence += Math.min(35, grades.gradedAttempts * 7);
  confidence += Math.min(20, attendance.registers * 2);
  confidence += Math.min(10, learning.lessonsCompleted * 1.5);
  confidence += Math.min(10, engagement.activeDays30 * 1.2);
  if (engagement.daysSinceLastActivity !== null && engagement.daysSinceLastActivity > 21) {
    confidence -= 12;
  }
  if (grades.average === null) confidence -= 8;
  if (attendance.attendanceRate === null) confidence -= 8;
  if (features.dataPoints === 0) confidence = 5;
  confidence = clamp(round(confidence), 5, 95);

  const band = riskBandFor(probability);
  const headline =
    probability >= 75
      ? "On track"
      : probability >= 60
        ? "Steady — keep watching"
        : probability >= 40
          ? "Needs support"
          : "Urgent support needed";

  const facts: string[] = [];
  if (attendance.attendanceRate !== null) {
    facts.push(
      `${attendance.attendanceRate}% attendance across ${attendance.registers} register${
        attendance.registers === 1 ? "" : "s"
      }`
    );
  }
  if (grades.average !== null) {
    facts.push(
      `${grades.average}% average across ${grades.gradedAttempts} graded task${
        grades.gradedAttempts === 1 ? "" : "s"
      }`
    );
  }
  if (grades.assessmentCompletion !== null && grades.publishedAssessments > 0) {
    facts.push(
      `${grades.assessmentCompletion}% of ${grades.publishedAssessments} published assessments submitted`
    );
  }
  if (engagement.daysSinceLastActivity !== null) {
    facts.push(
      engagement.daysSinceLastActivity <= 0
        ? "active today"
        : `last active ${engagement.daysSinceLastActivity} day${
            engagement.daysSinceLastActivity === 1 ? "" : "s"
          } ago`
    );
  }

  const firstName = features.studentName.split(/\s+/)[0] || "This learner";
  const summary =
    facts.length > 0
      ? `${firstName} has ${facts.join(", ")}. ${bandDescription(band)}`
      : `There is not enough activity yet to estimate ${firstName}'s trajectory. ${bandDescription(band)}`;

  const drivers: BenchmarkDriver[] = [];
  const add = (label: string, impact: DriverImpact, detail: string) =>
    drivers.push({ label, impact, detail });

  add(
    "Attendance",
    attendance.attendanceRate === null
      ? "NEUTRAL"
      : attendance.attendanceRate >= 90
        ? "POSITIVE"
        : attendance.attendanceRate < 75
          ? "NEGATIVE"
          : "NEUTRAL",
    attendance.attendanceRate === null
      ? "No attendance registers on record yet."
      : `${attendance.attendanceRate}% attendance · ${attendance.present}P / ${attendance.late}L / ${attendance.absent}A / ${attendance.excused}E across ${attendance.registers} marks.`
  );

  add(
    "Task grades",
    grades.average === null
      ? "NEUTRAL"
      : grades.average >= 80
        ? "POSITIVE"
        : grades.average < 60
          ? "NEGATIVE"
          : "NEUTRAL",
    grades.average === null
      ? "No graded tasks yet."
      : `${grades.average}% average across ${grades.gradedAttempts} graded task${
          grades.gradedAttempts === 1 ? "" : "s"
        }${grades.passRate !== null ? ` · ${grades.passRate}% passed` : ""}.`
  );

  if (grades.assessmentCompletion !== null) {
    add(
      "Submission completeness",
      grades.assessmentCompletion >= 90
        ? "POSITIVE"
        : grades.assessmentCompletion < 70
          ? "NEGATIVE"
          : "NEUTRAL",
      `${grades.assessmentCompletion}% of ${grades.publishedAssessments} published assessments submitted.`
    );
  }

  if (grades.trend !== null && Math.abs(grades.trend) >= 3) {
    add(
      "Grade trend",
      grades.trend > 0 ? "POSITIVE" : "NEGATIVE",
      `${grades.trend > 0 ? "+" : ""}${grades.trend} points in recent work versus earlier work.`
    );
  }

  if (engagement.daysSinceLastActivity !== null) {
    add(
      "Engagement recency",
      engagement.daysSinceLastActivity <= 3
        ? "POSITIVE"
        : engagement.daysSinceLastActivity > 10
          ? "NEGATIVE"
          : "NEUTRAL",
      engagement.daysSinceLastActivity <= 0
        ? "Active today."
        : `Last activity ${engagement.daysSinceLastActivity} day${
            engagement.daysSinceLastActivity === 1 ? "" : "s"
          } ago · ${engagement.activeDays30} active day${
            engagement.activeDays30 === 1 ? "" : "s"
          } in the last 30.`
    );
  }

  if (attendance.excused > 0) {
    add(
      "Excused absence pattern",
      attendance.excusedShare !== null && attendance.excusedShare >= 25
        ? "NEGATIVE"
        : "NEUTRAL",
      `${attendance.excused} excused absence${
        attendance.excused === 1 ? "" : "s"
      } · ${attendance.excusedShare ?? 0}% of marks. Confirm documentation and make-up work.`
    );
  }

  if (grades.overdueAssessments > 0) {
    add(
      "Overdue work",
      "NEGATIVE",
      `${grades.overdueAssessments} published assessment${
        grades.overdueAssessments === 1 ? " is" : "s are"
      } past due with no submission.`
    );
  }

  if (attendance.absenceStreak >= 2) {
    add(
      "Absence streak",
      "NEGATIVE",
      `${attendance.absenceStreak} consecutive absences on the latest registers.`
    );
  }

  if (learning.lessonCompletion !== null && learning.lessonsPublished > 0) {
    add(
      "Lesson progress",
      learning.lessonCompletion >= 80
        ? "POSITIVE"
        : learning.lessonCompletion < 40
          ? "NEGATIVE"
          : "NEUTRAL",
      `${learning.lessonsCompleted} of ${learning.lessonsPublished} published lessons completed (${learning.lessonCompletion}%).`
    );
  }

  const recommendations: string[] = [];
  if (features.dataPoints === 0) {
    recommendations.push(
      "Collect at least one register and one graded task before acting on this estimate."
    );
  }
  if (attendance.attendanceRate !== null && attendance.attendanceRate < 80) {
    recommendations.push(
      "Contact the learner or guardian about attendance and agree a catch-up plan."
    );
  }
  if (attendance.absenceStreak >= 2) {
    recommendations.push(
      `Schedule a check-in after ${attendance.absenceStreak} consecutive absences.`
    );
  }
  if (grades.average !== null && grades.average < 60) {
    recommendations.push(
      "Review the last graded attempt together and assign targeted practice on weak topics."
    );
  }
  if (
    (grades.assessmentCompletion !== null && grades.assessmentCompletion < 70) ||
    grades.overdueAssessments > 0
  ) {
    recommendations.push(
      "Agree a plan for missing assessments; extend deadlines where absences were excused."
    );
  }
  if (
    engagement.daysSinceLastActivity !== null &&
    engagement.daysSinceLastActivity > 10
  ) {
    recommendations.push(
      `Send a re-engagement nudge — no activity for ${engagement.daysSinceLastActivity} days.`
    );
  }
  if (attendance.excusedShare !== null && attendance.excusedShare >= 25) {
    recommendations.push(
      "Confirm excused absences are documented and set make-up work for missed sessions."
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      probability >= 75
        ? "Keep the current routine and consider enrichment work."
        : "Keep monitoring the next register and graded task for a clearer picture."
    );
  }

  return {
    successProbability: probability,
    confidence,
    riskBand: band,
    headline,
    summary,
    drivers: drivers.slice(0, 7),
    recommendations: recommendations.slice(0, 4),
  };
}

function bandDescription(band: RiskBand) {
  switch (band) {
    case "ON_TRACK":
      return "Signals suggest they are likely to stay on track.";
    case "WATCH":
      return "They are broadly steady but worth watching.";
    case "AT_RISK":
      return "Several signals suggest they need support soon.";
    case "CRITICAL":
      return "Attendance, grades or engagement have broken down enough to need urgent support.";
  }
}

/** Compact, pseudonymous payload sent to an external model. */
export function aiPayload(features: StudentFeatures) {
  return {
    studentId: features.studentId,
    firstName: features.studentName.split(/\s+/)[0],
    courses: features.courseTitles,
    attendance: features.attendance,
    grades: features.grades,
    learning: features.learning,
    engagement: features.engagement,
    baseline: {
      successProbability: features.heuristic.successProbability,
      confidence: features.heuristic.confidence,
      riskBand: features.heuristic.riskBand,
      drivers: features.heuristic.drivers.map((d) => `${d.label}: ${d.detail}`),
    },
  };
}

export function parseJsonArray<T>(value: string, fallback: T[] = []): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
