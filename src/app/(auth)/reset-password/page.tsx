import { db } from "@/lib/db";
import { tokenHash } from "@/lib/password";
import { ResetForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const record = token
    ? await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(token) } })
    : null;
  const valid = Boolean(record && !record.usedAt && record.expiresAt > new Date());

  return <ResetForm token={token} valid={valid} />;
}
