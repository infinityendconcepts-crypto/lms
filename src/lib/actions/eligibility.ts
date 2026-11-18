"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { runEligibilityCheck } from "@/lib/ai/eligibility";

export async function runEligibilityAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const providerChoice = String(formData.get("provider") ?? "auto");

  let error: string | null = null;
  try {
    await runEligibilityCheck({
      tenantId: ctx.tenant.id,
      courseId,
      studentId,
      providerChoice,
      actorId: ctx.user.id,
    });
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "eligibility.checked",
      target: studentId,
      meta: { courseId, provider: providerChoice },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "The qualification check failed.";
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(
    `/dashboard/students/${studentId}?tab=eligibility&${
      error ? `error=${encodeURIComponent(error)}` : "saved=eligibility"
    }`
  );
}
