import "server-only";

import { db } from "@/lib/db";
import { attendanceRate, countStatuses, type AttendanceStatus } from "@/lib/attendance";
import {
  sponsorshipDuration,
  sponsorshipLabel,
  sponsorshipStatus,
} from "@/lib/sponsorship";
import { pct } from "@/lib/utils";

const SPONSORSHIP_STATE_LABELS = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  ENDED: "Ended",
  NOT_SET: "Not set",
} as const;

export type LearnerSnapshot = {
  learner: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    joinedAt: Date | null;
    status: string;
  };
  profile: {
    studentNumber: string | null;
    legalName: string | null;
    dateOfBirth: Date | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    guardianName: string | null;
    guardianRelationship: string | null;
    guardianPhone: string | null;
    guardianEmail: string | null;
  } | null;
  sponsorship: {
    type: string;
    provider: string | null;
    reference: string | null;
    startDate: Date | null;
    endDate: Date | null;
    duration: string;
    status: string;
    notes: string | null;
  };
  attendance: {
    total: number;
    rate: number;
    counts: Record<AttendanceStatus, number>;
    recent: {
      id: string;
      status: string;
      date: Date;
      title: string;
      courseTitle: string;
    }[];
  };
  courses: {
    id: string;
    title: string;
    subject: string;
    level: string;
    status: string;
    progress: number;
  }[];
  results: {
    id: string;
    title: string;
    courseTitle: string;
    score: number;
    maxScore: number;
    percentage: number;
    gradedAt: Date | null;
  }[];
  summary: {
    gradedCount: number;
    average: number | null;
    passedCount: number;
    courseCount: number;
    averageProgress: number | null;
    qualificationCount: number;
  };
  monitors: {
    id: string;
    name: string;
    email: string;
    type: string | null;
    organization: string | null;
  }[];
};

/** Read-only learner data shared by the owner console and the monitor sign-in view. */
export async function getLearnerSnapshot(
  input: { tenantId: string },
  learnerId: string
): Promise<LearnerSnapshot | null> {
  const learner = await db.user.findFirst({
    where: {
      id: learnerId,
      memberships: { some: { tenantId: input.tenantId, role: "STUDENT" } },
    },
    include: {
      memberships: { where: { tenantId: input.tenantId } },
      studentProfiles: { where: { tenantId: input.tenantId }, take: 1 },
      enrollments: {
        where: { tenantId: input.tenantId },
        include: {
          course: { select: { id: true, title: true, subject: true, level: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      attempts: {
        where: { tenantId: input.tenantId, status: "GRADED" },
        include: { assessment: { include: { course: { select: { title: true } } } } },
        orderBy: { startedAt: "desc" },
      },
      qualifications: { where: { tenantId: input.tenantId } },
    },
  });

  if (!learner) return null;

  const [attendance, recentAttendance, monitorAssignments] = await Promise.all([
    db.attendanceRecord.findMany({
      where: { studentId: learner.id, session: { tenantId: input.tenantId } },
      select: { status: true },
    }),
    db.attendanceRecord.findMany({
      where: { studentId: learner.id, session: { tenantId: input.tenantId } },
      include: {
        session: { include: { course: { select: { title: true } } } },
      },
      orderBy: { session: { date: "desc" } },
      take: 8,
    }),
    db.monitorAssignment.findMany({
      where: { tenantId: input.tenantId, learnerId: learner.id },
      include: {
        monitor: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const membership = learner.memberships.find((m) => m.tenantId === input.tenantId) ?? null;
  const profile = learner.studentProfiles[0] ?? null;
  const graded = learner.attempts.filter((attempt) => attempt.status === "GRADED");
  const percentages = graded.map((attempt) => pct(attempt.score, attempt.maxScore));
  const average = percentages.length
    ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
    : null;
  const courses = learner.enrollments;
  const averageProgress = courses.length
    ? Math.round(courses.reduce((sum, enrollment) => sum + enrollment.progress, 0) / courses.length)
    : null;
  const counts = countStatuses(attendance);

  return {
    learner: {
      id: learner.id,
      name: learner.name,
      email: learner.email,
      avatarUrl: learner.avatarUrl,
      joinedAt: membership?.createdAt ?? null,
      status: membership?.status ?? "ACTIVE",
    },
    profile: profile
      ? {
          studentNumber: profile.studentNumber,
          legalName: profile.legalName,
          dateOfBirth: profile.dateOfBirth,
          phone: profile.phone,
          address: profile.address,
          city: profile.city,
          country: profile.country,
          guardianName: profile.guardianName,
          guardianRelationship: profile.guardianRelationship,
          guardianPhone: profile.guardianPhone,
          guardianEmail: profile.guardianEmail,
        }
      : null,
    sponsorship: {
      type: sponsorshipLabel(profile?.sponsorshipType),
      provider: profile?.sponsorshipProvider ?? null,
      reference: profile?.sponsorshipReference ?? null,
      startDate: profile?.sponsorshipStartDate ?? null,
      endDate: profile?.sponsorshipEndDate ?? null,
      duration: sponsorshipDuration(
        profile?.sponsorshipStartDate,
        profile?.sponsorshipEndDate,
        profile?.sponsorshipMonths
      ),
      status:
        SPONSORSHIP_STATE_LABELS[
          sponsorshipStatus(profile?.sponsorshipStartDate, profile?.sponsorshipEndDate)
        ],
      notes: profile?.sponsorshipNotes ?? null,
    },
    attendance: {
      total: attendance.length,
      rate: attendanceRate(attendance),
      counts,
      recent: recentAttendance.map((record) => ({
        id: record.id,
        status: record.status,
        date: record.session.date,
        title: record.session.title || "Attendance register",
        courseTitle: record.session.course.title,
      })),
    },
    courses: courses.map((enrollment) => ({
      id: enrollment.course.id,
      title: enrollment.course.title,
      subject: enrollment.course.subject,
      level: enrollment.course.level,
      status: enrollment.course.status,
      progress: enrollment.progress,
    })),
    results: learner.attempts.map((attempt) => ({
      id: attempt.id,
      title: attempt.assessment.title,
      courseTitle: attempt.assessment.course.title,
      score: attempt.score ?? 0,
      maxScore: attempt.maxScore,
      percentage: pct(attempt.score, attempt.maxScore),
      gradedAt: attempt.gradedAt,
    })),
    summary: {
      gradedCount: graded.length,
      average,
      passedCount: percentages.filter((value) => value >= 50).length,
      courseCount: courses.length,
      averageProgress,
      qualificationCount: learner.qualifications.length,
    },
    monitors: monitorAssignments.map((assignment) => ({
      id: assignment.monitor.user.id,
      name: assignment.monitor.user.name,
      email: assignment.monitor.user.email,
      type: assignment.monitor.monitorType,
      organization: assignment.monitor.monitorOrganization,
    })),
  };
}

/** Learner IDs a MONITOR user is allowed to open. */
export async function assignedLearnerIds(input: { tenantId: string; userId: string }) {
  const assignments = await db.monitorAssignment.findMany({
    where: { tenantId: input.tenantId, monitor: { userId: input.userId } },
    select: { learnerId: true },
  });
  return [...new Set(assignments.map((assignment) => assignment.learnerId))];
}

/** Returns the assignment only when this MONITOR user owns it in this workspace. */
export async function monitorAssignmentForLearner(input: {
  tenantId: string;
  userId: string;
  learnerId: string;
}) {
  return db.monitorAssignment.findFirst({
    where: {
      tenantId: input.tenantId,
      learnerId: input.learnerId,
      monitor: { userId: input.userId, role: "MONITOR" },
    },
    select: { id: true },
  });
}
