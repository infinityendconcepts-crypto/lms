/**
 * Workspace reporting aggregates. Kept outside app routes so the reporting
 * page and CSV export share one tenant-scoped source of truth.
 */
import { db } from "@/lib/db";
import { buildStudentFeatures } from "@/lib/ai/analytics";
import { RISK_BANDS, type RiskBand } from "@/lib/ai/format";

export type ReportCourseRow = {
  id: string;
  title: string;
  status: string;
  learners: number;
  assessments: number;
  attempts: number;
  averageScore: number;
  passRate: number;
  attendanceRate: number;
  lessonCompletion: number;
};

export type ReportLearnerRow = {
  id: string;
  name: string;
  email: string;
  courses: number;
  attempts: number;
  averageScore: number;
  attendanceRate: number;
  lessonCompletion: number;
  successProbability: number;
  band: RiskBand;
};

export type ReportAttemptRow = {
  id: string;
  studentName: string;
  studentEmail: string;
  assessmentTitle: string;
  courseTitle: string;
  status: string;
  score: number;
  startedAt: string | null;
  submittedAt: string | null;
};

export type WorkspaceReport = {
  generatedAt: string;
  courseId: string | null;
  learners: number;
  courses: number;
  assessments: number;
  attempts: number;
  scoredAttempts: number;
  passedAttempts: number;
  gradedAttempts: number;
  pendingGrading: number;
  inProgress: number;
  averageScore: number;
  passRate: number;
  attendanceRate: number;
  attendance: { PRESENT: number; LATE: number; ABSENT: number; EXCUSED: number };
  lessonCompletion: number;
  averageOutlook: number;
  riskBands: Record<RiskBand, number>;
  courseRows: ReportCourseRow[];
  learnerRows: ReportLearnerRow[];
  attemptRows: ReportAttemptRow[];
};

const round = (value: number) => Math.round(value);

function scorePercent(score: number | null, maxScore: number) {
  return maxScore > 0 ? Math.round(((score ?? 0) / maxScore) * 100) : 0;
}

function mean(values: number[]) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function attendanceRate(records: { status: string }[]) {
  if (records.length === 0) return 0;
  const counted = records.filter((record) => record.status !== "EXCUSED").length;
  if (counted === 0) return 0;
  const present = records.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
  return round((present / counted) * 100);
}

export async function getWorkspaceReport(
  tenantId: string,
  courseId?: string | null
): Promise<WorkspaceReport> {
  const courseFilter = courseId ? { id: courseId, tenantId } : { tenantId };
  const attendanceFilter = courseId ? { tenantId, courseId } : { tenantId };

  const [courses, enrollments, assessments, attempts, attendanceRecords, publishedLessons, completions, studentCount, features] =
    await Promise.all([
      db.course.findMany({
        where: courseFilter,
        select: { id: true, title: true, status: true },
        orderBy: { title: "asc" },
      }),
      db.enrollment.findMany({
        where: { tenantId, ...(courseId ? { courseId } : {}) },
        select: { courseId: true, userId: true },
      }),
      db.assessment.findMany({
        where: { tenantId, ...(courseId ? { courseId } : {}) },
        select: { id: true, courseId: true },
      }),
      db.attempt.findMany({
        where: { tenantId, ...(courseId ? { assessment: { courseId } } : {}) },
        include: {
          assessment: { select: { title: true, courseId: true, passScore: true } },
          student: { select: { name: true, email: true } },
        },
        orderBy: { startedAt: "desc" },
      }),
      db.attendanceRecord.findMany({
        where: { session: attendanceFilter },
        select: { status: true, session: { select: { courseId: true } } },
      }),
      db.lesson.findMany({
        where: { published: true, course: courseFilter },
        select: { id: true, courseId: true },
      }),
      db.lessonCompletion.findMany({
        where: { lesson: { course: courseFilter } },
        select: { lessonId: true, lesson: { select: { courseId: true } } },
      }),
      db.membership.count({ where: { tenantId, role: "STUDENT" } }),
      buildStudentFeatures(db, { tenantId, courseId: courseId ?? null }),
    ]);

  const scoredAttempts = attempts.filter((attempt) => attempt.status !== "IN_PROGRESS" && attempt.maxScore > 0);
  const percentages = scoredAttempts.map((attempt) => scorePercent(attempt.score, attempt.maxScore));
  const passed = scoredAttempts.filter(
    (attempt) => scorePercent(attempt.score, attempt.maxScore) >= (attempt.assessment.passScore || 50)
  ).length;

  const attendanceCounts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const record of attendanceRecords) {
    if (record.status in attendanceCounts) {
      attendanceCounts[record.status as keyof typeof attendanceCounts] += 1;
    }
  }

  const scopedLearnerIds = courseId
    ? new Set(enrollments.map((enrollment) => enrollment.userId))
    : new Set(features.map((feature) => feature.studentId));
  const learnerCount = courseId ? scopedLearnerIds.size : studentCount || scopedLearnerIds.size;
  const expectedCompletions = publishedLessons.length * Math.max(1, learnerCount);

  const riskBands = RISK_BANDS.reduce(
    (bands, band) => {
      bands[band] = 0;
      return bands;
    },
    {} as Record<RiskBand, number>
  );
  for (const feature of features) riskBands[feature.heuristic.riskBand] += 1;
  const averageOutlook = features.length
    ? round(features.reduce((sum, feature) => sum + feature.heuristic.successProbability, 0) / features.length)
    : 0;

  const courseRows: ReportCourseRow[] = courses.map((course) => {
    const courseEnrollments = enrollments.filter((enrollment) => enrollment.courseId === course.id);
    const courseAttempts = attempts.filter((attempt) => attempt.assessment.courseId === course.id);
    const courseScored = courseAttempts.filter(
      (attempt) => attempt.status !== "IN_PROGRESS" && attempt.maxScore > 0
    );
    const coursePassed = courseScored.filter(
      (attempt) => scorePercent(attempt.score, attempt.maxScore) >= (attempt.assessment.passScore || 50)
    ).length;
    const courseRecords = attendanceRecords.filter((record) => record.session.courseId === course.id);
    const courseLessons = publishedLessons.filter((lesson) => lesson.courseId === course.id);
    const courseCompletions = completions.filter((completion) => completion.lesson.courseId === course.id);
    const courseLearners = new Set(courseEnrollments.map((enrollment) => enrollment.userId)).size;
    const expected = courseLessons.length * Math.max(1, courseLearners);

    return {
      id: course.id,
      title: course.title,
      status: course.status,
      learners: courseLearners,
      assessments: assessments.filter((assessment) => assessment.courseId === course.id).length,
      attempts: courseAttempts.length,
      averageScore: mean(courseScored.map((attempt) => scorePercent(attempt.score, attempt.maxScore))),
      passRate: courseScored.length ? round((coursePassed / courseScored.length) * 100) : 0,
      attendanceRate: attendanceRate(courseRecords),
      lessonCompletion: expected ? Math.min(100, round((courseCompletions.length / expected) * 100)) : 0,
    };
  });

  const learnerRows: ReportLearnerRow[] = features
    .map((feature) => ({
      id: feature.studentId,
      name: feature.studentName,
      email: feature.studentEmail,
      courses: feature.courseIds.length,
      attempts: feature.grades.gradedAttempts,
      averageScore: feature.grades.average ?? 0,
      attendanceRate: feature.attendance.attendanceRate ?? 0,
      lessonCompletion: feature.learning.lessonCompletion ?? 0,
      successProbability: feature.heuristic.successProbability,
      band: feature.heuristic.riskBand,
    }))
    .sort((a, b) => a.successProbability - b.successProbability);

  const attemptRows: ReportAttemptRow[] = attempts.map((attempt) => ({
    id: attempt.id,
    studentName: attempt.student.name,
    studentEmail: attempt.student.email,
    assessmentTitle: attempt.assessment.title,
    courseTitle: courses.find((course) => course.id === attempt.assessment.courseId)?.title ?? "—",
    status: attempt.status,
    score: scorePercent(attempt.score, attempt.maxScore),
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    courseId: courseId ?? null,
    learners: learnerCount,
    courses: courses.length,
    assessments: assessments.length,
    attempts: attempts.length,
    scoredAttempts: scoredAttempts.length,
    passedAttempts: passed,
    gradedAttempts: attempts.filter((attempt) => attempt.status === "GRADED").length,
    pendingGrading: attempts.filter((attempt) => attempt.status === "SUBMITTED").length,
    inProgress: attempts.filter((attempt) => attempt.status === "IN_PROGRESS").length,
    averageScore: mean(percentages),
    passRate: scoredAttempts.length ? round((passed / scoredAttempts.length) * 100) : 0,
    attendanceRate: attendanceRate(attendanceRecords),
    attendance: attendanceCounts,
    lessonCompletion: expectedCompletions
      ? Math.min(100, round((completions.length / expectedCompletions) * 100))
      : 0,
    averageOutlook,
    riskBands,
    courseRows,
    learnerRows,
    attemptRows,
  };
}
