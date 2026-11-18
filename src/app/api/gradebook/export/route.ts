import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession, TENANT_COOKIE } from "@/lib/auth";
import { atLeast } from "@/lib/tenant";
import { pct, toCsv } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
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

  const courses = await db.course.findMany({
    where: { tenantId },
    include: { assessments: { orderBy: { createdAt: "asc" } } },
  });

  const students = await db.membership.findMany({
    where: { tenantId, role: "STUDENT" },
    include: {
      user: { include: { attempts: { where: { tenantId } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const assessments = courses.flatMap((c) => c.assessments.map((a) => ({ ...a, course: c })));

  const header = [
    "Student",
    "Email",
    ...assessments.map((a) => `${a.course.title} — ${a.title} (%)`),
    "Average (%)",
  ];

  const rows = students.map((s) => {
    const scores = assessments.map((a) => {
      const attempt = s.user.attempts
        .filter((t) => t.assessmentId === a.id && t.status !== "IN_PROGRESS")
        .sort((x, y) => (y.submittedAt?.getTime() ?? 0) - (x.submittedAt?.getTime() ?? 0))[0];
      return attempt ? pct(attempt.score ?? 0, attempt.maxScore) : "";
    });
    const numeric = scores.filter((n): n is number => typeof n === "number");
    const avg = numeric.length
      ? Math.round(numeric.reduce((sum, n) => sum + n, 0) / numeric.length)
      : "";
    return [s.user.name, s.user.email, ...scores, avg];
  });

  const csv = toCsv([header, ...rows]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="axiom-gradebook-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
