/**
 * Shared AI provider catalog. This module is safe to import from client
 * components: it contains no secrets and no server-only code.
 */

export type ProviderKind = "openai" | "anthropic" | "google";

export type ProviderMeta = {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Default API base. The adapter appends the endpoint path. */
  baseUrl: string;
  defaultModel: string;
  /** Environment variables checked (in order) for a key. */
  keyEnv: string[];
  /** True for local endpoints that do not require an API key. */
  keyOptional?: boolean;
  docsUrl: string;
  note: string;
};

export const AI_PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    keyEnv: ["OPENAI_API_KEY"],
    docsUrl: "https://platform.openai.com/api-keys",
    note: "GPT models via the Chat Completions API.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    keyEnv: ["ANTHROPIC_API_KEY"],
    docsUrl: "https://console.anthropic.com/settings/keys",
    note: "Claude models via the Messages API.",
  },
  {
    id: "google",
    label: "Google Gemini",
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    keyEnv: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    docsUrl: "https://aistudio.google.com/apikey",
    note: "Gemini models via the Generative Language API.",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyEnv: ["GROQ_API_KEY"],
    docsUrl: "https://console.groq.com/keys",
    note: "Fast open models on Groq hardware.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    keyEnv: ["OPENROUTER_API_KEY"],
    docsUrl: "https://openrouter.ai/keys",
    note: "One key for hundreds of hosted models.",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    keyEnv: ["MISTRAL_API_KEY"],
    docsUrl: "https://console.mistral.ai/api-keys",
    note: "Mistral's OpenAI-compatible API.",
  },
  {
    id: "together",
    label: "Together AI",
    kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    keyEnv: ["TOGETHER_API_KEY"],
    docsUrl: "https://api.together.ai/settings/api-keys",
    note: "Hosted open-weight models.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    keyEnv: ["DEEPSEEK_API_KEY"],
    docsUrl: "https://platform.deepseek.com/api_keys",
    note: "DeepSeek's OpenAI-compatible API.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    keyEnv: ["XAI_API_KEY"],
    docsUrl: "https://console.x.ai",
    note: "Grok models via an OpenAI-compatible API.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    keyEnv: ["OLLAMA_BASE_URL"],
    keyOptional: true,
    docsUrl: "https://ollama.com",
    note: "Runs on your own machine. No data leaves your network.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai",
    baseUrl: "",
    defaultModel: "",
    keyEnv: ["AI_API_KEY"],
    keyOptional: true,
    docsUrl: "",
    note: "Any server exposing /chat/completions (vLLM, LM Studio, Azure proxy…).",
  },
];

export function providerMeta(id: string): ProviderMeta | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export function providerLabel(id: string) {
  return providerMeta(id)?.label ?? id;
}

export function isKnownProvider(id: string) {
  return Boolean(providerMeta(id));
}
