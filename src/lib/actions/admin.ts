"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { PLANS, type PlanId } from "@/lib/plans";
import { nowMs, randomSuffix, slugify } from "@/lib/utils";

const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"] as const;
type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

function parseAdminDate(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createAdminWorkspaceAction(formData: FormData) {
  const session = await requireSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const kind = String(formData.get("kind") ?? "SCHOOL") === "TEACHER" ? "TEACHER" : "SCHOOL";
  const planId = String(formData.get("plan") ?? "") as PlanId;
  const statusRaw = String(formData.get("status") ?? "TRIALING");
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const hasCustomSlug = slugRaw.length > 0;

  if (name.length < 2 || name.length > 80) redirect("/admin?error=Workspace+name+must+be+2-80+characters");
  if (!(planId in PLANS)) redirect("/admin?error=Unknown+plan");
  if (!isSubscriptionStatus(statusRaw)) redirect("/admin?error=Unknown+subscription+status");
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    redirect("/admin?error=Owner+email+is+not+valid");
  }

  const baseSlug = slugify(hasCustomSlug ? slugRaw : name) || "workspace";
  let slug = baseSlug;
  if (hasCustomSlug) {
    if (await db.tenant.findUnique({ where: { slug }, select: { id: true } })) {
      redirect("/admin?error=That+workspace+slug+is+already+in+use");
    }
  } else {
    let unique = false;
    for (let i = 0; i < 5 && !unique; i += 1) {
      const clash = await db.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (!clash) {
        unique = true;
        break;
      }
      slug = `${baseSlug}-${randomSuffix()}`;
    }
    if (!unique) slug = `${baseSlug}-${randomSuffix(8)}`;
  }

  const owner = ownerEmail
    ? await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true, email: true } })
    : { id: session.user.id, email: session.user.email };
  if (!owner) redirect("/admin?error=No+user+found+with+that+owner+email");

  const plan = PLANS[planId];
  const startsAt = nowMs();
  const trialEndsAt = statusRaw === "TRIALING" ? new Date(startsAt + 14 * 86_400_000) : null;
  const currentPeriodEnd =
    statusRaw === "TRIALING" ? trialEndsAt : new Date(startsAt + 30 * 86_400_000);

  const tenant = await db.tenant.create({
    data: {
      name: name.slice(0, 80),
      slug,
      kind,
      brandColor: "#4f46e5",
      headline:
        kind === "TEACHER"
          ? "Independent teaching workspace."
          : "A focused learning workspace on Nkanyezi LMS.",
      trialEndsAt,
      subscription: {
        create: {
          plan: plan.id,
          seats: plan.seats ?? 999_999,
          status: statusRaw,
          currentPeriodEnd,
        },
      },
      memberships: {
        create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
      },
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: session.user.id,
    action: "admin.workspace.created",
    target: tenant.id,
    meta: { name: tenant.name, slug, plan: plan.id, status: statusRaw, owner: owner.email },
  });
  revalidatePath("/admin");
  redirect(`/admin?saved=Workspace+${encodeURIComponent(name)}+created`);
}

export async function updateWorkspaceAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? ""));
  const kind = String(formData.get("kind") ?? "SCHOOL") === "TEACHER" ? "TEACHER" : "SCHOOL";
  const brandRaw = String(formData.get("brandColor") ?? "").trim();
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(brandRaw) ? brandRaw : "#4f46e5";
  const headline = String(formData.get("headline") ?? "").trim() || null;

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) redirect("/admin?error=Workspace+not+found");
  if (name.length < 2 || name.length > 80 || !slug) {
    redirect("/admin?error=Name+and+slug+are+required");
  }
  const slugClash = await db.tenant.findFirst({
    where: { slug, id: { not: tenantId } },
    select: { id: true },
  });
  if (slugClash) redirect("/admin?error=That+workspace+slug+is+already+in+use");

  await db.tenant.update({
    where: { id: tenantId },
    data: { name: name.slice(0, 80), slug, kind, brandColor, headline },
  });
  await audit({
    tenantId,
    actorId: session.user.id,
    action: "admin.workspace.updated",
    target: tenantId,
    meta: { name, slug, kind },
  });
  revalidatePath("/admin");
  redirect("/admin?saved=Workspace+details+updated");
}

export async function updateSubscriptionAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const tenantId = String(formData.get("tenantId") ?? "");
  const planId = String(formData.get("plan") ?? "") as PlanId;
  const statusRaw = String(formData.get("status") ?? "ACTIVE");
  if (!(planId in PLANS)) redirect("/admin?error=Unknown+plan");
  if (!isSubscriptionStatus(statusRaw)) redirect("/admin?error=Unknown+subscription+status");

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) redirect("/admin?error=Workspace+not+found");

  const plan = PLANS[planId];
  const seatsRaw = String(formData.get("seats") ?? "").trim();
  const seats = seatsRaw ? Math.floor(Number(seatsRaw)) : (plan.seats ?? 999_999);
  if (!Number.isFinite(seats) || seats < 1 || seats > 1_000_000) {
    redirect("/admin?error=Seats+must+be+between+1+and+1000000");
  }
  const renewsRaw = String(formData.get("renewsOn") ?? "");
  const parsedRenews = parseAdminDate(renewsRaw);
  if (renewsRaw && !parsedRenews) redirect("/admin?error=Renewal+date+is+not+valid");
  const cancelAtPeriodEnd = formData.get("cancelAtPeriodEnd") === "on";

  await db.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      plan: plan.id,
      seats,
      status: statusRaw,
      currentPeriodEnd: parsedRenews ?? new Date(nowMs() + 30 * 86_400_000),
      cancelAtPeriodEnd,
    },
    update: {
      plan: plan.id,
      seats,
      status: statusRaw,
      currentPeriodEnd: parsedRenews,
      cancelAtPeriodEnd,
    },
  });

  await audit({
    tenantId,
    actorId: session.user.id,
    action: "admin.subscription.managed",
    target: tenantId,
    meta: { plan: plan.id, seats, status: statusRaw, cancelAtPeriodEnd },
  });
  revalidatePath("/admin");
  redirect("/admin?saved=Subscription+details+updated");
}

export async function toggleTenantSuspendedAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const tenantId = String(formData.get("tenantId") ?? "");
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/admin?error=Workspace+not+found");

  await db.tenant.update({
    where: { id: tenantId },
    data: { suspended: !tenant.suspended },
  });
  await audit({
    tenantId,
    actorId: session.user.id,
    action: tenant.suspended ? "admin.tenant.unsuspended" : "admin.tenant.suspended",
    target: tenantId,
    meta: { name: tenant.name },
  });
  revalidatePath("/admin");
  redirect(`/admin?saved=${tenant.suspended ? "Workspace+restored" : "Workspace+suspended"}`);
}

export async function updateTenantPlanAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const tenantId = String(formData.get("tenantId") ?? "");
  const planId = String(formData.get("plan") ?? "") as PlanId;
  const status = String(formData.get("status") ?? "ACTIVE");
  if (!(planId in PLANS)) redirect("/admin?error=Unknown+plan");

  const plan = PLANS[planId];
  await db.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      plan: plan.id,
      seats: plan.seats ?? 999_999,
      status,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
    update: {
      plan: plan.id,
      seats: plan.seats ?? 999_999,
      status,
    },
  });
  await audit({
    tenantId,
    actorId: session.user.id,
    action: "admin.subscription.updated",
    target: tenantId,
    meta: { plan: plan.id, status },
  });
  revalidatePath("/admin");
  redirect("/admin?saved=Subscription+updated");
}

export async function extendTrialAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const tenantId = String(formData.get("tenantId") ?? "");
  const days = Number(formData.get("days") ?? 14);
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/admin?error=Workspace+not+found");

  const base = tenant.trialEndsAt && tenant.trialEndsAt.getTime() > Date.now() ? tenant.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + Math.max(1, days) * 86_400_000);
  await db.tenant.update({ where: { id: tenantId }, data: { trialEndsAt } });
  await db.subscription.updateMany({
    where: { tenantId, status: "TRIALING" },
    data: { currentPeriodEnd: trialEndsAt },
  });
  await audit({
    tenantId,
    actorId: session.user.id,
    action: "admin.trial.extended",
    target: tenantId,
    meta: { days, trialEndsAt },
  });
  revalidatePath("/admin");
  redirect(`/admin?saved=Trial+extended+${days}+days`);
}

export async function toggleSuperAdminAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (userId === session.user.id) redirect("/admin?error=You+cannot+change+your+own+super+admin+access");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/admin?error=User+not+found");

  await db.user.update({ where: { id: userId }, data: { isSuperAdmin: !user.isSuperAdmin } });
  await audit({
    actorId: session.user.id,
    action: user.isSuperAdmin ? "admin.superadmin.revoked" : "admin.superadmin.granted",
    target: userId,
    meta: { email: user.email },
  });
  revalidatePath("/admin");
  redirect("/admin?saved=Super+admin+access+updated");
}
