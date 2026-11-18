import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { demoLoginAction } from "@/lib/actions/auth";
import { LoginForm, DemoLogins } from "@/components/auth/AuthForms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (session) redirect("/dashboard");

  const notice =
    sp.reset === "1"
      ? "Password updated. Sign in with your new password."
      : sp.error === "demo"
        ? "Demo data is not seeded yet. Run npm run db:seed."
        : undefined;

  return (
    <>
      <LoginForm next={sp.next} notice={notice} />
      <DemoLogins demoAction={demoLoginAction} />
      <p className="mt-6 text-center text-[11px] text-slate-400">
        Trouble signing in?{" "}
        <a href="/forgot-password" className="underline hover:text-slate-600">
          Reset your password
        </a>
        . Use a demo account above, or{" "}
        <a href="/signup" className="underline hover:text-slate-600">
          create your own workspace
        </a>
        .
      </p>
    </>
  );
}
