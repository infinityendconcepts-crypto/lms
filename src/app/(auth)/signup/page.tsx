import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Create a workspace" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; promo?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  if (session) {
    const params = new URLSearchParams();
    if (sp.plan) params.set("plan", sp.plan);
    if (sp.promo) params.set("promo", sp.promo);
    redirect(`/onboarding${params.size ? `?${params}` : ""}`);
  }
  return <SignupForm plan={sp.plan} promoCode={sp.promo} />;
}
