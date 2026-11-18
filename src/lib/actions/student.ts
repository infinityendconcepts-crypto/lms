"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";

async function studentInTenant(studentId: string, tenantId: string) {
  const membership = await db.membership.findFirst({
    where: { tenantId, userId: studentId, role: "STUDENT" },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!membership) throw new Error("Learner not found in this workspace");
  return membership;
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCustomFields(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((field) => ({
        label: String(field?.label ?? "").trim().slice(0, 80),
        value: String(field?.value ?? "").trim().slice(0, 500),
      }))
      .filter((field) => field.label && field.value)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export async function saveStudentProfileAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const studentId = String(formData.get("studentId") ?? "");
  const membership = await studentInTenant(studentId, ctx.tenant.id);

  const customFields = parseCustomFields(String(formData.get("customFields") ?? "[]"));

  await db.studentProfile.upsert({
    where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: studentId } },
    create: {
      tenantId: ctx.tenant.id,
      userId: studentId,
      studentNumber: text(formData, "studentNumber"),
      legalName: text(formData, "legalName"),
      dateOfBirth: parseDate(text(formData, "dateOfBirth")),
      phone: text(formData, "phone"),
      address: text(formData, "address"),
      city: text(formData, "city"),
      country: text(formData, "country"),
      guardianName: text(formData, "guardianName"),
      guardianRelationship: text(formData, "guardianRelationship"),
      guardianPhone: text(formData, "guardianPhone"),
      guardianEmail: text(formData, "guardianEmail"),
      emergencyNotes: text(formData, "emergencyNotes"),
      notes: text(formData, "notes"),
      customFields: JSON.stringify(customFields),
    },
    update: {
      studentNumber: text(formData, "studentNumber"),
      legalName: text(formData, "legalName"),
      dateOfBirth: parseDate(text(formData, "dateOfBirth")),
      phone: text(formData, "phone"),
      address: text(formData, "address"),
      city: text(formData, "city"),
      country: text(formData, "country"),
      guardianName: text(formData, "guardianName"),
      guardianRelationship: text(formData, "guardianRelationship"),
      guardianPhone: text(formData, "guardianPhone"),
      guardianEmail: text(formData, "guardianEmail"),
      emergencyNotes: text(formData, "emergencyNotes"),
      notes: text(formData, "notes"),
      customFields: JSON.stringify(customFields),
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "student.profile_updated",
    target: studentId,
    meta: { learner: membership.user.name },
  });
  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}?saved=profile`);
}

export async function addQualificationAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const studentId = String(formData.get("studentId") ?? "");
  await studentInTenant(studentId, ctx.tenant.id);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`/dashboard/students/${studentId}?error=Qualification+needs+a+title`);

  const yearRaw = String(formData.get("year") ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;

  await db.learnerQualification.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: studentId,
      title: title.slice(0, 160),
      institution: text(formData, "institution"),
      year: Number.isFinite(year) ? year : null,
      grade: text(formData, "grade"),
      documentUrl: text(formData, "documentUrl"),
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "student.qualification_added",
    target: studentId,
    meta: { title },
  });
  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}?saved=qualification`);
}

export async function deleteQualificationAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const studentId = String(formData.get("studentId") ?? "");
  const qualificationId = String(formData.get("qualificationId") ?? "");
  await studentInTenant(studentId, ctx.tenant.id);
  await db.learnerQualification.deleteMany({
    where: { id: qualificationId, tenantId: ctx.tenant.id, userId: studentId },
  });
  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}?saved=qualification-removed`);
}
