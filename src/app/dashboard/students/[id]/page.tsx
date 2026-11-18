import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Download,
  FileText,
  GraduationCap,
  Home,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import {
  addQualificationAction,
  deleteQualificationAction,
  saveSponsorshipAction,
  saveStudentProfileAction,
} from "@/lib/actions/student";
import { runEligibilityAction } from "@/lib/actions/eligibility";
import { providerOptions } from "@/lib/ai/benchmark";
import { parseEligibilityReasons } from "@/lib/ai/eligibility";
import { appUrl } from "@/lib/email";
import { Avatar, Badge, EmptyState, PageHeader, Stat, StatusBadge, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { UploadField } from "@/components/UploadField";
import { CopyButton } from "@/components/CopyButton";
import { CustomFieldsEditor, type CustomField } from "@/components/dashboard/CustomFieldsEditor";
import {
  SPONSORSHIP_TYPES,
  SPONSORSHIP_TYPE_LABELS,
  sponsorshipDuration,
  sponsorshipLabel,
  sponsorshipStatus,
  toSponsorshipDateInput,
} from "@/lib/sponsorship";
import { formatDate, pct } from "@/lib/utils";

export const metadata = { title: "Learner profile" };

function parseCustomFields(raw: string): CustomField[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((field) => field && typeof field.label === "string")
      .map((field) => ({ label: String(field.label), value: String(field.value ?? "") }));
  } catch {
    return [];
  }
}

function eligibilityTone(status: string): "green" | "amber" | "red" {
  return status === "QUALIFIED" ? "green" : status === "PROVISIONAL" ? "amber" : "red";
}

function eligibilityLabel(status: string) {
  return status === "QUALIFIED" ? "Qualified" : status === "PROVISIONAL" ? "Provisional" : "Not qualified";
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const student = await db.user.findFirst({
    where: {
      id,
      memberships: { some: { tenantId: ctx.tenant.id, role: "STUDENT" } },
    },
    include: {
      memberships: { where: { tenantId: ctx.tenant.id } },
      enrollments: {
        where: { tenantId: ctx.tenant.id },
        include: { course: true },
        orderBy: { createdAt: "desc" },
      },
      attempts: {
        where: { tenantId: ctx.tenant.id },
        include: { assessment: { include: { course: true } } },
        orderBy: { startedAt: "desc" },
      },
      qualifications: {
        where: { tenantId: ctx.tenant.id },
        orderBy: { createdAt: "desc" },
      },
      studentProfiles: { where: { tenantId: ctx.tenant.id } },
    },
  });
  if (!student) notFound();

  const [courses, checks, placements, providers, attendance] = await Promise.all([
    db.course.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.courseEligibility.findMany({
      where: { tenantId: ctx.tenant.id, studentId: id },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.assessment.findMany({
      where: { tenantId: ctx.tenant.id, type: "PLACEMENT", status: "PUBLISHED" },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    providerOptions(ctx.tenant.id),
    db.attendanceRecord.findMany({
      where: { studentId: id, session: { tenantId: ctx.tenant.id } },
      select: { status: true },
    }),
  ]);

  const membership = student.memberships[0];
  const profile = student.studentProfiles[0] ?? null;
  const customFields = parseCustomFields(profile?.customFields ?? "[]");
  const sponsorshipTypeLabel = sponsorshipLabel(profile?.sponsorshipType);
  const sponsorshipCover = sponsorshipDuration(
    profile?.sponsorshipStartDate,
    profile?.sponsorshipEndDate,
    profile?.sponsorshipMonths
  );
  const sponsorshipState = sponsorshipStatus(
    profile?.sponsorshipStartDate,
    profile?.sponsorshipEndDate
  );
  const sponsorshipStateLabel =
    sponsorshipState === "ACTIVE"
      ? "Active"
      : sponsorshipState === "UPCOMING"
        ? "Upcoming"
        : sponsorshipState === "ENDED"
          ? "Ended"
          : "Not set";
  const tab = sp.tab ?? "profile";

  const graded = student.attempts.filter((attempt) => attempt.status === "GRADED");
  const average = graded.length
    ? Math.round(graded.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / graded.length)
    : null;
  const placementAttempts = student.attempts.filter(
    (attempt) => attempt.assessment.type === "PLACEMENT"
  );
  const attended = attendance.filter((record) => ["PRESENT", "LATE"].includes(record.status)).length;
  const attendanceRate = attendance.length ? Math.round((attended / attendance.length) * 100) : null;

  const profileFields = [
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
  const completeness = Math.round(
    (profileFields.filter(Boolean).length / profileFields.length) * 100
  );

  const latestCheckByCourse = new Map<string, (typeof checks)[number]>();
  for (const check of checks) {
    if (!latestCheckByCourse.has(check.courseId)) latestCheckByCourse.set(check.courseId, check);
  }

  return (
    <div>
      <Link
        href="/dashboard/students"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" /> All learners
      </Link>

      <PageHeader
        eyebrow="Learner profile"
        title={
          <span className="flex items-center gap-3">
            <Avatar name={student.name} src={student.avatarUrl} size="lg" />
            <span>
              <span className="block">{student.name}</span>
              <span className="block text-xs font-normal text-slate-400">{student.email}</span>
            </span>
          </span>
        }
        subtitle={
          membership
            ? `${membership.status === "ACTIVE" ? "Active learner" : "Suspended learner"} · joined ${formatDate(membership.createdAt)}`
            : undefined
        }
        actions={
          <>
            <Link href={`/dashboard/insights/${student.id}`} className="btn-secondary btn-sm">
              <Sparkles className="size-3.5" /> Success benchmark
            </Link>
            <Link href={`/dashboard/gradebook`} className="btn-primary btn-sm">
              <GraduationCap className="size-3.5" /> Gradebook
            </Link>
          </>
        }
      />

      {(sp.saved || sp.error) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ??
            (sp.saved === "profile"
              ? "Profile saved."
              : sp.saved === "qualification"
                ? "Qualification added."
                : sp.saved === "qualification-removed"
                  ? "Qualification removed."
                  : sp.saved === "eligibility"
                    ? "Qualification check complete."
                    : sp.saved === "sponsorship"
                      ? "Sponsorship saved."
                      : "Changes saved.")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Courses" value={student.enrollments.length} icon={<Users className="size-4" />} />
        <Stat
          label="Graded work"
          value={graded.length}
          hint={average === null ? "No grades yet" : `${average}% average`}
          icon={<ClipboardCheck className="size-4" />}
        />
        <Stat
          label="Attendance"
          value={attendanceRate === null ? "—" : `${attendanceRate}%`}
          hint={`${attendance.length} registers`}
          icon={<CalendarDays className="size-4" />}
        />
        <Stat
          label="Profile"
          value={`${completeness}%`}
          hint={`${student.qualifications.length} qualification${student.qualifications.length === 1 ? "" : "s"}`}
          icon={<IdCard className="size-4" />}
        />
      </div>

      <div className="mt-6">
        <Tabs
          current={`/dashboard/students/${student.id}?tab=${tab}`}
          items={[
            { href: `/dashboard/students/${student.id}?tab=profile`, label: "Profile" },
            {
              href: `/dashboard/students/${student.id}?tab=qualifications`,
              label: "Qualifications",
              count: student.qualifications.length,
            },
            { href: `/dashboard/students/${student.id}?tab=eligibility`, label: "Qualification checks", count: checks.length },
            { href: `/dashboard/students/${student.id}?tab=placements`, label: "Pre-assessments", count: placementAttempts.length },
            {
              href: `/dashboard/students/${student.id}?tab=sponsorship`,
              label: "Sponsorship",
              count: profile?.sponsorshipType ? 1 : undefined,
            },
          ]}
        />
      </div>

      {tab === "profile" && (
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <form action={saveStudentProfileAction} className="card-pad space-y-6">
            <input type="hidden" name="studentId" value={student.id} />
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <User className="size-4 text-brand-500" /> Personal information
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="legalName">
                    Full legal name
                  </label>
                  <input
                    id="legalName"
                    name="legalName"
                    defaultValue={profile?.legalName ?? student.name}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="studentNumber">
                    Learner ID / number
                  </label>
                  <input
                    id="studentNumber"
                    name="studentNumber"
                    defaultValue={profile?.studentNumber ?? ""}
                    placeholder="e.g. NF-2026-014"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="dateOfBirth">
                    Date of birth
                  </label>
                  <input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    defaultValue={profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="phone">
                    Phone
                  </label>
                  <input id="phone" name="phone" defaultValue={profile?.phone ?? ""} className="input" />
                </div>
              </div>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <MapPin className="size-4 text-brand-500" /> Address
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="address">
                    Street address
                  </label>
                  <input id="address" name="address" defaultValue={profile?.address ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="city">
                    City
                  </label>
                  <input id="city" name="city" defaultValue={profile?.city ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="country">
                    Country
                  </label>
                  <input id="country" name="country" defaultValue={profile?.country ?? ""} className="input" />
                </div>
              </div>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldCheck className="size-4 text-brand-500" /> Next of kin
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="guardianName">
                    Contact name
                  </label>
                  <input
                    id="guardianName"
                    name="guardianName"
                    defaultValue={profile?.guardianName ?? ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="guardianRelationship">
                    Relationship
                  </label>
                  <input
                    id="guardianRelationship"
                    name="guardianRelationship"
                    defaultValue={profile?.guardianRelationship ?? ""}
                    placeholder="Parent, guardian, sibling…"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="guardianPhone">
                    Phone
                  </label>
                  <input
                    id="guardianPhone"
                    name="guardianPhone"
                    defaultValue={profile?.guardianPhone ?? ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="guardianEmail">
                    Email
                  </label>
                  <input
                    id="guardianEmail"
                    name="guardianEmail"
                    type="email"
                    defaultValue={profile?.guardianEmail ?? ""}
                    className="input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="emergencyNotes">
                    Emergency notes
                  </label>
                  <textarea
                    id="emergencyNotes"
                    name="emergencyNotes"
                    rows={2}
                    defaultValue={profile?.emergencyNotes ?? ""}
                    placeholder="Allergies, pickup arrangements, who to call first…"
                    className="textarea"
                  />
                </div>
              </div>
            </div>

            <CustomFieldsEditor initial={customFields} />

            <div>
              <label className="label" htmlFor="notes">
                Internal notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={profile?.notes ?? ""}
                placeholder="Only staff can see this."
                className="textarea"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-[11px] text-slate-400">
                Last updated {profile ? formatDate(profile.updatedAt, true) : "never"}
              </p>
              <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
            </div>
          </form>

          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Mail className="size-4 text-slate-400" /> Account
              </h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="truncate font-medium text-slate-800">{student.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Status</dt>
                  <dd>{membership ? <StatusBadge status={membership.status} /> : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Joined</dt>
                  <dd className="font-medium text-slate-800">{formatDate(membership?.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Last login</dt>
                  <dd className="font-medium text-slate-800">{formatDate(student.lastLoginAt, true)}</dd>
                </div>
              </dl>
            </div>

            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Phone className="size-4 text-slate-400" /> Quick contact
              </h2>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <p className="flex items-center gap-2">
                  <Phone className="size-3 text-slate-400" /> {profile?.phone || "No learner phone"}
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck className="size-3 text-slate-400" />
                  {profile?.guardianName
                    ? `${profile.guardianName}${profile.guardianRelationship ? ` (${profile.guardianRelationship})` : ""}`
                    : "No next of kin yet"}
                </p>
                <p className="flex items-center gap-2">
                  <Home className="size-3 text-slate-400" />
                  {[profile?.city, profile?.country].filter(Boolean).join(", ") || "No address yet"}
                </p>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Courses</h2>
              {student.enrollments.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">Not enrolled in a course yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {student.enrollments.map((enrollment) => (
                    <Link
                      key={enrollment.id}
                      href={`/dashboard/courses/${enrollment.courseId}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">
                        {enrollment.course.title}
                      </span>
                      <Badge tone={enrollment.progress >= 100 ? "green" : "slate"}>
                        {enrollment.progress}%
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "qualifications" && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Award className="size-4 text-amber-500" /> Qualifications
              </h2>
              <p className="text-[11px] text-slate-400">
                Certificates, transcripts and prior study used in qualification checks.
              </p>
            </div>
            {student.qualifications.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Award className="size-5" />}
                  title="No qualifications yet"
                  description="Add a certificate or prior qualification to strengthen the learner's profile."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {student.qualifications.map((qualification) => (
                  <li key={qualification.id} className="flex items-start gap-3 px-5 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <Award className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900">{qualification.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {[qualification.institution, qualification.year, qualification.grade]
                          .filter(Boolean)
                          .join(" · ") || "No details"}
                      </p>
                      {qualification.documentUrl && (
                        <a
                          href={qualification.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline"
                        >
                          <Download className="size-3" /> View document
                        </a>
                      )}
                    </div>
                    <form action={deleteQualificationAction}>
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="qualificationId" value={qualification.id} />
                      <SubmitButton
                        variant="ghost"
                        className="btn-sm text-rose-600"
                        confirm="Remove this qualification?"
                      >
                        <Trash2 className="size-3.5" />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={addQualificationAction} className="card-pad space-y-3">
            <input type="hidden" name="studentId" value={student.id} />
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Plus className="size-4 text-brand-500" /> Add qualification
            </h2>
            <div>
              <label className="label" htmlFor="q-title">
                Title
              </label>
              <input id="q-title" name="title" required placeholder="GCSE Mathematics" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="q-institution">
                Institution
              </label>
              <input id="q-institution" name="institution" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="q-year">
                  Year
                </label>
                <input id="q-year" name="year" type="number" min={1950} max={2100} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="q-grade">
                  Grade
                </label>
                <input id="q-grade" name="grade" placeholder="A*, 92%" className="input" />
              </div>
            </div>
            <UploadField
              name="documentUrl"
              label="Certificate (optional)"
              accept="application/pdf,image/*"
              compact
              hint="PDF or image, 25 MB max"
            />
            <SubmitButton className="w-full" pendingText="Adding…">
              <Plus className="size-3.5" /> Add qualification
            </SubmitButton>
          </form>
        </div>
      )}

      {tab === "eligibility" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <form action={runEligibilityAction} className="card-pad space-y-3">
              <input type="hidden" name="studentId" value={student.id} />
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles className="size-4 text-violet-500" /> Run a qualification check
              </h2>
              <p className="text-[11px] leading-5 text-slate-500">
                A local, explainable score is always produced from placement results, grades,
                attendance, qualifications and profile completeness. Choose a hosted model to refine
                the narrative.
              </p>
              <div>
                <label className="label" htmlFor="eligibility-course">
                  Course
                </label>
                <select id="eligibility-course" name="courseId" required className="select">
                  <option value="">Choose a course…</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                      {latestCheckByCourse.has(course.id)
                        ? ` — ${eligibilityLabel(latestCheckByCourse.get(course.id)!.status)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="eligibility-provider">
                  Model
                </label>
                <select id="eligibility-provider" name="provider" className="select">
                  {providers.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="w-full" pendingText="Assessing…">
                <Sparkles className="size-3.5" /> Assess qualification
              </SubmitButton>
            </form>

            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">How it is scored</h2>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-500">
                <li>Placement pre-assessment result is the strongest signal.</li>
                <li>Graded course work and attendance add supporting evidence.</li>
                <li>Qualifications and a complete profile nudge borderline learners up.</li>
                <li>Hosted AI can refine the summary but stays close to the local score.</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            {checks.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="size-5" />}
                title="No qualification checks yet"
                description="Run a check to see whether this learner meets the course entry benchmark."
              />
            ) : (
              checks.map((check) => {
                const reasons = parseEligibilityReasons(check.reasons);
                return (
                  <div key={check.id} className="card overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{check.course.title}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatDate(check.createdAt, true)} ·{" "}
                          {check.source === "AI"
                            ? `${check.provider ?? "AI"} · ${check.model ?? "model"}`
                            : "Local assessment"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={eligibilityTone(check.status)}>{eligibilityLabel(check.status)}</Badge>
                        <span className="text-sm font-bold text-slate-900">{Math.round(check.score)}%</span>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[12px] leading-5 text-slate-600">{check.summary}</p>
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                        <span>Confidence {Math.round(check.confidence)}%</span>
                        <span>Benchmark {Math.round(check.score)} / 100</span>
                      </div>
                      {check.error && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
                          {check.error}
                        </p>
                      )}
                      {reasons.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {reasons.map((reason) => (
                            <li key={`${check.id}-${reason.label}`} className="flex items-start gap-2 text-[11px]">
                              <span
                                className={`mt-1 size-1.5 shrink-0 rounded-full ${
                                  reason.status === "PASS"
                                    ? "bg-emerald-500"
                                    : reason.status === "WARN"
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                }`}
                              />
                              <span>
                                <span className="font-semibold text-slate-700">{reason.label}:</span>{" "}
                                <span className="text-slate-500">{reason.detail}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === "placements" && (
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ClipboardCheck className="size-4 text-brand-500" /> Placement attempts
              </h2>
              <p className="text-[11px] text-slate-400">
                Pre-assessments determine readiness before enrolment.
              </p>
            </div>
            {placementAttempts.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ClipboardCheck className="size-5" />}
                  title="No placement attempts"
                  description="Share a learner link below so this learner can take a placement pre-assessment."
                />
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Pre-assessment</th>
                    <th>Course</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {placementAttempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="font-medium text-slate-800">{attempt.assessment.title}</td>
                      <td className="text-[11px] text-slate-500">{attempt.assessment.course.title}</td>
                      <td className="font-semibold text-slate-800">
                        {attempt.score === null ? "—" : `${Math.round(pct(attempt.score, attempt.maxScore))}%`}
                      </td>
                      <td>
                        <StatusBadge status={attempt.status} />
                      </td>
                      <td className="text-[11px] text-slate-500">{formatDate(attempt.startedAt)}</td>
                      <td className="text-right">
                        <Link
                          href={`/results/${attempt.id}`}
                          className="text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Available placement pre-assessments</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Copy a learner link and share it with {student.name.split(" ")[0]}. Placement attempts
              are allowed before enrolment.
            </p>
            {placements.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-[11px] text-slate-400">
                No published placement assessments yet. Create one from a course&apos;s Assessments tab.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {placements.map((placement) => (
                  <div
                    key={placement.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{placement.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {placement.course.title} · {placement.attemptsAllowed} attempt
                        {placement.attemptsAllowed === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <CopyButton value={appUrl(`/quiz/${placement.id}`)} label="Copy learner link" />
                      <Link
                        href={`/dashboard/assessments/${placement.id}`}
                        className="btn-ghost btn-sm"
                      >
                        <FileText className="size-3.5" /> Builder
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sponsorship" && (
        <div className="space-y-5">
          <section className="card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Wallet className="size-4 text-brand-500" /> Sponsorship
                </h2>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                  Record how {student.name.split(" ")[0]} is funded, who is paying, and the period covered.
                </p>
              </div>
              <Badge
                tone={
                  sponsorshipState === "ACTIVE"
                    ? "green"
                    : sponsorshipState === "UPCOMING"
                      ? "sky"
                      : sponsorshipState === "ENDED"
                        ? "slate"
                        : "amber"
                }
              >
                {sponsorshipStateLabel}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="stat-label">Type</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{sponsorshipTypeLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="stat-label">Provider</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                  {profile?.sponsorshipProvider ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="stat-label">Duration</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Clock className="size-3.5 text-slate-400" /> {sponsorshipCover}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="stat-label">Cover period</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-800">
                  {profile?.sponsorshipStartDate
                    ? `${formatDate(profile.sponsorshipStartDate)} → ${
                        profile.sponsorshipEndDate ? formatDate(profile.sponsorshipEndDate) : "ongoing"
                      }`
                    : "No dates recorded"}
                </p>
              </div>
            </div>
          </section>

          <form action={saveSponsorshipAction} className="card-pad space-y-5">
            <input type="hidden" name="studentId" value={student.id} />
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 className="size-4 text-brand-500" /> Sponsorship details
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Choose a sponsorship type and add the sponsor, reference and cover period.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sponsorshipType">
                  Sponsorship type
                </label>
                <select
                  id="sponsorshipType"
                  name="sponsorshipType"
                  defaultValue={profile?.sponsorshipType ?? "SELF"}
                  className="select"
                >
                  <option value="">Not set</option>
                  {SPONSORSHIP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SPONSORSHIP_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="sponsorshipProvider">
                  Sponsor / provider
                </label>
                <input
                  id="sponsorshipProvider"
                  name="sponsorshipProvider"
                  defaultValue={profile?.sponsorshipProvider ?? ""}
                  placeholder="e.g. Northfield Opportunity Fund"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="sponsorshipReference">
                  Reference number
                </label>
                <input
                  id="sponsorshipReference"
                  name="sponsorshipReference"
                  defaultValue={profile?.sponsorshipReference ?? ""}
                  placeholder="e.g. BURS-2026-0142"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="sponsorshipMonths">
                  Duration (months)
                </label>
                <input
                  id="sponsorshipMonths"
                  name="sponsorshipMonths"
                  type="number"
                  min="0"
                  max="600"
                  defaultValue={profile?.sponsorshipMonths ?? ""}
                  placeholder="e.g. 12"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="sponsorshipStartDate">
                  Start date
                </label>
                <input
                  id="sponsorshipStartDate"
                  name="sponsorshipStartDate"
                  type="date"
                  defaultValue={toSponsorshipDateInput(profile?.sponsorshipStartDate)}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="sponsorshipEndDate">
                  End date
                </label>
                <input
                  id="sponsorshipEndDate"
                  name="sponsorshipEndDate"
                  type="date"
                  defaultValue={toSponsorshipDateInput(profile?.sponsorshipEndDate)}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="sponsorshipNotes">
                Notes
              </label>
              <textarea
                id="sponsorshipNotes"
                name="sponsorshipNotes"
                rows={3}
                defaultValue={profile?.sponsorshipNotes ?? ""}
                placeholder="Payment terms, renewal conditions, work hours…"
                className="textarea"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="max-w-xl text-[11px] leading-5 text-slate-500">
                Leave dates blank if the cover period is still being arranged. Duration can be used on its own;
                end date is calculated from the start date when both are provided.
              </p>
              <SubmitButton pendingText="Saving…">
                <Wallet className="size-3.5" /> Save sponsorship
              </SubmitButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
