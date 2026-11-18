import "server-only";

import { z } from "zod";
import type { AiProviderConfig } from "@prisma/client";
import { db } from "@/lib/db";
import { providerLabel } from "./catalog";
import { riskBandFor, type RiskBand } from "./format";
import {
  aiPayload,
  buildStudentFeatures,
  type BenchmarkDriver,
  type StudentFeatures,
} from "./analytics";
import {
  callProvider,
  envRuntimeFor,
  extractJson,
  listEnvProviders,
  runtimeFromConfig,
  type ProviderRuntime,
} from "./providers";

const MAX_STUDENTS_PER_RUN = 80;
const CHUNK_SIZE = 8;

const DriverSchema = z.object({
  label: z.string(),
  impact: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).optional(),
  detail: z.string(),
});

const AiStudentSchema = z.object({
  studentId: z.string(),
  successProbability: z.number(),
  confidence: z.number().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  drivers: z.array(DriverSchema).optional(),
  recommendations: z.array(z.string()).optional(),
});

const AiResponseSchema = z.object({
  students: z.array(AiStudentSchema),
});

export type ProviderOption = {
  value: string;
  label: string;
  detail: string;
  kind: "HEURISTIC" | "AI";
};

export type RunResult = {
  runId: string;
  provider: string;
  model: string;
  source: "HEURISTIC" | "AI";
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  studentCount: number;
  latencyMs: number;
  error: string | null;
};

/** Options rendered in the benchmark form. `auto` always resolves safely. */
export async function providerOptions(tenantId: string): Promise<ProviderOption[]> {
  const configs = await db.aiProviderConfig.findMany({
    where: { tenantId, enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, provider: true, label: true, model: true, isDefault: true },
  });
  const envs = listEnvProviders().filter((env) => env.configured);

  return [
    {
      value: "auto",
      label: "Auto (best available)",
      detail: "Uses your default saved model, then an environment key, then the local model.",
      kind: "AI",
    },
    ...configs.map((config) => ({
      value: `config:${config.id}`,
      label: `${config.label?.trim() || providerLabel(config.provider)} · ${config.model}`,
      detail: `${config.isDefault ? "Default · " : ""}saved in this workspace`,
      kind: "AI" as const,
    })),
    ...envs.map((env) => ({
      value: `env:${env.id}`,
      label: `${env.label} · ${env.model}`,
      detail: "Configured through environment variables",
      kind: "AI" as const,
    })),
    {
      value: "heuristic",
      label: "Local model (no API key)",
      detail: "Private, instant, deterministic baseline built from attendance and grades.",
      kind: "HEURISTIC",
    },
  ];
}

export async function resolveRuntime(
  tenantId: string,
  choice: string
): Promise<{ runtime: ProviderRuntime | null; label: string }> {
  const configs = await db.aiProviderConfig.findMany({
    where: { tenantId, enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  if (choice === "heuristic") {
    return { runtime: null, label: "Local model" };
  }

  if (choice.startsWith("config:")) {
    const id = choice.slice("config:".length);
    const config = configs.find((c: AiProviderConfig) => c.id === id);
    if (!config) throw new Error("That saved model is no longer available.");
    return { runtime: runtimeFromConfig(config), label: config.model };
  }

  if (choice.startsWith("env:")) {
    const id = choice.slice("env:".length);
    const runtime = envRuntimeFor(id);
    if (!runtime) throw new Error("That environment provider is not configured.");
    return { runtime, label: runtime.model };
  }

  // auto
  if (configs.length > 0) {
    return { runtime: runtimeFromConfig(configs[0]), label: configs[0].model };
  }
  const env = listEnvProviders().find((provider) => provider.configured);
  if (env) {
    const runtime = envRuntimeFor(env.id);
    if (runtime) return { runtime, label: runtime.model };
  }
  return { runtime: null, label: "Local model" };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function systemPrompt() {
  return [
    "You are Nkanyezi's student success analyst.",
    "Estimate how likely each learner is to stay on track and pass their courses.",
    "Use ONLY the supplied data. Do not invent facts and do not infer protected traits, diagnoses or family circumstances.",
    "Weigh attendance (present, late, absent, excused), task grades, submission completeness, overdue work, lesson progress, engagement recency and grade trend.",
    "A deterministic baseline is supplied. Refine it only when the evidence justifies it; stay within about 25 points of the baseline unless there is strong evidence.",
    "Calibrate 0 = almost certain to fail or disengage, 100 = almost certain to succeed. Most learners should fall between 25 and 90.",
    "Set confidence 0-100 based on how much evidence is available.",
    "Return STRICT JSON only, with no prose and no markdown fences:",
    '{"students":[{"studentId":"...","successProbability":0,"confidence":0,"headline":"short label","summary":"2-3 supportive, specific sentences","drivers":[{"label":"...","impact":"POSITIVE|NEGATIVE|NEUTRAL","detail":"..."}],"recommendations":["..."]}]}',
    "Return exactly one entry per supplied student, using the supplied studentId verbatim.",
    "Recommendations must be practical actions a teacher can take this week.",
  ].join(" ");
}

function userPrompt(cohort: StudentFeatures[]) {
  return JSON.stringify({
    task: "estimate_student_success",
    students: cohort.map(aiPayload),
  });
}

function normaliseDrivers(
  aiDrivers: z.infer<typeof DriverSchema>[] | undefined,
  fallback: BenchmarkDriver[]
): BenchmarkDriver[] {
  if (!aiDrivers || aiDrivers.length === 0) return fallback.slice(0, 7);
  return aiDrivers.slice(0, 7).map((driver) => ({
    label: driver.label.trim().slice(0, 80) || "Signal",
    impact: driver.impact ?? "NEUTRAL",
    detail: driver.detail.trim().slice(0, 400),
  }));
}

function mergePrediction(
  features: StudentFeatures,
  ai: z.infer<typeof AiStudentSchema> | undefined
): {
  successProbability: number;
  confidence: number;
  riskBand: RiskBand;
  headline: string;
  summary: string;
  drivers: BenchmarkDriver[];
  recommendations: string[];
  source: "HEURISTIC" | "AI";
} {
  const base = features.heuristic;
  if (!ai) {
    return {
      successProbability: base.successProbability,
      confidence: base.confidence,
      riskBand: base.riskBand,
      headline: base.headline,
      summary: base.summary,
      drivers: base.drivers,
      recommendations: base.recommendations,
      source: "HEURISTIC",
    };
  }

  const probability = Math.min(99, Math.max(1, Math.round(ai.successProbability)));
  const confidence = Math.min(
    99,
    Math.max(5, Math.round(ai.confidence ?? base.confidence))
  );
  return {
    successProbability: probability,
    confidence,
    riskBand: riskBandFor(probability),
    headline: (ai.headline?.trim() || base.headline).slice(0, 120),
    summary: (ai.summary?.trim() || base.summary).slice(0, 1200),
    drivers: normaliseDrivers(ai.drivers, base.drivers),
    recommendations:
      ai.recommendations && ai.recommendations.length > 0
        ? ai.recommendations
            .map((item) => item.trim().slice(0, 240))
            .filter(Boolean)
            .slice(0, 4)
        : base.recommendations,
    source: "AI",
  };
}

export async function runBenchmark(input: {
  tenantId: string;
  courseId?: string | null;
  studentId?: string | null;
  providerChoice: string;
  actorId?: string | null;
}): Promise<RunResult> {
  const { tenantId, courseId, studentId } = input;
  const startedAt = Date.now();

  const allFeatures = await buildStudentFeatures(db, {
    tenantId,
    courseId: courseId || null,
    studentIds: studentId ? [studentId] : undefined,
  });
  if (allFeatures.length === 0) {
    throw new Error("No learners match this scope yet.");
  }

  const { runtime } = await resolveRuntime(tenantId, input.providerChoice || "auto");
  const features = allFeatures.slice(0, MAX_STUDENTS_PER_RUN);
  const truncated = allFeatures.length > features.length;

  let predictions = new Map<string, z.infer<typeof AiStudentSchema>>();
  let status: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";
  let error: string | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let source: "HEURISTIC" | "AI" = runtime ? "AI" : "HEURISTIC";

  if (runtime) {
    try {
      for (const cohort of chunk(features, CHUNK_SIZE)) {
        const result = await callProvider(runtime, {
          system: systemPrompt(),
          user: userPrompt(cohort),
          maxTokens: 3000,
          temperature: 0.2,
        });
        tokensIn += result.tokensIn;
        tokensOut += result.tokensOut;

        const parsed = AiResponseSchema.parse(extractJson(result.text));
        const validIds = new Set(cohort.map((student) => student.studentId));
        for (const prediction of parsed.students) {
          if (validIds.has(prediction.studentId)) {
            predictions.set(prediction.studentId, prediction);
          }
        }
      }
      if (predictions.size === 0) {
        throw new Error("The model returned no usable predictions.");
      }
      if (predictions.size < features.length) status = "PARTIAL";
    } catch (err) {
      status = "FAILED";
      source = "HEURISTIC";
      predictions = new Map();
      error = err instanceof Error ? err.message : "The model provider failed.";
    }
  }

  if (truncated && !error) {
    error = `Only the first ${MAX_STUDENTS_PER_RUN} learners were benchmarked. Narrow the course filter for a full run.`;
  }

  const latencyMs = Date.now() - startedAt;
  const provider = runtime ? runtime.id : "local";
  const model = runtime ? runtime.model : "nkanyezi-local-v1";

  const run = await db.aiBenchmarkRun.create({
    data: {
      tenantId,
      courseId: courseId || null,
      providerConfigId: runtime?.configId ?? null,
      provider,
      model,
      source,
      status,
      studentCount: features.length,
      okCount: features.length,
      error,
      tokensIn,
      tokensOut,
      latencyMs,
      createdById: input.actorId ?? null,
    },
  });

  const rows = features.map((student) => {
    const prediction = mergePrediction(student, predictions.get(student.studentId));
    return {
      tenantId,
      runId: run.id,
      studentId: student.studentId,
      courseId: courseId || null,
      successProbability: prediction.successProbability,
      confidence: prediction.confidence,
      riskBand: prediction.riskBand,
      headline: prediction.headline,
      summary: prediction.summary,
      drivers: JSON.stringify(prediction.drivers),
      recommendations: JSON.stringify(prediction.recommendations),
      features: JSON.stringify(student),
      source: prediction.source,
      provider: prediction.source === "AI" ? provider : "local",
      model: prediction.source === "AI" ? model : "nkanyezi-local-v1",
    };
  });

  await db.successBenchmark.createMany({ data: rows });

  return {
    runId: run.id,
    provider,
    model,
    source,
    status,
    studentCount: features.length,
    latencyMs,
    error,
  };
}
