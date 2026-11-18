"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomField = { label: string; value: string };

export function CustomFieldsEditor({ initial }: { initial: CustomField[] }) {
  const [fields, setFields] = useState<CustomField[]>(
    initial.length ? initial : [{ label: "", value: "" }]
  );

  function update(index: number, patch: Partial<CustomField>) {
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function remove(index: number) {
    setFields((prev) => (prev.length === 1 ? [{ label: "", value: "" }] : prev.filter((_, i) => i !== index)));
  }

  return (
    <div>
      <input type="hidden" name="customFields" value={JSON.stringify(fields.filter((f) => f.label && f.value))} />
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label mb-0">Additional fields</span>
        <span className="text-[10px] text-slate-400">Anything else your school tracks</span>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={field.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="Field name (e.g. House)"
              className={cn("input w-40 shrink-0 text-xs")}
            />
            <input
              value={field.value}
              onChange={(e) => update(index, { value: e.target.value })}
              placeholder="Value"
              className="input flex-1 text-xs"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              className="rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
              title="Remove field"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setFields((prev) => [...prev, { label: "", value: "" }])}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
      >
        <Plus className="size-3" /> Add another field
      </button>
    </div>
  );
}
