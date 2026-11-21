"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Lock,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  loginAction,
  requestResetAction,
  resetPasswordAction,
  signupAction,
  verifyLoginOtpAction,
  type AuthState,
} from "@/lib/actions/auth";
import { acceptInviteAction, type JoinState } from "@/lib/actions/tenant";
import { SubmitButton } from "@/components/SubmitButton";

function Alert({ state }: { state: AuthState }) {
  if (!state?.error && !state?.success) return null;
  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm ${
        state.error
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {state.error ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      )}
      <div>
        <p>{state.error ?? state.success}</p>
        {state.devLink && (
          state.devLink.startsWith("/") ? (
            <Link href={state.devLink} className="mt-1 inline-block font-semibold underline">
              Open reset link (dev)
            </Link>
          ) : (
            <p className="mt-1 font-mono text-xs font-semibold">{state.devLink}</p>
          )
        )}
      </div>
    </div>
  );
}

export function LoginForm({
  next,
  notice,
  textChallenge,
}: {
  next?: string;
  notice?: string;
  textChallenge?: { prompt: string; sig: string } | null;
}) {
  const [loginState, loginFormAction] = useActionState(loginAction, null);
  const [otpState, otpFormAction] = useActionState(verifyLoginOtpAction, null);
  const otpFatal = Boolean(otpState?.error && !otpState.step && !otpState.challenge);
  const state = otpState ?? loginState;
  const otpStep = !otpFatal && (loginState?.step === "otp" || otpState?.step === "otp");
  const challenge = otpState?.challenge ?? loginState?.challenge;
  const email = otpState?.email ?? loginState?.email;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {otpStep ? "Check your email" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {otpStep
            ? `Enter the one-time code sent to ${email ?? "your email"}.`
            : "Sign in to your workspace."}
        </p>
      </div>
      {notice && !otpStep && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}
      <Alert state={state} />

      {otpStep ? (
        <form action={otpFormAction} className="space-y-4">
          <input type="hidden" name="challenge" value={challenge ?? ""} />
          <div>
            <label className="label" htmlFor="otp">
              One-time code
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
              <input
                id="otp"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                className="input pl-9 tracking-[0.2em]"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Code expires in 10 minutes. Check spam if you don&apos;t see it.
            </p>
          </div>
          <SubmitButton className="w-full" pendingText="Verifying…">
            Verify and sign in <ArrowRight className="size-4" />
          </SubmitButton>
        </form>
      ) : (
        <form action={loginFormAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@school.edu"
                className="input pl-9"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="password">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="input pl-9"
              />
            </div>
          </div>
          {textChallenge ? (
            <div>
              <label className="label" htmlFor="textChallengeAnswer">
                Anti-bot check
              </label>
              <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold tracking-[0.25em] text-slate-700 select-none">
                {textChallenge.prompt}
              </div>
              <input type="hidden" name="textChallengePrompt" value={textChallenge.prompt} />
              <input type="hidden" name="textChallengeSig" value={textChallenge.sig} />
              <input
                id="textChallengeAnswer"
                name="textChallengeAnswer"
                required
                autoComplete="off"
                placeholder="Type the characters above"
                className="input"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                Type the characters exactly as shown.
              </p>
            </div>
          ) : null}
          <SubmitButton className="w-full" pendingText="Checking credentials…">
            Sign in <ArrowRight className="size-4" />
          </SubmitButton>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-slate-500">
        New to Nkanyezi?{" "}
        <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}

export function DemoLogins({ demoAction }: { demoAction: (formData: FormData) => Promise<void> }) {
  const accounts = [
    { role: "admin", label: "Platform admin", email: "admin@nkanyezi.dev" },
    { role: "owner", label: "School owner", email: "owner@northfield.edu" },
    { role: "teacher", label: "Math teacher", email: "teacher@northfield.edu" },
    { role: "student", label: "Student", email: "student@northfield.edu" },
    { role: "solo", label: "Solo teacher", email: "maya@studiomath.io" },
  ];
  return (
    <div className="mt-8 border-t border-slate-100 pt-5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Sparkles className="size-3.5" /> One-click demo
      </p>
      <div className="grid grid-cols-2 gap-2">
        {accounts.map((a) => (
          <form action={demoAction} key={a.role} className={a.role === "admin" ? "col-span-2" : undefined}>
            <input type="hidden" name="role" value={a.role} />
            <button
              type="submit"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <span className="block text-xs font-semibold text-slate-800">{a.label}</span>
              <span className="block truncate text-[10px] text-slate-400">{a.email}</span>
            </button>
          </form>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400">
        Demo password for all accounts: <span className="font-mono">Password123!</span>
      </p>
    </div>
  );
}

export function SignupForm({
  plan,
  promoCode,
}: {
  plan?: string;
  promoCode?: string;
} = {}) {
  const [state, action] = useActionState(signupAction, null);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Start your workspace</h1>
        <p className="mt-1 text-sm text-slate-500">
          Free for 14 days. No card required. Cancel anytime.
        </p>
      </div>
      <Alert state={state} />
      <form action={action} className="space-y-4">
        {plan && <input type="hidden" name="plan" value={plan} />}
        {promoCode && <input type="hidden" name="promoCode" value={promoCode} />}
        {(plan || promoCode) && (
          <p className="rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2 text-[11px] text-brand-800">
            {plan ? `${plan.toLowerCase()} plan selected` : "Promo applied"}
            {promoCode ? ` · code ${promoCode}` : ""} — your 14-day trial starts today.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                placeholder="Ada Lovelace"
                className="input pl-9"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="workspace">
              Workspace name
            </label>
            <div className="relative">
              <GraduationCap className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
              <input
                id="workspace"
                name="workspace"
                required
                placeholder="Northfield Academy"
                className="input pl-9"
              />
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="label">I am setting this up for</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 transition has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-2 has-[:checked]:ring-brand-500/20">
              <input type="radio" name="kind" value="SCHOOL" defaultChecked className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">A school</span>
                <span className="block text-[11px] text-slate-500">Multiple teachers & classes</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 transition has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-2 has-[:checked]:ring-brand-500/20">
              <input type="radio" name="kind" value="TEACHER" className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Just me</span>
                <span className="block text-[11px] text-slate-500">Solo teacher / tutor</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="email">
            Work email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@school.edu"
              className="input pl-9"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-3 left-3 size-4 text-slate-400" />
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="input pl-9"
            />
          </div>
        </div>
        <SubmitButton className="w-full" pendingText="Creating workspace…">
          Create my workspace <ArrowRight className="size-4" />
        </SubmitButton>
        <p className="text-center text-[11px] leading-5 text-slate-400">
          By continuing you agree to the Nkanyezi terms of service and privacy policy.
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(requestResetAction, null);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          We&apos;ll email you a secure link that expires in one hour.
        </p>
      </div>
      <Alert state={state} />
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@school.edu"
            className="input"
          />
        </div>
        <SubmitButton className="w-full" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetForm({ token, valid }: { token: string; valid: boolean }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  if (!valid) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Link expired</h1>
        <p className="mt-2 text-sm text-slate-500">
          This password reset link is invalid or has already been used.
        </p>
        <Link href="/forgot-password" className="btn-primary mt-5 w-full">
          Request a new link
        </Link>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">All active sessions will be signed out.</p>
      </div>
      <Alert state={state} />
      {state?.success ? (
        <Link href="/login" className="btn-primary w-full">
          Continue to sign in
        </Link>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>
          <SubmitButton className="w-full" pendingText="Updating…">
            Update password
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function AcceptInviteForm({
  token,
  needsAccount,
  signedInAs,
}: {
  token: string;
  needsAccount: boolean;
  signedInAs?: string;
}) {
  const [state, action] = useActionState<JoinState, FormData>(acceptInviteAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {needsAccount ? (
        <>
          <div>
            <label className="label" htmlFor="name">
              Your full name
            </label>
            <input id="name" name="name" required placeholder="Ada Lovelace" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Create a password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="input"
            />
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
          Signed in as <span className="font-semibold">{signedInAs}</span>. This invitation will be
          added to your account.
        </p>
      )}
      <SubmitButton className="w-full" pendingText="Joining…">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
