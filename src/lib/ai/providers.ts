import "server-only";

import type { AiProviderConfig } from "@prisma/client";
import { AI_PROVIDERS, providerMeta, type ProviderKind } from "./catalog";
import { decryptSecret } from "./crypto";

export type ProviderRuntime = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  source: "ENV" | "SAVED";
  configId?: string;
};

export type EnvProviderStatus = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  keyEnv: string[];
  keyOptional: boolean;
  baseUrl: string;
};

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function envBaseUrl(id: string, fallback: string) {
  const override = process.env[`${id.toUpperCase()}_BASE_URL`]?.trim();
  return trimSlash(override || fallback);
}

function envModel(id: string, fallback: string) {
  const names =
    id === "google"
      ? ["GEMINI_MODEL", "GOOGLE_MODEL"]
      : id === "custom"
        ? ["AI_MODEL"]
        : [`${id.toUpperCase()}_MODEL`];
  return firstEnv(names) ?? fallback;
}

function envRuntime(metaId: string): ProviderRuntime | null {
  const meta = providerMeta(metaId);
  if (!meta) return null;

  if (meta.id === "ollama") {
    const base = process.env.OLLAMA_BASE_URL?.trim();
    if (!base) return null;
    return {
      id: meta.id,
      label: meta.label,
      kind: meta.kind,
      baseUrl: trimSlash(base),
      model: envModel(meta.id, meta.defaultModel),
      apiKey: null,
      source: "ENV",
    };
  }

  if (meta.id === "custom") {
    const base = process.env.AI_BASE_URL?.trim();
    const model = process.env.AI_MODEL?.trim();
    if (!base || !model) return null;
    return {
      id: meta.id,
      label: meta.label,
      kind: meta.kind,
      baseUrl: trimSlash(base),
      model,
      apiKey: firstEnv(["AI_API_KEY"]),
      source: "ENV",
    };
  }

  const key = firstEnv(meta.keyEnv);
  if (!key) return null;
  return {
    id: meta.id,
    label: meta.label,
    kind: meta.kind,
    baseUrl: envBaseUrl(meta.id, meta.baseUrl),
    model: envModel(meta.id, meta.defaultModel),
    apiKey: key,
    source: "ENV",
  };
}

export function listEnvProviders(): EnvProviderStatus[] {
  return AI_PROVIDERS.map((meta) => {
    const runtime = envRuntime(meta.id);
    return {
      id: meta.id,
      label: meta.label,
      model: runtime?.model ?? envModel(meta.id, meta.defaultModel),
      configured: Boolean(runtime),
      keyEnv: meta.keyEnv,
      keyOptional: Boolean(meta.keyOptional),
      baseUrl: runtime?.baseUrl ?? meta.baseUrl,
    };
  });
}

export function envRuntimeFor(providerId: string): ProviderRuntime | null {
  return envRuntime(providerId);
}

export function runtimeFromConfig(config: AiProviderConfig): ProviderRuntime {
  const meta = providerMeta(config.provider);
  if (!meta) throw new Error(`Unknown provider "${config.provider}".`);
  const apiKey = decryptSecret(config.apiKeyEnc);
  return {
    id: config.provider,
    label: config.label?.trim() || meta.label,
    kind: meta.kind,
    baseUrl: trimSlash(config.baseUrl?.trim() || meta.baseUrl),
    model: config.model,
    apiKey,
    source: "SAVED",
    configId: config.id,
  };
}

export type ChatRequest = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
};

export type ChatResult = {
  text: string;
  tokensIn: number;
  tokensOut: number;
};

export async function callProvider(
  runtime: ProviderRuntime,
  request: ChatRequest
): Promise<ChatResult> {
  const maxTokens = request.maxTokens ?? 2400;
  const temperature = request.temperature ?? 0.2;
  const baseUrl = trimSlash(runtime.baseUrl);
  if (!baseUrl) throw new Error("This provider has no base URL configured.");

  if (runtime.kind === "anthropic") {
    const json = await postJson(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": runtime.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: runtime.model,
        max_tokens: maxTokens,
        temperature,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      }),
    });
    const text = Array.isArray(json?.content)
      ? json.content
          .map((part: { type?: string; text?: string }) =>
            part?.type === "text" ? (part.text ?? "") : ""
          )
          .join("")
      : "";
    return {
      text,
      tokensIn: Number(json?.usage?.input_tokens ?? 0),
      tokensOut: Number(json?.usage?.output_tokens ?? 0),
    };
  }

  if (runtime.kind === "google") {
    const url = `${baseUrl}/models/${encodeURIComponent(
      runtime.model
    )}:generateContent?key=${encodeURIComponent(runtime.apiKey ?? "")}`;
    const json = await postJson(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
        },
      }),
    });
    const text = Array.isArray(json?.candidates?.[0]?.content?.parts)
      ? json.candidates[0].content.parts
          .map((part: { text?: string }) => part?.text ?? "")
          .join("")
      : "";
    return {
      text,
      tokensIn: Number(json?.usageMetadata?.promptTokenCount ?? 0),
      tokensOut: Number(json?.usageMetadata?.candidatesTokenCount ?? 0),
    };
  }

  const payload: Record<string, unknown> = {
    model: runtime.model,
    temperature,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (runtime.apiKey) headers.authorization = `Bearer ${runtime.apiKey}`;

  if (runtime.id === "openai") payload.max_completion_tokens = maxTokens;
  else payload.max_tokens = maxTokens;

  const json = await postJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const content = json?.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part: { text?: string }) => part?.text ?? "")
            .join("")
        : "";

  return {
    text,
    tokensIn: Number(json?.usage?.prompt_tokens ?? 0),
    tokensOut: Number(json?.usage?.completion_tokens ?? 0),
  };
}

export async function testProvider(runtime: ProviderRuntime) {
  const result = await callProvider(runtime, {
    system: "You are a connectivity probe. Reply only with JSON.",
    user: 'Reply with exactly {"ok":true}.',
    maxTokens: 24,
    temperature: 0,
  });
  return result;
}

/** Pull a JSON object out of a model response, tolerating code fences. */
export function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw new Error("The model did not return valid JSON. Try a different model.");
}

type ProviderResponse = {
  content?: string | Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
};

async function postJson(url: string, init: RequestInit): Promise<ProviderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      const detail = body.replace(/\s+/g, " ").slice(0, 320);
      throw new Error(`Provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    try {
      return JSON.parse(body) as ProviderResponse;
    } catch {
      throw new Error("Provider returned a non-JSON response.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The model provider timed out after 45 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
