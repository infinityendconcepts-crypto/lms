"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { providerMeta } from "@/lib/ai/catalog";
import { encryptSecret, secretHint } from "@/lib/ai/crypto";
import { runtimeFromConfig, testProvider } from "@/lib/ai/providers";
import { runBenchmark } from "@/lib/ai/benchmark";

function encode(value: string) {
  return encodeURIComponent(value.slice(0, 500));
}

function safeBaseUrl(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function saveAiProviderAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const providerId = String(formData.get("provider") ?? "").trim();
  const meta = providerMeta(providerId);
  if (!meta) redirect("/dashboard/settings?tab=ai&error=Choose+a+supported+provider");

  const model = String(formData.get("model") ?? "").trim() || meta.defaultModel;
  if (!model) redirect("/dashboard/settings?tab=ai&error=Enter+a+model+name");

  const rawBaseUrl = String(formData.get("baseUrl") ?? "").trim();
  const baseUrl = rawBaseUrl ? safeBaseUrl(rawBaseUrl) : meta.baseUrl || null;
  if (rawBaseUrl && !baseUrl) {
    redirect("/dashboard/settings?tab=ai&error=Base+URL+must+start+with+http+or+https");
  }
  if (!baseUrl) {
    redirect("/dashboard/settings?tab=ai&error=Enter+an+API+base+URL+for+this+provider");
  }

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 60) || null;
  const makeDefault = String(formData.get("isDefault") ?? "") === "on";

  const existing = await db.aiProviderConfig.findUnique({
    where: {
      tenantId_provider_model: {
        tenantId: ctx.tenant.id,
        provider: providerId,
        model,
      },
    },
  });

  if (!apiKey && !existing?.apiKeyEnc && !meta.keyOptional) {
    redirect("/dashboard/settings?tab=ai&error=An+API+key+is+required+for+this+provider");
  }

  const apiKeyEnc = apiKey ? encryptSecret(apiKey) : existing?.apiKeyEnc ?? null;
  const apiKeyHint = apiKey ? secretHint(apiKey) : existing?.apiKeyHint ?? null;
  const configCount = await db.aiProviderConfig.count({
    where: { tenantId: ctx.tenant.id },
  });

  const saved = await db.$transaction(async (tx) => {
    const shouldDefault = makeDefault || configCount === 0;
    if (shouldDefault) {
      await tx.aiProviderConfig.updateMany({
        where: { tenantId: ctx.tenant.id },
        data: { isDefault: false },
      });
    }
    const row = await tx.aiProviderConfig.upsert({
      where: {
        tenantId_provider_model: {
          tenantId: ctx.tenant.id,
          provider: providerId,
          model,
        },
      },
      create: {
        tenantId: ctx.tenant.id,
        provider: providerId,
        label,
        model,
        baseUrl,
        apiKeyEnc,
        apiKeyHint,
        isDefault: shouldDefault,
        enabled: true,
      },
      update: {
        label,
        baseUrl,
        apiKeyEnc,
        apiKeyHint,
        isDefault: shouldDefault ? true : existing?.isDefault ?? false,
        enabled: true,
        lastError: null,
      },
    });
    return row;
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "ai.provider_saved",
    target: saved.id,
    meta: { provider: providerId, model, baseUrl, hasKey: Boolean(apiKeyEnc) },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/insights");
  redirect("/dashboard/settings?tab=ai&saved=1");
}

export async function setDefaultAiProviderAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const id = String(formData.get("providerId") ?? "");
  const config = await db.aiProviderConfig.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!config) redirect("/dashboard/settings?tab=ai&error=Model+not+found");

  await db.$transaction([
    db.aiProviderConfig.updateMany({
      where: { tenantId: ctx.tenant.id },
      data: { isDefault: false },
    }),
    db.aiProviderConfig.update({
      where: { id: config.id },
      data: { isDefault: true, enabled: true },
    }),
  ]);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "ai.provider_default",
    target: config.id,
    meta: { provider: config.provider, model: config.model },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/insights");
  redirect("/dashboard/settings?tab=ai&saved=1");
}

export async function deleteAiProviderAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const id = String(formData.get("providerId") ?? "");
  const config = await db.aiProviderConfig.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!config) redirect("/dashboard/settings?tab=ai&error=Model+not+found");

  await db.$transaction(async (tx) => {
    await tx.aiProviderConfig.delete({ where: { id: config.id } });
    if (config.isDefault) {
      const next = await tx.aiProviderConfig.findFirst({
        where: { tenantId: ctx.tenant.id },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await tx.aiProviderConfig.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "ai.provider_deleted",
    target: config.id,
    meta: { provider: config.provider, model: config.model },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/insights");
  redirect("/dashboard/settings?tab=ai&providerRemoved=1");
}

export async function testAiProviderAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const id = String(formData.get("providerId") ?? "");
  const config = await db.aiProviderConfig.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!config) redirect("/dashboard/settings?tab=ai&error=Model+not+found");

  const started = Date.now();
  let failure: string | null = null;
  try {
    await testProvider(runtimeFromConfig(config));
    await db.aiProviderConfig.update({
      where: { id: config.id },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "Connection test failed.";
    await db.aiProviderConfig.update({
      where: { id: config.id },
      data: { lastCheckedAt: new Date(), lastError: failure.slice(0, 400) },
    });
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "ai.provider_tested",
    target: config.id,
    meta: failure
      ? { ok: false, error: failure.slice(0, 200) }
      : { ok: true, latencyMs: Date.now() - started },
  });
  revalidatePath("/dashboard/settings");
  if (failure) {
    redirect(`/dashboard/settings?tab=ai&error=${encode(failure)}`);
  }
  redirect("/dashboard/settings?tab=ai&tested=1");
}

export async function runBenchmarkAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const providerChoice = String(formData.get("provider") ?? "auto");
  const courseIdRaw = String(formData.get("courseId") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim() || null;

  let courseId: string | null = null;
  if (courseIdRaw) {
    const course = await db.course.findFirst({
      where: { id: courseIdRaw, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!course) {
      redirect(`/dashboard/insights?error=${encode("Course not found in this workspace.")}`);
    }
    courseId = course.id;
  }

  if (studentId) {
    const membership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: studentId } },
      select: { role: true },
    });
    if (!membership || membership.role !== "STUDENT") {
      redirect(`/dashboard/insights?error=${encode("Learner not found in this workspace.")}`);
    }
  }

  const targetBase = studentId ? `/dashboard/insights/${studentId}` : "/dashboard/insights";

  let run: Awaited<ReturnType<typeof runBenchmark>> | null = null;
  let message: string | null = null;
  try {
    run = await runBenchmark({
      tenantId: ctx.tenant.id,
      courseId,
      studentId,
      providerChoice,
      actorId: ctx.user.id,
    });
  } catch (err) {
    message = err instanceof Error ? err.message : "Benchmark failed.";
  }

  const params = new URLSearchParams();
  if (run) {
    params.set("run", run.runId);
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "ai.benchmark_run",
      target: run.runId,
      meta: {
        provider: run.provider,
        model: run.model,
        source: run.source,
        status: run.status,
        students: run.studentCount,
        latencyMs: run.latencyMs,
      },
    });
    revalidatePath("/dashboard/insights");
    if (studentId) revalidatePath(`/dashboard/insights/${studentId}`);
  } else {
    params.set("error", (message ?? "Benchmark failed.").slice(0, 500));
  }
  if (courseId && !studentId) params.set("course", courseId);
  redirect(`${targetBase}?${params.toString()}`);
}
