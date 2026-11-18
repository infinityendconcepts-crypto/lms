import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";
import { resolveRuntime } from "./benchmark";
import { callProvider, extractJson } from "./providers";

export type EligibilityStatus = "QUALIFIED" | "PROVISIONAL" | "NOT_QUALIFIED";
export type ReasonStatus = "PASS" | "WARN" | "FAIL";

export type EligibilityReason = {
  label: string;
  status: ReasonStatus;
  detail: string;
};

export type EligibilitySnapshot = {
  status: EligibilityStatus;
  score: number;
  confidence: number;
  summary: string;
  reasons: EligibilityReason[];
  source: "HEURISTIC" | "AI";
  provider: string | null;
  model: string | null;
  error: string | null;
  placementAttemptId: string | null;
};

export type EligibilityInput = {
  tenantId: string;
  courseId: string;
  studentId: string;
  providerChoice?: string;
  actorId?: string | null;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n);
const percent = (score: number | null | undefined, max: number | null | undefined) =>
  score !== null &&
  score !== undefined &&
  max !== null &&
  max !== undefined &&
  max > 0
    ? (score / max) * 100
    : null;

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const AiEligibilitySchema = z.object({
  status: z.enum(["QUALIFIED", "PROVISIONAL", "NOT_QUALIFIED"]).optional(),
  score: z.number().optional(),
  confidence: z.number().optional(),
  summary: z.string().optional(),
  reasons: z
    .array(
      z.object({
        label: z.string(),
        status: z.enum(["PASS", "WARN", "FAIL"]).optional(),
        detail: z.string(),
      })
    )
    .optional(),
});

function normaliseReasons(
  reasons: z.infer<typeof AiEligibilitySchema>["reasons"],
  fallback: EligibilityReason[]
): EligibilityReason[] {
  if (!reasons || reasons.length === 0) return fallback;
  return reasons.slice(0, 8).map((reason) => ({
    label: reason.label.trim().slice(0, 90) || "Check",
    status: reason.status ?? "WARN",
    detail: reason.detail.trim().slice(0, 400),
  }));
}

function statusForScore(score: number, minEntryScore: number): EligibilityStatus {
  if (score >= minEntryScore + 5) return "QUALIFIED";
  if (score >= minEntryScore - 10) return "PROVISIONAL";
  return "NOT_QUALIFIED";
}

function statusLine(status: ReasonStatus) {
  if (status === "PASS") return "Meets the requirement";
  if (status === "WARN") return "Borderline";
  return "Below the requirement";
}

type CourseContext = {
  id: string;
  title: string;
  subject: string;
  level: string;
  entryRequirements: string;
  minEntryScore: number;
};

async function loadContext(input: EligibilityInput) {
  const [course, member, profile, qualifications, enrollments, attempts, placementAttempts, attendance] =
    await Promise.all([
      db.course.findFirst({
        where: { id: input.courseId, tenantId: input.tenantId },
        select: {
          id: true,
          title: true,
          subject: true,
          level: true,
          entryRequirements: true,
          minEntryScore: true,
        },
      }),
      db.membership.findFirst({
        where: { tenantId: input.tenantId, userId: input.studentId, role: "STUDENT" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      db.studentProfile.findUnique({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: input.studentId } },
      }),
      db.learnerQualification.findMany({
        where: { tenantId: input.tenantId, userId: input.studentId },
        orderBy: { year: "desc" },
      }),
      db.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: input.studentId } },
      }),
      db.attempt.findMany({
        where: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          status: "GRADED",
          assessment: { courseId: input.courseId, type: { not: "PLACEMENT" } },
        },
        include: { assessment: { select: { title: true, passScore: true } } },
        orderBy: { submittedAt: "desc" },
      }),
      db.attempt.findMany({
        where: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          assessment: { courseId: input.courseId, type: "PLACEMENT" },
        },
        include: { assessment: { select: { title: true, passScore: true } } },
        orderBy: { startedAt: "desc" },
      }),
      db.attendanceRecord.findMany({
        where: {
          studentId: input.studentId,
          session: { tenantId: input.tenantId, courseId: input.courseId },
        },
        select: { status: true },
      }),
    ]);

  return {
    course: course as CourseContext | null,
    member,
    profile,
    qualifications,
    enrollments,
    attempts,
    placementAttempts,
    attendance,
  };
}

function profileCompleteness(
  profile: Awaited<ReturnType<typeof loadContext>>["profile"],
  qualificationCount: number
) {
  const fields = [
    profile?.studentNumber,
    profile?.legalName,
    profile?.dateOfBirth,
    profile?.phone,
    profile?.address,
    profile?.city,
    profile?.country,
    profile?.guardianName,
    profile?.guardianPhone,
    profile?.guardianEmail,
  ];
  const filled = fields.filter((value) => value !== null && value !== undefined && value !== "").length;
  const custom = profile
    ? (JSON.parse(profile.customFields || "[]") as { label?: string; value?: string }[])
    : [];
  const customFilled = custom.filter((field) => field.value?.trim()).length;
  const total = fields.length + 1;
  const points = filled + (qualificationCount > 0 ? 1 : 0);
  return {
    score: clamp(round((points / total) * 100), 0, 100),
    filled,
    customFilled,
    qualificationCount,
  };
}

/**
 * Deterministic local qualification check. Always available, even without a
 * hosted model. Each signal is explainable and can be shown to teachers.
 */
export function scoreLocally(ctx: Awaited<ReturnType<typeof loadContext>>): EligibilitySnapshot {
  const course = ctx.course;
  if (!course) throw new Error("Course not found");

  const graded = ctx.attempts;
  const gradeAverage = average(
    graded
      .map((attempt) => percent(attempt.score, attempt.maxScore))
      .filter((value): value is number => value !== null)
  );

  const finishedPlacement = ctx.placementAttempts.filter(
    (attempt) => attempt.score !== null && attempt.maxScore > 0
  );
  const latestPlacement = finishedPlacement[0] ?? null;
  const placementBest = finishedPlacement.reduce(
    (best, attempt) => Math.max(best, percent(attempt.score, attempt.maxScore) ?? 0),
    0
  );
  const placementScore = finishedPlacement.length ? placementBest : null;

  const attendanceTotal = ctx.attendance.length;
  const attended = ctx.attendance.filter((record) =>
    ["PRESENT", "LATE"].includes(record.status)
  ).length;
  const attendanceRate = attendanceTotal ? (attended / attendanceTotal) * 100 : null;

  const completeness = profileCompleteness(ctx.profile, ctx.qualifications.length);

  const reasons: EligibilityReason[] = [];

  // Placement pre-assessment
  if (placementScore === null) {
    reasons.push({
      label: "Placement pre-assessment",
      status: "WARN",
      detail: "No completed placement pre-assessment yet. Run one to confirm readiness.",
    });
  } else {
    reasons.push({
      label: "Placement pre-assessment",
      status:
        placementScore >= course.minEntryScore + 5
          ? "PASS"
          : placementScore >= course.minEntryScore - 10
            ? "WARN"
            : "FAIL",
      detail: `Best placement result ${round(placementScore)}% against a ${course.minEntryScore}% entry benchmark.`,
    });
  }

  // Course grades
  if (gradeAverage === null) {
    reasons.push({
      label: "Graded course work",
      status: "WARN",
      detail: "No graded work in this course yet, so readiness leans on the placement result.",
    });
  } else {
    reasons.push({
      label: "Graded course work",
      status:
        gradeAverage >= 70 ? "PASS" : gradeAverage >= course.minEntryScore ? "WARN" : "FAIL",
      detail: `${round(gradeAverage)}% average across ${graded.length} graded attempt${
        graded.length === 1 ? "" : "s"
      }.`,
    });
  }

  // Attendance
  if (attendanceRate === null) {
    reasons.push({
      label: "Attendance",
      status: "WARN",
      detail: "No attendance register has been taken for this course yet.",
    });
  } else {
    reasons.push({
      label: "Attendance",
      status: attendanceRate >= 85 ? "PASS" : attendanceRate >= 70 ? "WARN" : "FAIL",
      detail: `${round(attendanceRate)}% attendance across ${attendanceTotal} register${
        attendanceTotal === 1 ? "" : "s"
      }.`,
    });
  }

  // Qualifications
  reasons.push({
    label: "Prior qualifications",
    status:
      ctx.qualifications.length >= 2
        ? "PASS"
        : ctx.qualifications.length === 1
          ? "WARN"
          : "FAIL",
    detail:
      ctx.qualifications.length === 0
        ? "No qualifications recorded on the learner profile."
        : `${ctx.qualifications.length} qualification${
            ctx.qualifications.length === 1 ? "" : "s"
          } on file (${ctx.qualifications
            .slice(0, 2)
            .map((q) => q.title)
            .join(", ")}).`,
  });

  reasons.push({
    label: "Profile completeness",
    status: completeness.score >= 80 ? "PASS" : completeness.score >= 50 ? "WARN" : "FAIL",
    detail: `${completeness.score}% of identity, contact and next-of-kin details captured.`,
  });

  // Weighted local score. Placement and grades dominate when available;
  // otherwise the weights fall back to attendance, qualifications and profile.
  const components: { value: number | null; weight: number }[] = [
    { value: placementScore, weight: 0.45 },
    { value: gradeAverage, weight: 0.3 },
    { value: attendanceRate, weight: 0.12 },
    { value: completeness.score, weight: 0.13 },
  ];
  const available = components.filter((part) => part.value !== null);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0) || 1;
  let score =
    available.reduce((sum, part) => sum + (part.value ?? 0) * part.weight, 0) / totalWeight;

  // Qualification evidence nudges borderline learners upward.
  score += Math.min(6, ctx.qualifications.length * 3);
  score = clamp(round(score), 0, 100);

  const status = statusForScore(score, course.minEntryScore);
  const signals = [placementScore, gradeAverage, attendanceRate].filter(
    (value): value is number => value !== null
  ).length;
  const confidence = clamp(45 + signals * 15 + Math.min(15, ctx.qualifications.length * 5), 40, 95);

  const summary =
    status === "QUALIFIED"
      ? `${ctx.member?.user.name ?? "This learner"} shows strong readiness for ${course.title}. The evidence meets the ${course.minEntryScore}% entry benchmark.`
      : status === "PROVISIONAL"
        ? `${ctx.member?.user.name ?? "This learner"} is close to the entry benchmark for ${course.title}. A short bridging plan or a second placement attempt would confirm readiness.`
        : `${ctx.member?.user.name ?? "This learner"} currently falls short of the entry benchmark for ${course.title}. The placement result and prior evidence suggest additional preparation first.`;

  return {
    status,
    score,
    confidence,
    summary,
    reasons,
    source: "HEURISTIC",
    provider: null,
    model: null,
    error: null,
    placementAttemptId: latestPlacement?.id ?? null,
  };
}

function systemPrompt() {
  return [
    "You are Axiom's course admissions analyst.",
    "Decide whether a learner qualifies for a specific course using ONLY the supplied evidence.",
    "Use the deterministic local assessment as the baseline. Refine it only when the evidence clearly justifies it, and stay within about 15 points of the local score.",
    "Weigh placement pre-assessment results, graded course work, attendance, prior qualifications and profile completeness.",
    "Do not infer protected traits, diagnoses, family finances or anything not supplied.",
    "Write supportive, specific language a teacher can act on. Never shame the learner.",
    "Return STRICT JSON only, no markdown fences:",
    '{"status":"QUALIFIED|PROVISIONAL|NOT_QUALIFIED","score":0,"confidence":0,"summary":"2-3 sentences","reasons":[{"label":"...","status":"PASS|WARN|FAIL","detail":"..."}]}',
    "Scores are 0-100. Keep reasons to the five or six most important signals.",
  ].join(" ");
}

function buildPayload(
  course: CourseContext,
  ctx: Awaited<ReturnType<typeof loadContext>>,
  local: EligibilitySnapshot
) {
  const gradeAverage = average(
    ctx.attempts
      .map((attempt) => percent(attempt.score, attempt.maxScore))
      .filter((value): value is number => value !== null)
  );
  const placement = ctx.placementAttempts
    .filter((attempt) => attempt.score !== null)
    .map((attempt) => ({
      title: attempt.assessment.title,
      score: round(percent(attempt.score, attempt.maxScore) ?? 0),
      submittedAt: (attempt.submittedAt ?? attempt.startedAt).toISOString(),
    }));
  const attendanceTotal = ctx.attendance.length;
  const attended = ctx.attendance.filter((record) =>
    ["PRESENT", "LATE"].includes(record.status)
  ).length;

  return JSON.stringify({
    task: "assess_course_eligibility",
    course: {
      title: course.title,
      subject: course.subject,
      level: course.level,
      entryRequirements: course.entryRequirements || null,
      minEntryScore: course.minEntryScore,
    },
    learner: {
      name: ctx.member?.user.name ?? "Learner",
      alreadyEnrolled: Boolean(ctx.enrollments),
      profile: {
        hasStudentNumber: Boolean(ctx.profile?.studentNumber),
        hasDateOfBirth: Boolean(ctx.profile?.dateOfBirth),
        hasPhone: Boolean(ctx.profile?.phone),
        hasAddress: Boolean(ctx.profile?.address),
        hasGuardian: Boolean(ctx.profile?.guardianName),
        customFieldCount: ctx.profile
          ? (JSON.parse(ctx.profile.customFields || "[]") as unknown[]).length
          : 0,
      },
      qualifications: ctx.qualifications.map((q) => ({
        title: q.title,
        institution: q.institution,
        year: q.year,
        grade: q.grade,
      })),
      placementAttempts: placement,
      gradedCourseWork: {
        count: ctx.attempts.length,
        averagePercent: gradeAverage === null ? null : round(gradeAverage),
      },
      attendance: {
        registers: attendanceTotal,
        ratePercent: attendanceTotal ? round((attended / attendanceTotal) * 100) : null,
      },
    },
    localAssessment: {
      status: local.status,
      score: local.score,
      confidence: local.confidence,
      summary: local.summary,
      reasons: local.reasons,
    },
  });
}

/**
 * Run a qualification check. The local heuristic is always produced; when a
 * hosted provider is selected it refines the narrative and may move the score
 * slightly. Persists the result as a CourseEligibility row.
 */
export async function runEligibilityCheck(input: EligibilityInput): Promise<{
  id: string;
  snapshot: EligibilitySnapshot;
}> {
  const ctx = await loadContext(input);
  if (!ctx.course) throw new Error("Course not found");
  if (!ctx.member) throw new Error("That learner is not a student in this workspace.");

  const local = scoreLocally(ctx);
  let snapshot: EligibilitySnapshot = local;
  let provider: string | null = null;
  let model: string | null = null;

  const choice = input.providerChoice || "auto";
  const { runtime } = await resolveRuntime(input.tenantId, choice);

  if (runtime) {
    provider = runtime.id;
    model = runtime.model;
    try {
      const result = await callProvider(runtime, {
        system: systemPrompt(),
        user: buildPayload(ctx.course, ctx, local),
        maxTokens: 1200,
        temperature: 0.2,
      });
      const parsed = AiEligibilitySchema.parse(extractJson(result.text));
      const score =
        parsed.score !== undefined
          ? clamp(round(parsed.score), local.score - 15, local.score + 15)
          : local.score;
      const status = parsed.status ?? statusForScore(score, ctx.course.minEntryScore);
      snapshot = {
        status,
        score: clamp(score, 0, 100),
        confidence: clamp(round(parsed.confidence ?? local.confidence), 5, 99),
        summary: (parsed.summary?.trim() || local.summary).slice(0, 1200),
        reasons: normaliseReasons(parsed.reasons, local.reasons),
        source: "AI",
        provider,
        model,
        error: null,
        placementAttemptId: local.placementAttemptId,
      };
    } catch (error) {
      snapshot = {
        ...local,
        error:
          error instanceof Error
            ? `AI refinement failed (${error.message}). Showing the local assessment.`
            : "AI refinement failed. Showing the local assessment.",
      };
    }
  }

  const row = await db.courseEligibility.create({
    data: {
      tenantId: input.tenantId,
      courseId: input.courseId,
      studentId: input.studentId,
      status: snapshot.status,
      score: snapshot.score,
      confidence: snapshot.confidence,
      summary: snapshot.summary,
      reasons: JSON.stringify(snapshot.reasons),
      source: snapshot.source,
      provider: snapshot.provider,
      model: snapshot.model,
      error: snapshot.error,
      placementAttemptId: snapshot.placementAttemptId,
      createdById: input.actorId ?? null,
    },
  });

  return { id: row.id, snapshot };
}

export function parseEligibilityReasons(raw: string): EligibilityReason[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (reason): reason is EligibilityReason =>
        Boolean(reason) && typeof reason.label === "string" && typeof reason.detail === "string"
    );
  } catch {
    return [];
  }
}

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  QUALIFIED: "Qualified",
  PROVISIONAL: "Provisional",
  NOT_QUALIFIED: "Not qualified",
};

export { statusLine };
