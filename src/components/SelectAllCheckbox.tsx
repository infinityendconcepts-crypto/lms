"use client";

/** Toggles every person checkbox inside the given container. */
export function SelectAllCheckbox({
  scopeId,
  label = "Select all",
}: {
  scopeId: string;
  label?: string;
}) {
  function toggle(checked: boolean) {
    const root = document.getElementById(scopeId);
    if (!root) return;
    root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-person-id]').forEach(
      (box) => {
        box.checked = checked;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    );
  }

  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
      <input
        type="checkbox"
        onChange={(event) => toggle(event.target.checked)}
        className="size-3.5 rounded border-slate-300"
      />
      {label}
    </label>
  );
}
