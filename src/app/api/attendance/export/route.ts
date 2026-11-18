import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession, TENANT_COOKIE } from "@/lib/auth";
import { atLeast } from "@/lib/tenant";
import { formatDate, toCsv } from "@/lib/utils";

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

  const sessionId = new URL(request.url).searchParams.get("session");
  if (!sessionId) return new Response("Missing register id", { status: 400 });

  const register = await db.attendanceSession.findFirst({
    where: { id: sessionId, tenantId },
    include: {
      course: { select: { title: true } },
      lesson: { select: { title: true } },
      records: {
        include: {
          student: { select: { name: true, email: true } },
          markedBy: { select: { name: true } },
        },
        orderBy: { student: { name: "asc" } },
      },
    },
  });
  if (!register) return new Response("Register not found", { status: 404 });

  const header = [
    "Course",
    "Date",
    "Session",
    "Lesson",
    "Student",
    "Email",
    "Status",
    "Note",
    "Marked by",
    "Updated",
  ];

  const rows = register.records.map((record) => [
    register.course.title,
    formatDate(register.date),
    register.title ?? "",
    register.lesson?.title ?? "",
    record.student.name,
    record.student.email,
    record.status,
    record.note ?? "",
    record.markedBy?.name ?? "",
    formatDate(record.updatedAt, true),
  ]);

  const csv = toCsv([header, ...rows]);
  const slug = register.course.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="axiom-attendance-${slug}-${new Date(register.date)
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
