import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession, TENANT_COOKIE } from "@/lib/auth";
import { atLeast } from "@/lib/tenant";
import { getWorkspaceReport } from "@/lib/reporting";
import { toCsv } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });

  const jar = await cookies();
  const tenantId = jar.get(TENANT_COOKIE)?.value;
  if (!tenantId) return new Response("No workspace", { status: 400 });

  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
  });
  if (!membership || !atLeast(membership.role, "TEACHER")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "courses";
  const requestedCourse = url.searchParams.get("course");
  const course =
    requestedCourse && (await db.course.findFirst({ where: { id: requestedCourse, tenantId }, select: { id: true } }))
      ? requestedCourse
      : null;

  const report = await getWorkspaceReport(tenantId, course);
  let rows: (string | number | null | undefined)[][];

  if (type === "courses") {
    rows = [
      ["Course", "Status", "Learners", "Assessments", "Attempts", "Average score (%)", "Pass rate (%)", "Attendance (%)", "Lesson completion (%)"],
      ...report.courseRows.map((row) => [
        row.title,
        row.status,
        row.learners,
        row.assessments,
        row.attempts,
        row.averageScore,
        row.passRate,
        row.attendanceRate,
        row.lessonCompletion,
      ]),
    ];
  } else if (type === "learners") {
    rows = [
      ["Learner", "Email", "Courses", "Scored attempts", "Average score (%)", "Attendance (%)", "Lesson completion (%)", "Success outlook (%)", "Risk band"],
      ...report.learnerRows.map((row) => [
        row.name,
        row.email,
        row.courses,
        row.attempts,
        row.averageScore,
        row.attendanceRate,
        row.lessonCompletion,
        row.successProbability,
        row.band,
      ]),
    ];
  } else if (type === "attempts") {
    rows = [
      ["Attempt ID", "Learner", "Email", "Course", "Assessment", "Status", "Score (%)", "Started", "Submitted"],
      ...report.attemptRows.map((row) => [
        row.id,
        row.studentName,
        row.studentEmail,
        row.courseTitle,
        row.assessmentTitle,
        row.status,
        row.score,
        row.startedAt,
        row.submittedAt,
      ]),
    ];
  } else {
    return new Response("Unknown report type", { status: 400 });
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="axiom-report-${type}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
