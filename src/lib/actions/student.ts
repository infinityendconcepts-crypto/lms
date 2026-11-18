"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import {
  addSponsorshipMonths,
  isSponsorshipType,
  monthsBetweenSponsorshipDates,
  parseSponsorshipDate,
} from "@/lib/sponsorship";

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

export async function saveSponsorshipAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const studentId = String(formData.get("studentId") ?? "");
  const membership = await studentInTenant(studentId, ctx.tenant.id);

  const rawType = String(formData.get("sponsorshipType") ?? "");
  const sponsorshipType = isSponsorshipType(rawType) ? rawType : null;
  const sponsorshipProvider = text(formData, "sponsorshipProvider");
  const sponsorshipReference = text(formData, "sponsorshipReference");
  const sponsorshipNotes = text(formData, "sponsorshipNotes");

  const startDate = parseSponsorshipDate(text(formData, "sponsorshipStartDate"));
  let endDate = parseSponsorshipDate(text(formData, "sponsorshipEndDate"));
  const monthsRaw = String(formData.get("sponsorshipMonths") ?? "").trim();
  const parsedMonths = monthsRaw ? Number(monthsRaw) : null;
  let sponsorshipMonths =
    parsedMonths !== null && Number.isFinite(parsedMonths)
      ? Math.min(600, Math.max(0, Math.round(parsedMonths)))
      : null;

  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    redirect(`/dashboard/students/${studentId}?tab=sponsorship&error=End+date+cannot+be+before+start+date`);
  }
  if (startDate && endDate && sponsorshipMonths === null) {
    sponsorshipMonths = monthsBetweenSponsorshipDates(startDate, endDate);
  }
  if (startDate && sponsorshipMonths && sponsorshipMonths > 0 && !endDate) {
    endDate = addSponsorshipMonths(startDate, sponsorshipMonths);
  }

  await db.studentProfile.upsert({
    where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: studentId } },
    create: {
      tenantId: ctx.tenant.id,
      userId: studentId,
      sponsorshipType,
      sponsorshipProvider,
      sponsorshipReference,
      sponsorshipStartDate: startDate,
      sponsorshipEndDate: endDate,
      sponsorshipMonths,
      sponsorshipNotes,
    },
    update: {
      sponsorshipType,
      sponsorshipProvider,
      sponsorshipReference,
      sponsorshipStartDate: startDate,
      sponsorshipEndDate: endDate,
      sponsorshipMonths,
      sponsorshipNotes,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "student.sponsorship_updated",
    target: studentId,
    meta: { learner: membership.user.name, type: sponsorshipType },
  });
  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}?tab=sponsorship&saved=sponsorship`);
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
