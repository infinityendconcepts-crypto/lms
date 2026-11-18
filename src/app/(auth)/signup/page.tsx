import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Create a workspace" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return <SignupForm />;
}
