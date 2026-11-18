import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MathText } from "@/components/MathText";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(99,102,241,.55), transparent 45%), radial-gradient(circle at 80% 75%, rgba(139,92,246,.45), transparent 45%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo inverted />
          </Link>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-indigo-200">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            MULTI-TENANT · MATH-NATIVE · RENTABLE
          </p>
          <h2 className="text-[34px] leading-[1.15] font-bold tracking-tight">
            One platform. Every school, teacher and learner its own universe.
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Nkanyezi gives each workspace isolated data, its own branding, roles and billing — while
            learners get LaTeX math, rich case studies and instant feedback.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Rendered live with KaTeX
            </p>
            <MathText
              content={
                "The roots of $ax^2+bx+c=0$ are\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nAsk it as multiple choice, numeric, formula — or a full case study."
              }
              className="text-slate-200 [&_p]:text-slate-200 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white"
            />
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-4 text-center">
          {[
            ["9", "question types"],
            ["∞", "workspaces"],
            ["100%", "your brand"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-[11px] tracking-wide text-slate-400 uppercase">{label}</p>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex flex-col items-center justify-center bg-white px-5 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <Logo size="lg" />
          </Link>
        </div>
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
