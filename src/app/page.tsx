import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Braces,
  Calculator,
  Check,
  ClipboardCheck,
  FileText,
  Files,
  Globe2,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  Link2,
  ListChecks,
  Lock,
  MessageSquare,
  Play,
  ShieldCheck,
  Sigma,
  Sparkles,
  ToggleLeft,
  Users,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { MathText } from "@/components/MathText";
import { demoLoginAction } from "@/lib/actions/auth";
import { DEFAULT_CURRENCY, priceFor } from "@/lib/plans";
import { getPlanList } from "@/lib/plan-catalog";
import { QUESTION_META, type QuestionType } from "@/lib/questions";
import { formatMoney } from "@/lib/utils";

const TYPE_ICONS: Record<QuestionType, typeof Sigma> = {
  MULTIPLE_CHOICE: ListChecks,
  IMAGE_BASED: ImageIcon,
  YES_NO: ToggleLeft,
  CASE_STUDY: BookOpen,
  OPEN_ENDED: MessageSquare,
  NUMERIC: Calculator,
  FORMULA: Braces,
  FILL_BLANK: FileText,
  MATCHING: Link2,
};

const DOCS = ["PDF", "DOCX", "PPTX", "XLSX", "CSV", "MD", "TXT", "PNG", "JPG", "SVG", "MP4", "MP3", "ZIP"];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ promo?: string }>;
}) {
  const sp = await searchParams;
  const plans = await getPlanList();
  const promo = String(sp.promo ?? "").trim().toUpperCase();
  return (
    <div className="bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] font-medium text-slate-600 md:flex">
            <a href="#features" className="transition hover:text-slate-900">
              Features
            </a>
            <a href="#questions" className="transition hover:text-slate-900">
              Question types
            </a>
            <a href="#authoring" className="transition hover:text-slate-900">
              Authoring & grading
            </a>
            <a href="#tenancy" className="transition hover:text-slate-900">
              For schools
            </a>
            <a href="#pricing" className="transition hover:text-slate-900">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost btn-sm hidden sm:inline-flex">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary btn-sm">
              Start free <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-background.jpg')" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-white/75 via-white/35 to-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-white/40 via-transparent to-white/20"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.03fr_0.97fr] lg:pt-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-wide text-brand-700 shadow-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              MULTI-TENANT LMS · FOR EVERY SUBJECT
            </p>
            <h1 className="mt-5 text-[42px] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[56px]">
              A <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">flexible LMS</span> for every subject you teach.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-slate-600">
              Launch your own branded academy in minutes. Schools, training teams and independent teachers get
              isolated workspaces, courses and lessons, nine modern question types, auto and manual grading,
              analytics, and secure learning materials — with rich content support including math and LaTeX.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="btn-primary btn-lg">
                Start 14-day trial <ArrowRight className="size-4" />
              </Link>
              <a href="#demo" className="btn-secondary btn-lg">
                <Play className="size-4" /> Try the live demo
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" /> No credit card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" /> Your logo & colours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" /> Cancel anytime
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[470px] lg:mx-0">
            <div className="absolute -top-5 -right-3 z-20 hidden rotate-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg sm:block">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                <Layers className="size-3 text-brand-600" /> 9 question types
              </p>
            </div>
            <div className="absolute -bottom-5 -left-4 z-20 hidden -rotate-2 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg sm:flex">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Zap className="size-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-slate-800">Instant grading</p>
                <p className="text-[9px] text-slate-400">Auto & manual workflows</p>
              </div>
            </div>

            <div className="card relative z-10 overflow-hidden shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-brand-600 text-[10px] font-bold text-white">
                    N
                  </span>
                  <span className="text-[11px] font-semibold text-slate-700">
                    Biology · Cell energy
                  </span>
                </div>
                <span className="badge bg-amber-50 text-amber-700">Quiz · 2 pts</span>
              </div>
              <div className="p-5">
                <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  Question 4 of 12 · 08:42 left
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Which process produces most of a cell&apos;s ATP during aerobic respiration?
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Choose the best answer based on what you learned in this lesson.
                </p>
                <div className="mt-3 space-y-1.5">
                  {[
                    "Glycolysis",
                    "Oxidative phosphorylation",
                    "Fermentation",
                    "The Calvin cycle",
                  ].map((opt, i) => (
                    <div
                      key={opt}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        i === 1
                          ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <span className="flex size-4 items-center justify-center rounded-full border border-current text-[9px]">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                      {i === 1 && <Check className="ml-auto size-3.5" />}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[10px] text-slate-400">Auto-saved · 3s ago</span>
                  <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-[10px] font-semibold text-white">
                    Next question
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-y border-white/40 bg-white/30 backdrop-blur-[2px]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-white/40 px-4 sm:px-6 md:grid-cols-4">
            {[
              ["9", "modern question types"],
              ["∞", "isolated workspaces"],
              ["25 MB", "files per upload"],
              ["100%", "your own branding"],
            ].map(([value, label]) => (
              <div key={label} className="px-4 py-6 text-center">
                <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
                <p className="mt-0.5 text-[11px] font-medium tracking-wide text-slate-600 uppercase">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-white to-brand-50/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">
            Our name, our purpose
          </p>
          <p className="mt-5 text-lg leading-8 text-slate-700 sm:text-xl sm:leading-9">
            <span className="font-semibold text-slate-900">Nkanyezi means &lsquo;Star&rsquo;</span> — a symbol of brilliance, hope, and limitless potential. We believe that every learner carries a unique light waiting to shine. Through education, innovation, and empowerment, we ignite curiosity, unlock potential, and unveil the star within every learner, inspiring them to shine brighter and reach beyond their dreams.
          </p>
          <p className="mt-6 text-sm font-bold tracking-wide text-brand-700 sm:text-base">
            NKANYEZI – Unveiling the Star in Every Learner.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">
            Everything included
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            A complete academy, not a quiz widget.
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-slate-600">
            Courses, lessons, assessments, grading, analytics and billing are already wired
            together — so you can focus on teaching.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: BookOpen,
              title: "Rich content authoring",
              body: "Build lessons and assessments with text, media, documents and structured content — including equations and LaTeX when you need them.",
            },
            {
              icon: Layers,
              title: "Nine question types",
              body: "Multiple choice, image-based, yes/no, case studies, open-ended with rubrics, numeric, formula, blanks and matching.",
            },
            {
              icon: Users,
              title: "Real multi-tenancy",
              body: "Every school, team and solo teacher gets an isolated workspace with its own members, roles, data and branding.",
            },
            {
              icon: ClipboardCheck,
              title: "Grading that keeps up",
              body: "Objective answers grade instantly. Case studies and long answers land in a focused manual grading queue with feedback.",
            },
            {
              icon: BarChart3,
              title: "Gradebook & analytics",
              body: "Per-student, per-assessment results, pass rates, insights and exports. See who needs help before it’s too late.",
            },
            {
              icon: Files,
              title: "Secure course materials",
              body: "Attach PDFs, slides, spreadsheets, images, audio and video to lessons. Private, access-controlled delivery for learners.",
            },
          ].map((f) => (
            <div key={f.title} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Questions */}
      <section id="questions" className="border-y border-slate-100 bg-slate-50/70 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">
                Assessment engine
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Ask better questions.
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-slate-600">
                Mix formats inside one assessment. Objective types grade themselves; rich types
                flow into a manual queue.
              </p>
            </div>
            <Link href="/signup" className="btn-secondary btn-sm w-fit">
              Build your first quiz <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(QUESTION_META).map(([type, meta]) => {
              const Icon = TYPE_ICONS[type as QuestionType];
              return (
                <div key={type} className="card flex items-start gap-3 p-4">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${meta.badge}`}>
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-bold text-slate-900">{meta.label}</h3>
                      <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                        {meta.auto ? "Auto" : "Manual"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-5 text-slate-500">{meta.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Authoring & grading */}
      <section id="authoring" className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">
            Authoring & grading
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Create rich learning experiences for any subject.
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-slate-600">
            Build lessons, quizzes and assessments with flexible content and question formats.
            Auto-grade objective work, review open responses with rubrics and feedback, and
            support STEM subjects with built-in math and LaTeX rendering when needed.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              ["Flexible content", "Combine text, images, files and structured lessons for any topic or discipline."],
              ["Math & LaTeX support", "Render equations in prompts and answers, with tools for numeric and formula questions."],
              ["Auto & manual grading", "Instant results for objective types, plus a focused queue for open-ended and case-study work."],
              ["Rubrics & feedback", "Score with criteria, leave per-question feedback, and return work for learner revision."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Check className="size-3" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="text-[13px] leading-5 text-slate-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-900 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-rose-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
            <span className="ml-2 font-mono text-[10px] text-slate-400">lesson-content.md</span>
          </div>
          <div className="bg-slate-950 p-5 font-mono text-[12px] leading-6 text-slate-300">
            <p className="text-slate-500">## Lesson: Energy and motion</p>
            <p className="mt-2">Explain key ideas with text, images, files and checks for understanding.</p>
            <p className="mt-3 text-slate-400">Need equations? LaTeX is supported too:</p>
            <p className="text-indigo-300">$E_k = \frac{"{1}{2}"}mv^2$</p>
            <p className="mt-2 text-emerald-400">✓ works for science, math, language, business and more</p>
          </div>
          <div className="border-t border-slate-100 p-5">
            <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Learners can see rendered math when included
            </p>
            <MathText
              content={"$$E_k = \\frac{1}{2}mv^2$$"}
              className="mt-2 text-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Tenancy */}
      <section id="tenancy" className="relative overflow-hidden bg-slate-950 py-20 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 20%, rgba(99,102,241,.7), transparent 40%), radial-gradient(circle at 10% 80%, rgba(139,92,246,.5), transparent 40%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-indigo-300 uppercase">
              Identity & tenancy
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Rent the platform. Keep your identity.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-slate-300">
              Nkanyezi is built to be white-labelled. Each tenant has its own slug, logo, brand colour,
              members and subscription. Roles and permissions are enforced on every query.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {[
                { icon: ShieldCheck, title: "Isolated by default", body: "Tenant-scoped queries on every course, question, attempt and file." },
                { icon: Users, title: "Owner → Admin → Teacher → Student", body: "Granular roles, invitations and seat limits per plan." },
                { icon: Lock, title: "Secure sessions", body: "Hashed session tokens, revocation, audit log and password reset." },
                { icon: Globe2, title: "School or solo", body: "One codebase serves districts, tutoring groups and individual tutors." },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <f.icon className="size-5 text-indigo-300" />
                  <p className="mt-2.5 text-[13px] font-semibold">{f.title}</p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-400">{f.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                    BP
                  </span>
                  <div>
                    <p className="text-xs font-bold">BrightPath Learning</p>
                    <p className="text-[10px] text-slate-400">brightpath.nkanyezi.app</p>
                  </div>
                </div>
                <span className="badge bg-emerald-50 text-emerald-700">Growth</span>
              </div>
              <p className="mt-4 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Switch workspace
              </p>
              <div className="mt-2 space-y-2">
                {[
                  ["Northfield Academy", "Owner · 412 learners", true],
                  ["BrightPath Learning", "Owner · 38 learners", false],
                  ["Riverside Tutoring", "Teacher · 12 learners", false],
                ].map(([name, meta, active]) => (
                  <div
                    key={name as string}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                      active ? "border-brand-300 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-md bg-slate-900 text-[9px] font-bold text-white">
                        {(name as string).slice(0, 1)}
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold">{name}</p>
                        <p className="text-[9px] text-slate-400">{meta}</p>
                      </div>
                    </div>
                    {active && <Check className="size-3.5 text-brand-600" />}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-semibold text-slate-500">Per-workspace branding</p>
                <div className="mt-2 flex gap-1.5">
                  {["#4f46e5", "#0ea5e9", "#059669", "#e11d48", "#f59e0b"].map((c) => (
                    <span key={c} className="size-5 rounded-full ring-2 ring-white" style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Documents */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">
              Course materials
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Your documents, safely inside your workspace.
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-slate-600">
              Upload worksheets, slide decks, past papers, recordings and datasets. Files are
              streamed through an authenticated route and scoped to enrolled learners.
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {DOCS.map((d) => (
                <span key={d} className="chip font-mono text-[10px]">
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Lock className="size-3.5" /> Private by default · 25 MB per file · previews for PDF,
              images, video and audio
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: FileText, title: "Lesson notes", meta: "PDF · 2.4 MB", tone: "bg-rose-50 text-rose-600" },
              { icon: ImageIcon, title: "Geometry diagram", meta: "PNG · 380 KB", tone: "bg-sky-50 text-sky-600" },
              { icon: BookOpen, title: "Past paper pack", meta: "ZIP · 18 MB", tone: "bg-amber-50 text-amber-600" },
              { icon: Play, title: "Worked solution", meta: "MP4 · 24 MB", tone: "bg-violet-50 text-violet-600" },
            ].map((f) => (
              <div key={f.title} className="card flex items-center gap-3 p-4">
                <span className={`flex size-10 items-center justify-center rounded-xl ${f.tone}`}>
                  <f.icon className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-900">{f.title}</p>
                  <p className="text-[10px] text-slate-400">{f.meta}</p>
                </div>
              </div>
            ))}
            <div className="card p-4 sm:col-span-2">
              <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                <span>Storage used</span>
                <span>4.2 / 10 GB</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[42%] rounded-full bg-gradient-to-r from-brand-500 to-violet-500" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-slate-100 bg-slate-50/70 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">
              Simple pricing
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Rent it monthly. Cancel anytime.
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-slate-600">
              Every plan includes courses, lessons, assessments, grading, analytics and secure learning materials.
              Start with a 14-day Growth trial.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const featured = plan.id === "GROWTH";
              return (
                <div
                  key={plan.id}
                  className={`card relative flex flex-col p-6 ${
                    featured ? "border-brand-300 ring-2 ring-brand-500/20" : ""
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold tracking-wide text-white uppercase">
                      Most popular
                    </span>
                  )}
                  <p className="text-sm font-bold text-slate-900">{plan.name}</p>
                  <p className="mt-1 text-[12px] text-slate-500">{plan.tagline}</p>
                  <p className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {formatMoney(priceFor(plan, DEFAULT_CURRENCY), DEFAULT_CURRENCY, { decimals: 0 })}
                    </span>
                    <span className="pb-1 text-xs text-slate-500">/ month</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[12px] text-slate-600">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/signup?plan=${plan.id}${promo ? `&promo=${encodeURIComponent(promo)}` : ""}`}
                    className={`mt-6 w-full ${featured ? "btn-primary" : "btn-secondary"}`}
                  >
                    Start with {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-center text-[11px] text-slate-500">
            Need district procurement, invoices or SSO?{" "}
            <span className="font-semibold text-slate-700">Talk to us about Scale.</span>
          </p>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="card overflow-hidden">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-7 sm:p-10">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700">
                <Sparkles className="size-3.5" /> Seeded demo workspace
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">
                Step inside Northfield Academy.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                A fully seeded workspace with published courses, all nine question types, real attempts,
                grading workflows and analytics. One click — no signup.
              </p>
              <div className="mt-5 rounded-xl bg-slate-50 p-4 font-mono text-[11px] leading-6 text-slate-600">
                <p>
                  admin@nkanyezi.dev <span className="text-slate-400">· platform admin</span>
                </p>
                <p>
                  owner@northfield.edu <span className="text-slate-400">· school owner</span>
                </p>
                <p>
                  teacher@northfield.edu <span className="text-slate-400">· teacher</span>
                </p>
                <p>
                  student@northfield.edu <span className="text-slate-400">· student</span>
                </p>
                <p className="mt-2 text-slate-400">password: Password123!</p>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-slate-50/60 p-7 sm:p-10 lg:border-t-0 lg:border-l">
              <p className="mb-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Choose a role
              </p>
              <div className="space-y-2">
                {[
                  { role: "admin", label: "Platform admin", desc: "All tenants, plans & audit", icon: Globe2 },
                  { role: "owner", label: "School owner", desc: "Full admin, billing & audit", icon: ShieldCheck },
                  { role: "teacher", label: "Teacher", desc: "Builder, gradebook & grading", icon: GraduationCap },
                  { role: "student", label: "Student", desc: "Courses, quizzes & results", icon: Users },
                  { role: "solo", label: "Solo teacher", desc: "Second tenant · own brand", icon: Sparkles },
                ].map((d) => (
                  <form action={demoLoginAction} key={d.role}>
                    <input type="hidden" name="role" value={d.role} />
                    <button className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-brand-100 group-hover:text-brand-700">
                        <d.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-slate-900">{d.label}</span>
                        <span className="block text-[10px] text-slate-400">{d.desc}</span>
                      </span>
                      <ArrowRight className="size-3.5 text-slate-300 group-hover:text-brand-600" />
                    </button>
                  </form>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 px-6 py-12 text-center text-white sm:px-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white, transparent 30%), radial-gradient(circle at 80% 80%, white, transparent 30%)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your academy. Your brand. Your way.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-indigo-100">
              Spin up a tenant in under a minute, invite your first class and publish your
              first course or assessment today.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="btn bg-white px-5 py-3 text-brand-700 hover:bg-indigo-50"
              >
                Create your workspace <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="btn border border-white/30 px-5 py-3 text-white hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-slate-50/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-xs text-[11px] leading-5 text-slate-500">
              A flexible, multi-tenant learning platform for schools, training teams, tutoring groups and
              independent teachers.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12px] text-slate-600">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#questions" className="hover:text-slate-900">Question types</a>
            <a href="#authoring" className="hover:text-slate-900">Authoring & grading</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
            <Link href="/login" className="hover:text-slate-900">Sign in</Link>
            <Link href="/signup" className="hover:text-slate-900">Start free</Link>
          </div>
        </div>
        <div className="border-t border-slate-100 py-4 text-center text-[10px] text-slate-400">
          © {new Date().getFullYear()} Nkanyezi LMS · Built with Next.js, Prisma and KaTeX
        </div>
      </footer>
    </div>
  );
}
