"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant, ROLE_LABELS, type Role } from "@/lib/tenant";
import { hashPassword, newToken } from "@/lib/password";
import { assertSeatAvailable, getPlanState } from "@/lib/usage";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/email";
import { parsePeopleCsv } from "@/lib/people-csv";

type TenantContext = Awaited<ReturnType<typeof requireTenant>>;
type PersonKind = "staff" | "learner";

const CREATABLE_STAFF_ROLES: Role[] = ["ADMIN", "TEACHER", "MODERATOR"];
const MAX_IMPORT_ROWS = 200;
const MAX_CSV_BYTES = 500_000;

const personSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
});

function buildQuery(parts: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parts)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

/** Only the two people-management pages are valid return targets. */
function peopleRedirect(formData: FormData, parts: Record<string, string | number | undefined | null> = {}): never {
  const raw = String(formData.get("returnTo") ?? "");
  const base = raw === "/dashboard/staff" || raw === "/dashboard/students" ? raw : "/dashboard/settings?tab=members";
  const query = buildQuery(parts);
  redirect(query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base);
}

function asStaffRole(value: string | null | undefined): Role | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return CREATABLE_STAFF_ROLES.includes(normalized as Role) ? (normalized as Role) : null;
}

function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .replace(/[._+-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Learner";
}

function temporaryPassword() {
  return `${newToken(8)}Aa1!`;
}

async function notifyPerson(input: {
  ctx: TenantContext;
  to: string;
  role: Role;
  tempPassword: string | null;
}) {
  const signIn = appUrl("/login");
  const body = input.tempPassword
    ? `Your ${input.ctx.tenant.name} account is ready.\n\nEmail: ${input.to}\nTemporary password: ${input.tempPassword}\nSign in: ${signIn}\n\nPlease change your password after signing in.`
    : `You've been added to ${input.ctx.tenant.name} as ${ROLE_LABELS[input.role] ?? input.role}.\n\nSign in with your existing Nkanyezi account: ${signIn}`;
  await sendEmail({
    to: input.to,
    tenantId: input.ctx.tenant.id,
    kind: "ACCOUNT_CREATED",
    subject: `Your ${input.ctx.tenant.name} account`,
    body,
  });
}

async function findCourse(ctx: TenantContext, value: string | null | undefined) {
  const needle = String(value ?? "").trim();
  if (!needle) return null;
  const exact = await db.course.findFirst({ where: { tenantId: ctx.tenant.id, id: needle } });
  if (exact) return exact;
  const courses = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { id: true, title: true },
  });
  return courses.find((course) => course.title.toLowerCase() === needle.toLowerCase()) ?? null;
}

async function enrollUser(ctx: TenantContext, userId: string, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!course) return false;
  await db.enrollment.upsert({
    where: { courseId_userId: { courseId: course.id, userId } },
    create: { tenantId: ctx.tenant.id, courseId: course.id, userId, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });
  return true;
}

type AddResult =
  | { ok: true; userId: string; tempPassword: string | null }
  | { ok: false; reason: string };

/** Creates a real user (or reuses one globally) and adds a tenant membership. */
async function addPersonRecord(input: {
  ctx: TenantContext;
  name: string;
  email: string;
  role: Role;
  courseId?: string | null;
}): Promise<AddResult> {
  const { ctx, name, email, role, courseId } = input;

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: existingUser.id } },
    });
    if (existingMembership) return { ok: false, reason: "already a member of this workspace" };
  }

  if (role === "STUDENT") {
    try {
      await assertSeatAvailable(ctx.tenant.id);
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "No learner seats available" };
    }
  }

  let user = existingUser;
  let tempPassword: string | null = null;
  if (!user) {
    tempPassword = temporaryPassword();
    user = await db.user.create({
      data: { email, name, passwordHash: await hashPassword(tempPassword) },
    });
  }

  await db.membership.create({
    data: { tenantId: ctx.tenant.id, userId: user.id, role, status: "ACTIVE" },
  });

  if (courseId) await enrollUser(ctx, user.id, courseId);

  await notifyPerson({ ctx, to: email, role, tempPassword });
  return { ok: true, userId: user.id, tempPassword };
}

async function revalidatePeoplePages() {
  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard/settings");
}

async function removeMembership(ctx: TenantContext, membershipId: string, userId: string) {
  await db.$transaction([
    db.enrollment.deleteMany({ where: { tenantId: ctx.tenant.id, userId } }),
    db.membership.delete({ where: { id: membershipId } }),
  ]);
}

function selectedIds(formData: FormData) {
  return Array.from(
    new Set(formData.getAll("memberIds").map(String).filter((id) => id.length > 0))
  ).slice(0, 200);
}

// ── Manual direct add ──────────────────────────────────────────────────────

export async function addStaffAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const parsed = personSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  const role = asStaffRole(String(formData.get("role") ?? ""));
  if (!parsed.success || !role) {
    peopleRedirect(formData, { error: parsed.success ? "Invalid staff role" : "Enter a name and valid email" });
  }

  const result = await addPersonRecord({ ctx, ...parsed.data, role });
  if (!result.ok) peopleRedirect(formData, { error: `Could not add staff: ${result.reason}` });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "staff.created",
    target: parsed.data.email,
    meta: { role, userId: result.userId, generatedPassword: Boolean(result.tempPassword) },
  });
  await revalidatePeoplePages();
  peopleRedirect(formData, { added: 1, role });
}

export async function addLearnerAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const parsed = personSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) peopleRedirect(formData, { error: "Enter a name and valid email" });

  const courseId = String(formData.get("courseId") ?? "") || null;
  if (courseId && !(await findCourse(ctx, courseId))) {
    peopleRedirect(formData, { error: "Course not found" });
  }

  const result = await addPersonRecord({ ctx, ...parsed.data, role: "STUDENT", courseId });
  if (!result.ok) peopleRedirect(formData, { error: `Could not add learner: ${result.reason}` });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "learner.created",
    target: parsed.data.email,
    meta: { courseId, userId: result.userId, generatedPassword: Boolean(result.tempPassword) },
  });
  await revalidatePeoplePages();
  peopleRedirect(formData, { added: 1, enrolled: courseId ? 1 : 0 });
}

// ── Batch actions on selected people ──────────────────────────────────────

async function bulkPeople(formData: FormData, kind: PersonKind) {
  const ctx = await requireTenant("ADMIN");
  const ids = selectedIds(formData);
  if (ids.length === 0) peopleRedirect(formData, { error: "Select at least one person" });

  const action = String(formData.get("bulkAction") ?? "");
  const role = asStaffRole(String(formData.get("role") ?? ""));
  const courseId = String(formData.get("courseId") ?? "") || null;

  if (action === "role" && !role) peopleRedirect(formData, { error: "Choose a role" });
  if (action === "enroll" && kind !== "learner") peopleRedirect(formData, { error: "Invalid batch action" });
  if (action === "enroll" && !(await findCourse(ctx, courseId))) {
    peopleRedirect(formData, { error: "Course not found" });
  }
  if (!["role", "remove", "enroll"].includes(action)) peopleRedirect(formData, { error: "Invalid batch action" });

  const memberships = await db.membership.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    include: { user: { select: { email: true } } },
  });

  let affected = 0;
  let skipped = ids.length - memberships.length;
  for (const membership of memberships) {
    if (membership.role === "OWNER" || membership.userId === ctx.user.id) {
      skipped += 1;
      continue;
    }
    if (action === "remove") {
      await removeMembership(ctx, membership.id, membership.userId);
    } else if (action === "role" && role) {
      await db.membership.update({ where: { id: membership.id }, data: { role } });
    } else if (action === "enroll" && courseId) {
      const enrolled = await enrollUser(ctx, membership.userId, courseId);
      if (!enrolled) {
        skipped += 1;
        continue;
      }
    } else {
      skipped += 1;
      continue;
    }
    affected += 1;
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: kind === "staff" ? "staff.batch" : "learner.batch",
    target: `${memberships.length} selected`,
    meta: { action, role, courseId, affected, skipped },
  });
  await revalidatePeoplePages();
  peopleRedirect(formData, { affected, skipped, batch: action });
}

export async function bulkStaffAction(formData: FormData) {
  await bulkPeople(formData, "staff");
}

export async function bulkLearnerAction(formData: FormData) {
  await bulkPeople(formData, "learner");
}

// ── CSV import ─────────────────────────────────────────────────────────────

async function readCsv(formData: FormData): Promise<{ text: string; error?: string }> {
  const file = formData.get("file");
  let text = String(formData.get("csv") ?? "");

  if (file && typeof file === "object" && "size" in file && "text" in file) {
    const upload = file as File;
    if (upload.size > MAX_CSV_BYTES) return { text: "", error: "CSV files must be under 500 KB" };
    if (upload.size > 0) text = await upload.text();
  }

  if (!text.trim()) return { text: "", error: "Upload a CSV file or paste CSV text" };
  if (text.length > MAX_CSV_BYTES) return { text: "", error: "CSV imports are limited to 500 KB" };
  return { text };
}

async function importPeople(formData: FormData, kind: PersonKind) {
  const ctx = await requireTenant("ADMIN");
  const source = await readCsv(formData);
  if (source.error) peopleRedirect(formData, { error: source.error });

  const parsed = parsePeopleCsv(source.text);
  if (parsed.errors.length > 0) peopleRedirect(formData, { error: parsed.errors[0] });
  if (parsed.people.length === 0) peopleRedirect(formData, { error: "No rows found in the CSV" });
  if (parsed.people.length > MAX_IMPORT_ROWS) {
    peopleRedirect(formData, { error: `Import up to ${MAX_IMPORT_ROWS} people at a time` });
  }

  const defaultRole = asStaffRole(String(formData.get("role") ?? "")) ?? "MODERATOR";
  const fallbackCourseId = String(formData.get("courseId") ?? "") || null;
  const fallbackCourse = fallbackCourseId ? await findCourse(ctx, fallbackCourseId) : null;
  if (fallbackCourseId && !fallbackCourse) peopleRedirect(formData, { error: "Course not found" });

  const courseRows = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { id: true, title: true },
  });
  const courseByTitle = new Map(courseRows.map((course) => [course.title.toLowerCase(), course.id]));
  const courseById = new Set(courseRows.map((course) => course.id));

  const emailSchema = personSchema.shape.email;
  const seen = new Set<string>();
  const rows: { line: number; name: string; email: string; role: Role; courseId: string | null }[] = [];
  const reasons: string[] = [];

  for (const row of parsed.people) {
    const emailResult = emailSchema.safeParse(row.email);
    if (!emailResult.success) {
      reasons.push(`Row ${row.line}: invalid email`);
      continue;
    }
    const email = emailResult.data;
    if (seen.has(email)) {
      reasons.push(`Row ${row.line}: duplicate email`);
      continue;
    }
    seen.add(email);

    const role: Role | null = kind === "learner" ? "STUDENT" : asStaffRole(row.role || defaultRole);
    if (!role) {
      reasons.push(`Row ${row.line}: invalid role`);
      continue;
    }

    let courseId: string | null = null;
    if (kind === "learner") {
      const wanted = row.course || fallbackCourse?.id || "";
      if (wanted) {
        if (courseById.has(wanted)) courseId = wanted;
        else if (courseByTitle.has(wanted.toLowerCase())) courseId = courseByTitle.get(wanted.toLowerCase()) ?? null;
        else {
          reasons.push(`Row ${row.line}: course not found`);
          continue;
        }
      }
    }

    rows.push({
      line: row.line,
      email,
      name: row.name || nameFromEmail(email),
      role,
      courseId,
    });
  }

  const existingUsers = rows.length
    ? await db.user.findMany({
        where: { email: { in: rows.map((row) => row.email) } },
        select: { id: true, email: true },
      })
    : [];
  const userByEmail = new Map(existingUsers.map((user) => [user.email, user.id]));
  const existingIds = existingUsers.map((user) => user.id);
  const existingMemberships = existingIds.length
    ? await db.membership.findMany({
        where: { tenantId: ctx.tenant.id, userId: { in: existingIds } },
        select: { userId: true },
      })
    : [];
  const memberUserIds = new Set(existingMemberships.map((membership) => membership.userId));

  let seatsLeft: number | null = null;
  if (kind === "learner") {
    seatsLeft = (await getPlanState(ctx.tenant.id)).seatsLeft;
    if (seatsLeft === 0) reasons.push("No learner seats available");
  }

  const notices: Parameters<typeof notifyPerson>[0][] = [];
  let added = 0;

  for (const row of rows) {
    const existingUserId = userByEmail.get(row.email);
    if (existingUserId && memberUserIds.has(existingUserId)) {
      reasons.push(`Row ${row.line}: already a member`);
      continue;
    }
    if (kind === "learner" && seatsLeft !== null && seatsLeft <= 0) {
      reasons.push(`Row ${row.line}: no learner seats available`);
      continue;
    }

    let userId = existingUserId;
    let tempPassword: string | null = null;
    try {
      if (!userId) {
        tempPassword = temporaryPassword();
        const user = await db.user.create({
          data: { email: row.email, name: row.name, passwordHash: await hashPassword(tempPassword) },
        });
        userId = user.id;
      }
      await db.membership.create({
        data: { tenantId: ctx.tenant.id, userId, role: row.role, status: "ACTIVE" },
      });
      if (row.courseId) await enrollUser(ctx, userId, row.courseId);
    } catch {
      reasons.push(`Row ${row.line}: could not be added`);
      continue;
    }

    notices.push({ ctx, to: row.email, role: row.role, tempPassword });
    added += 1;
    memberUserIds.add(userId);
    if (kind === "learner" && seatsLeft !== null) seatsLeft -= 1;
  }

  for (const notice of notices) {
    await notifyPerson(notice).catch((error) => console.error("account email failed", error));
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: kind === "staff" ? "staff.imported" : "learner.imported",
    target: `${added} added`,
    meta: { added, skipped: parsed.people.length - added, detail: reasons.slice(0, 8).join(" | ") },
  });
  await revalidatePeoplePages();
  peopleRedirect(formData, {
    added,
    skipped: parsed.people.length - added,
    detail: reasons.slice(0, 3).join(" · ").slice(0, 240),
  });
}

export async function importStaffAction(formData: FormData) {
  await importPeople(formData, "staff");
}

export async function importLearnerAction(formData: FormData) {
  await importPeople(formData, "learner");
}
