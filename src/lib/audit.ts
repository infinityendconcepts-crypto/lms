import "server-only";
import { db } from "@/lib/db";

export async function audit(input: {
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
}) {
  await db.auditLog
    .create({
      data: {
        tenantId: input.tenantId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        target: input.target ?? null,
        meta: JSON.stringify(input.meta ?? {}),
      },
    })
    .catch((err) => console.error("audit failed", err));
}
