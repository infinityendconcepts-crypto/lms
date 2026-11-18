"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  className,
  pendingText,
  variant = "primary",
  confirm,
  name,
  value,
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  confirm?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      onClick={
        confirm
          ? (e) => {
              if (!window.confirm(confirm)) e.preventDefault();
            }
          : undefined
      }
      className={cn(
        variant === "primary" && "btn-primary",
        variant === "secondary" && "btn-secondary",
        variant === "danger" && "btn-danger",
        variant === "ghost" && "btn-ghost",
        className
      )}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
