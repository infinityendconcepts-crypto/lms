import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { tokenHash } from "@/lib/password";
import { logoutAction } from "@/lib/actions/auth";
import { AcceptInviteForm } from "@/components/auth/AuthForms";
import { Logo } from "@/components/Logo";
import { ROLE_LABELS, type Role } from "@/lib/tenant";

export const metadata = { title: "Join workspace" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { tenant: true, course: true },
  });

  if (!invitation || invitation.expiresAt < new Date()) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invitation expired</h1>
        <p className="mt-2 text-sm text-slate-500">
          Ask your workspace admin for a new invite link.
        </p>
        <Link href="/login" className="btn-primary mt-6">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (invitation.acceptedAt) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Already accepted</h1>
        <p className="mt-2 text-sm text-slate-500">
          This invitation has been used. Sign in to reach your workspace.
        </p>
        <Link href="/login" className="btn-primary mt-6">
          Sign in
        </Link>
      </div>
    );
  }

  const session = await getSession();
  const account = await db.user.findUnique({ where: { email: invitation.email } });
  const needsAccount = !account;
  const wrongAccount = session && session.user.email !== invitation.email;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span
          className="flex size-11 items-center justify-center rounded-2xl text-base font-bold text-white"
          style={{ background: invitation.tenant.brandColor }}
        >
          {invitation.tenant.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Invitation to
          </p>
          <p className="font-bold text-slate-900">{invitation.tenant.name}</p>
        </div>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Join as {ROLE_LABELS[invitation.role as Role] ?? "member"}
      </h1>
      <p className="mt-1 mb-5 text-sm text-slate-500">
        You were invited as <span className="font-medium">{invitation.email}</span>
        {invitation.course ? (
          <>
            {" "}
            and will be enrolled in{" "}
            <span className="font-medium text-slate-700">{invitation.course.title}</span>.
          </>
        ) : (
          "."
        )}
      </p>

      {wrongAccount ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            You are signed in as <strong>{session.user.email}</strong>, but this invitation belongs
            to <strong>{invitation.email}</strong>.
          </div>
          <form action={logoutAction}>
            <button className="btn-secondary w-full">Sign out and switch account</button>
          </form>
        </div>
      ) : (
        <AcceptInviteForm
          token={token}
          needsAccount={needsAccount}
          signedInAs={session?.user.email}
        />
      )}

      <p className="mt-6 text-center text-[11px] text-slate-400">
        Secured by <span className="font-semibold text-slate-600">Axiom</span> · one workspace, one
        identity
      </p>
      <div className="mt-4 flex justify-center opacity-60">
        <Logo size="sm" />
      </div>
    </div>
  );
}
