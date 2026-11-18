# Nkanyezi LMS

A math-native, multi-tenant learning platform for schools and independent teachers. Nkanyezi
combines LaTeX lessons, math-aware assessment and grading, attendance, a gradebook, billing, and
an explainable AI success benchmark.

## Quick start

```bash
npm install
cp .env.example .env        # then edit AUTH_SECRET and AI_SECRET
npx prisma db push
npm run db:seed
npm run dev
```

Open <http://localhost:3000>.

### Demo accounts

All demo users share the password `Password123!`. The **one-click demo** buttons on the login
page and landing page sign in as the first four roles below; the platform admin button opens
`/admin` directly.

| Role | Email |
| --- | --- |
| Platform admin | `admin@nkanyezi.dev` |
| School owner | `owner@northfield.edu` |
| Teacher | `teacher@northfield.edu` |
| Student | `student@northfield.edu` |
| Prospective learner (no enrolment) | `ethan@northfield.edu` |
| Solo teacher | `maya@studiomath.io` |

Demo invite links: `/join/northfield-demo-invite` and `/join/studio-demo-invite`.

### Workspace logos

Workspace admins can upload a logo under **Settings → Workspace**, and platform admins can do the
same from each workspace's **Workspace & subscription details** panel. PNG, JPG, WEBP, GIF, AVIF
and SVG images up to 5 MB are supported. Logos appear in the dashboard, invitation pages and the
workspace switcher, and can be removed at any time.

## What is included

- **Multi-tenant workspaces** — schools and solo teachers, tenant switching, roles
  (owner / admin / teacher / student), invitations, seat limits and per-workspace logos.
- **Courses & lessons** — Markdown lessons with LaTeX, attachments, publishing, learner progress.
- **Assessments** — multiple choice, multi-select, numeric, true/false, short text, long answer,
  matching and multi-part case questions; auto-grading plus a manual grading queue. Quizzes are
  restricted to closed question types, including case-study subquestions.
- **Placement pre-assessments** — closed-question diagnostics that prospective learners can take
  before enrolling; results feed the qualification decision.
- **Course organogram** — ordered structure layers showing how a course moves from foundations to
  application, with lessons and assessments assigned to each stage.
- **Course plan** — Kanban board and Gantt timeline for delivery tasks, with met / in progress /
  not-yet-done states, owners, stages, priorities and dates.
- **Course budget & expenses** — per-course budget, category, vendor, date and notes with spend and
  remaining-balance reporting.
- **Coding pads** — browser labs for HTML/CSS/JS with sandboxed previews, drafts, submissions and
  teacher review. Other languages are saved for review.
- **Learner profiles** — identity, contact, next of kin, custom fields and prior qualifications.
- **AI qualification checks** — explainable readiness decisions using placement results, grades,
  attendance, qualifications and profile completeness, optionally refined by a hosted model.
- **Gradebook & results** — per-course and per-learner results, CSV exports, attempt history.
- **Workspace reporting** — enrollment, assessment, attendance, lesson-completion and success-outlook
  overviews with course, learner and attempt CSV exports.
- **Attendance register** — one register per course per day, present / late / absent / excused,
  notes, CSV export and term summaries.
- **Billing & plans** — Starter, Growth and School plans, trials, usage limits and a mock checkout.
- **Platform admin** — create workspaces, edit workspace details, manage plans/seats/trials/
  cancellation, suspend access and review platform activity.
- **AI success benchmark** — estimates how likely each learner is to stay on track from
  attendance, excuses, task grades, submission habits, lesson progress and engagement.

## AI success benchmark

Open **Success insights** in the sidebar.

1. Choose a cohort (all learners or one course).
2. Choose a model.
3. Run the benchmark.

Every run is stored with per-learner snapshots, so estimates are auditable and comparable over
time. Each estimate includes a 0–100 likelihood, a risk band, confidence, the signals that drove
it, and practical recommendations for the teacher.

### Local model (always available)

The built-in deterministic model needs **no API key and no network access**. It combines:

| Signal | Weight |
| --- | --- |
| Task grades | 34% |
| Attendance (present + late; excused handled separately) | 26% |
| Assessment completion | 14% |
| Lesson completion | 10% |
| Engagement recency | 9% |
| Grade trend | 5% |

Overdue assessments, late submissions, absence streaks and high excused-absence shares apply
modest behavioural penalties. The output is calibrated to risk bands:

- **On track** — 75 and above
- **Watch** — 60–74
- **At risk** — 40–59
- **Critical** — below 40

### Hosted models (optional)

Admins can add providers in **Settings → AI models**. Keys are encrypted with AES-256-GCM using
`AI_SECRET` (falling back to `AUTH_SECRET`) and masked in the UI. Supported providers:

- OpenAI
- Anthropic
- Google Gemini
- Groq
- OpenRouter
- Mistral
- Together AI
- DeepSeek
- xAI (Grok)
- Ollama (local, no key)
- Any OpenAI-compatible endpoint (`AI_BASE_URL` + `AI_MODEL`)

You can also configure providers entirely through environment variables; see `.env.example`.
Providers set in `.env` appear automatically in the benchmark model menu.

If a hosted model fails, Nkanyezi records the error and falls back to the local model, so a run
always completes. Health checks and last-error details are shown on the AI models tab.

### Privacy

Hosted models receive a learner ID, first name, course titles and numeric learning signals only.
Email addresses, free-text answers and teacher notes are never sent. The local model runs on your
server and shares nothing.

The benchmark is a decision-support tool. It is not a grade, a diagnosis or an automatic decision
about a learner.

## Course structure, budget and coding pads

Open a course from **Courses** and use the tabs:

- **Structure** is the organogram. Stages run top to bottom; use the arrows to reorder layers and
  the assignment controls to move lessons or assessments between them. Removing a stage leaves its
  content unassigned rather than deleting it.
- **Course plan** holds delivery tasks. The Kanban board has **Not yet done**, **In progress** and
  **Met** columns — drag a card or use its status control. The Gantt view places each task on a
  start-to-due timeline with a today marker. Tasks can link to a stage, an assignee, a priority and
  a description.
- **Budget** shows the course budget, spend, remaining balance and every expense. Add costs in the
  same tab; set or change the budget under **Settings**.
- **Coding pads** are course-scoped labs. HTML, CSS and JavaScript run in a sandboxed iframe;
  other languages are stored for teacher review. Learners save drafts or submit work, and teachers
  score and comment on submissions in the same tab.

Quizzes (`type = QUIZ`) cannot use open-ended questions. The **Open ended** type is hidden in the
question builder and rejected by the server for both top-level and nested case-study questions. Use
an **Exam** or **Assignment** when a written response is required.

## Workspace reporting

Open **Reporting** in the sidebar. It covers the whole workspace or a single course:

- Learner, assessment and attendance totals, average scores and lesson completion.
- Segmented charts for assessment outcomes, attendance mix and explainable success-outlook bands.
- Course performance and learner outcome tables, with links into course details, profiles and
  individual success insights.
- CSV exports for courses, learners and attempts. Each export uses the same course scope as the page.

The success-outlook chart reuses the local explainable benchmark, so it works with no API key.

## Platform admin workspaces

Sign in with the one-click **Platform admin** demo button and open `/admin`. The control plane can:

- Create a workspace with a name, optional slug, type, plan, status and optional existing owner.
- Edit a workspace's name, slug, type, brand color and headline.
- Manage subscription plan, status, seat override, renewal date and cancellation-at-period-end.
- Extend trials, suspend/restore workspaces, toggle super-admin access and review audit events.

All admin mutations are audited and require a super-admin session.

## Learner profiles and qualification checks

Open **Learners** and select a learner to see their profile. The page has four tabs:

1. **Profile** — learner ID, legal name, date of birth, contact details, address, next of kin,
   emergency notes, internal notes and an expandable list of custom fields.
2. **Qualifications** — certificates, transcripts and prior study.
3. **Qualification checks** — choose a course and model, then run a persisted readiness decision.
   The local result is always produced and includes an overall score, confidence and explainable
   reasons. A hosted provider can refine the narrative but stays close to the local score.
4. **Pre-assessments** — every published placement assessment for this workspace, with a copyable
   learner link. Placement attempts work without enrolment.

Course settings include **Entry requirements** and a **Minimum entry score (%)** used by the
qualification scorer. The seeded prospective learner `ethan@northfield.edu` has a placement attempt
but no course enrolment, so the whole pre-enrolment path can be inspected.

## Useful scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # production server
npm run lint       # ESLint
npm run db:push    # apply Prisma schema
npm run db:seed    # reset and seed demo data
npm run db:studio  # Prisma Studio
```

## Production notes

- Replace the SQLite datasource with PostgreSQL in `prisma/schema.prisma` for multi-instance
  deployments. All IDs and enums are string-based.
- Set strong `AUTH_SECRET` and `AI_SECRET` values.
- Configure a transactional email provider in `src/lib/email.ts`; development writes to the email
  outbox instead.
- Uploaded files live under `storage/uploads` by default. Use object storage and a CDN in
  production.
