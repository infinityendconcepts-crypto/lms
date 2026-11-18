"use client";

import { useState } from "react";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { AI_PROVIDERS, providerMeta } from "@/lib/ai/catalog";
import { saveAiProviderAction } from "@/lib/actions/ai";
import { SubmitButton } from "@/components/SubmitButton";

export function AiProviderForm({ hasConfigs }: { hasConfigs: boolean }) {
  const [providerId, setProviderId] = useState(AI_PROVIDERS[0].id);
  const [model, setModel] = useState(AI_PROVIDERS[0].defaultModel);
  const [baseUrl, setBaseUrl] = useState(AI_PROVIDERS[0].baseUrl);
  const meta = providerMeta(providerId) ?? AI_PROVIDERS[0];

  function chooseProvider(nextId: string) {
    const next = providerMeta(nextId);
    if (!next) return;
    setProviderId(next.id);
    setModel(next.defaultModel);
    setBaseUrl(next.baseUrl);
  }

  return (
    <form action={saveAiProviderAction} className="card-pad">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Plus className="size-4 text-brand-600" /> Add a model
      </h2>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        Bring your own key. It is encrypted before storage and only sent to the provider you choose.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="ai-provider">
            Provider
          </label>
          <select
            id="ai-provider"
            name="provider"
            className="select"
            value={providerId}
            onChange={(event) => chooseProvider(event.target.value)}
          >
            {AI_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-slate-400">{meta.note}</p>
        </div>

        <div>
          <label className="label" htmlFor="ai-model">
            Model
          </label>
          <input
            id="ai-model"
            name="model"
            className="input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={meta.defaultModel || "model-name"}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="ai-label">
            Display name (optional)
          </label>
          <input
            id="ai-label"
            name="label"
            className="input"
            placeholder={`e.g. ${meta.label} — analysis`}
            maxLength={60}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="ai-base-url">
            API base URL
          </label>
          <input
            id="ai-base-url"
            name="baseUrl"
            className="input font-mono text-xs"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com/v1"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            Works with any OpenAI-compatible endpoint (vLLM, LM Studio, Azure proxy…).
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="ai-key">
            API key {meta.keyOptional ? "(optional)" : ""}
          </label>
          <div className="relative">
            <KeyRound className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="ai-key"
              name="apiKey"
              type="password"
              autoComplete="off"
              className="input pl-9 font-mono text-xs"
              placeholder={meta.keyOptional ? "Leave blank for local models" : "sk-…"}
            />
          </div>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            <ShieldCheck className="size-3" />
            Leave blank to keep an existing key. Environment keys also work without saving one.
          </p>
        </div>

        <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" name="isDefault" defaultChecked={!hasConfigs} className="size-4" />
          Use this model by default for benchmarks
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <a
          href={meta.docsUrl || "#"}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-semibold text-brand-600 hover:underline"
        >
          {meta.docsUrl ? `Get a ${meta.label} key →` : "Provider documentation"}
        </a>
        <SubmitButton pendingText="Saving model…">
          <Plus className="size-3.5" /> Save model
        </SubmitButton>
      </div>
    </form>
  );
}
