import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createWorkspaceAction } from "@/lib/actions/tenant";
import { logoutAction } from "@/lib/actions/auth";
import { Logo } from "@/components/Logo";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Choose a workspace" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; promo?: string }>;
}) {
  const session = await requireUser();
  const membership = await db.membership.findFirst({ where: { userId: session.user.id } });
  if (membership) redirect("/dashboard");
  const sp = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Logo size="lg" />
          <form action={logoutAction}>
            <button className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </form>
        </div>
        <div className="card-pad">
          <h1 className="text-xl font-bold text-slate-900">Create or join a workspace</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            Hi {session.user.name.split(" ")[0]} — you are not a member of any workspace yet.
          </p>
          <form action={createWorkspaceAction} className="space-y-4">
            {sp.plan && <input type="hidden" name="plan" value={sp.plan} />}
            {sp.promo && <input type="hidden" name="promoCode" value={sp.promo} />}
            {(sp.plan || sp.promo) && (
              <p className="rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2 text-[11px] text-brand-800">
                {sp.plan ? `${sp.plan.toLowerCase()} plan` : "Promo applied"}
                {sp.promo ? ` · code ${sp.promo}` : ""} will be activated with your trial.
              </p>
            )}
            <div>
              <label className="label" htmlFor="name">
                Workspace name
              </label>
              <input id="name" name="name" required className="input" placeholder="Northfield Academy" />
            </div>
            <div>
              <span className="label">Workspace type</span>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="cursor-pointer rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="kind" value="SCHOOL" defaultChecked className="mr-2" />
                  School
                </label>
                <label className="cursor-pointer rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="kind" value="TEACHER" className="mr-2" />
                  Solo teacher
                </label>
                <label className="cursor-pointer rounded-xl border border-orange-200 bg-orange-50/40 p-3 text-sm has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50">
                  <input type="radio" name="kind" value="CRECHE" className="mr-2" />
                  <span className="font-medium">Creche</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">Playful, child-friendly</span>
                </label>
              </div>
            </div>
            <SubmitButton className="w-full" pendingText="Creating…">
              Create workspace
            </SubmitButton>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            Have an invite link? Open it in the same browser to join an existing workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
