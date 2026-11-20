"use client";

import { Download } from "lucide-react";

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsv(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadCsv(filename: string, rows: ExportRow[]) {
  if (!rows.length) return;
  const headers = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key);
      return set;
    }, new Set<string>())
  );
  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ChartExportButton({
  filename,
  rows,
  label = "Export CSV",
}: {
  filename: string;
  rows: ExportRow[];
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, rows)}
      disabled={!rows.length}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      title={rows.length ? `Download ${filename}` : "No data to export"}
    >
      <Download className="size-3.5" />
      {label}
    </button>
  );
}
