/**
 * Nkanyezi LMS demo seed.
 *
 * Run with: npm run db:seed
 * Resets the local SQLite database and recreates two tenants, users,
 * courses, lessons, every question type, attempts and grading queues.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword, tokenHash } from "../src/lib/password";
import { buildStudentFeatures } from "../src/lib/ai/analytics";
import { riskBandFor } from "../src/lib/ai/format";

const db = new PrismaClient();
const PASSWORD = "Password123!";
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

const STORAGE_ROOT = process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage", "uploads");

const ids = {
  // question option ids stay readable so seeded attempts are easy to follow
  q1a: "opt-vertex-form",
  q1b: "opt-standard-form",
  q1c: "opt-factored-form",
  q1d: "opt-slope-form",
};

async function reset() {
  // Order matters for FK constraints on SQLite.
  await db.courseEligibility.deleteMany();
  await db.coursePlanTask.deleteMany();
  await db.codePadSubmission.deleteMany();
  await db.codePad.deleteMany();
  await db.learnerQualification.deleteMany();
  await db.studentProfile.deleteMany();
  await db.courseExpense.deleteMany();
  await db.courseStage.deleteMany();
  await db.successBenchmark.deleteMany();
  await db.aiBenchmarkRun.deleteMany();
  await db.aiProviderConfig.deleteMany();
  await db.attendanceRecord.deleteMany();
  await db.attendanceSession.deleteMany();
  await db.answer.deleteMany();
  await db.attempt.deleteMany();
  await db.question.deleteMany();
  await db.assessment.deleteMany();
  await db.lessonCompletion.deleteMany();
  await db.attachment.deleteMany();
  await db.enrollment.deleteMany();
  await db.invitation.deleteMany();
  await db.lesson.deleteMany();
  await db.course.deleteMany();
  await db.emailMessage.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.passwordReset.deleteMany();
  await db.membership.deleteMany();
  await db.subscription.deleteMany();
  await db.tenant.deleteMany();
  await db.user.deleteMany();
}

async function seedFile(name: string, contents: string, mimeType: string) {
  const key = `seed/${name}`;
  const target = path.join(STORAGE_ROOT, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
  return { storageKey: key, size: Buffer.byteLength(contents), mimeType };
}

const quadraticWorksheet = `# Quadratic Functions — Practice

1. Rewrite $y = x^2 - 6x + 5$ in vertex form.
2. Find the discriminant of $2x^2 - 4x + 1 = 0$.
3. Sketch $y = -(x+2)^2 + 4$ and label the vertex.

**Extension.** A ball is launched with height $h(t) = -16t^2 + 64t + 5$.
When does it reach its maximum height?
`;

const syllabus = `# Algebra II — Course Syllabus

## Units
1. Functions and transformations
2. Quadratic functions and complex numbers
3. Polynomials and factoring
4. Rational expressions
5. Exponential and logarithmic functions

## Grading
- Practice sets: 20%
- Quizzes: 30%
- Unit exams: 40%
- Final project: 10%

Office hours are Tuesdays and Thursdays after school in Room 214.
`;

// A simple SVG "graph" used by the image-based question.
const cubicGraph = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="320" viewBox="0 0 520 320">
  <rect width="520" height="320" fill="#ffffff"/>
  <g stroke="#e2e8f0" stroke-width="1">
    ${Array.from({ length: 11 }, (_, i) => `<line x1="${40 + i * 44}" y1="20" x2="${40 + i * 44}" y2="280"/>`).join("")}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="40" y1="${20 + i * 43.3}" x2="480" y2="${20 + i * 43.3}"/>`).join("")}
  </g>
  <line x1="40" y1="170" x2="480" y2="170" stroke="#64748b" stroke-width="2"/>
  <line x1="260" y1="20" x2="260" y2="290" stroke="#64748b" stroke-width="2"/>
  <path d="M90 255 C 160 255, 175 55, 260 170 S 380 285, 435 45" fill="none" stroke="#4f46e5" stroke-width="4" stroke-linecap="round"/>
  <circle cx="152" cy="170" r="6" fill="#f43f5e"/>
  <circle cx="260" cy="170" r="6" fill="#f43f5e"/>
  <circle cx="352" cy="170" r="6" fill="#f43f5e"/>
  <text x="440" y="165" font-family="system-ui" font-size="13" fill="#475569">x</text>
  <text x="268" y="35" font-family="system-ui" font-size="13" fill="#475569">y</text>
</svg>`;

async function main() {
  console.log("Resetting demo database…");
  await reset();

  const passwordHash = await hashPassword(PASSWORD);

  // ── users ────────────────────────────────────────────────────────────────
  console.log("Creating users and workspaces…");
  const admin = await db.user.create({
    data: {
      email: "admin@nkanyezi.dev",
      name: "Nkanyezi Admin",
      passwordHash,
      isSuperAdmin: true,
      timezone: "America/New_York",
    },
  });
  const elena = await db.user.create({
    data: {
      email: "owner@northfield.edu",
      name: "Dr. Elena Rivera",
      passwordHash,
      timezone: "America/New_York",
    },
  });
  const marcus = await db.user.create({
    data: {
      email: "teacher@northfield.edu",
      name: "Marcus Chen",
      passwordHash,
      timezone: "America/New_York",
    },
  });
  const priya = await db.user.create({
    data: {
      email: "student@northfield.edu",
      name: "Priya Patel",
      passwordHash,
      timezone: "America/New_York",
    },
  });
  const jordan = await db.user.create({
    data: { email: "jordan@northfield.edu", name: "Jordan Blake", passwordHash },
  });
  const sofia = await db.user.create({
    data: { email: "sofia@northfield.edu", name: "Sofia Martinez", passwordHash },
  });
  const liam = await db.user.create({
    data: { email: "liam@northfield.edu", name: "Liam O'Connor", passwordHash },
  });
  const aisha = await db.user.create({
    data: { email: "aisha@northfield.edu", name: "Aisha Khan", passwordHash },
  });
  const ethan = await db.user.create({
    data: { email: "ethan@northfield.edu", name: "Ethan Cole", passwordHash },
  });
  const maya = await db.user.create({
    data: {
      email: "maya@studiomath.io",
      name: "Maya Okafor",
      passwordHash,
      timezone: "Europe/London",
    },
  });
  const noah = await db.user.create({
    data: { email: "noah@studiomath.io", name: "Noah Kim", passwordHash },
  });
  const ava = await db.user.create({
    data: { email: "ava@studiomath.io", name: "Ava Thompson", passwordHash },
  });

  // ── tenants ──────────────────────────────────────────────────────────────
  const northfield = await db.tenant.create({
    data: {
      slug: "northfield",
      name: "Northfield Academy",
      kind: "SCHOOL",
      brandColor: "#4f46e5",
      headline: "Mathematics that meets every learner where they are.",
      about:
        "Northfield Academy is a grades 6–12 school with a math department focused on conceptual understanding, worked examples and frequent low-stakes practice.",
      website: "https://northfield.edu",
      subscription: {
        create: {
          plan: "GROWTH",
          seats: 400,
          status: "ACTIVE",
          currentPeriodEnd: days(27),
        },
      },
      memberships: {
        create: [
          { userId: elena.id, role: "OWNER" },
          { userId: marcus.id, role: "TEACHER" },
          { userId: priya.id, role: "STUDENT" },
          { userId: jordan.id, role: "STUDENT" },
          { userId: sofia.id, role: "STUDENT" },
          { userId: liam.id, role: "STUDENT" },
          { userId: aisha.id, role: "STUDENT" },
          // Ethan is deliberately not enrolled so the placement pre-assessment
          // flow can be demonstrated for a prospective learner.
          { userId: ethan.id, role: "STUDENT" },
        ],
      },
    },
  });

  const studio = await db.tenant.create({
    data: {
      slug: "studio-math",
      name: "Studio Math",
      kind: "TEACHER",
      brandColor: "#0f766e",
      headline: "Small-group SAT and precalculus coaching.",
      about:
        "Studio Math is Maya Okafor's independent practice. She runs live small-group sessions and asynchronous problem sets for students preparing for the SAT and AP Calculus.",
      website: "https://studiomath.io",
      trialEndsAt: days(11),
      subscription: {
        create: {
          plan: "STARTER",
          seats: 100,
          status: "TRIALING",
          currentPeriodEnd: days(11),
        },
      },
      memberships: {
        create: [
          { userId: maya.id, role: "OWNER" },
          { userId: noah.id, role: "STUDENT" },
          { userId: ava.id, role: "STUDENT" },
        ],
      },
    },
  });

  // The super admin belongs to Northfield too, so they can inspect the tenant UI.
  await db.membership.create({ data: { tenantId: northfield.id, userId: admin.id, role: "ADMIN" } });

  // ── files ────────────────────────────────────────────────────────────────
  const worksheetFile = await seedFile("algebra2-quadratic-worksheet.md", quadraticWorksheet, "text/markdown");
  const syllabusFile = await seedFile("algebra2-syllabus.md", syllabus, "text/markdown");
  const graphFile = await seedFile("cubic-graph.svg", cubicGraph, "image/svg+xml");

  // ── Algebra II ───────────────────────────────────────────────────────────
  console.log("Building Algebra II course and assessments…");
  const algebra = await db.course.create({
    data: {
      tenantId: northfield.id,
      ownerId: marcus.id,
      title: "Algebra II: Functions & Quadratics",
      subtitle: "Vertex form, factoring, complex roots and modeling",
      description:
        "A full-year Algebra II course. Students build fluency with **functions**, transform quadratics, factor polynomials and model real situations. Every unit includes worked examples, LaTeX practice and auto-graded checkpoints.",
      subject: "Mathematics",
      level: "High School",
      status: "PUBLISHED",
      budget: 4800,
      entryRequirements:
        "Completed Algebra I with a grade of C or better. Comfort with linear equations, exponent rules and graphing on a coordinate plane.",
      minEntryScore: 65,
    },
  });

  // The organogram is an ordered set of stages. Lessons and assessments point
  // back to a stage, so the course page can render the structure top to bottom.
  const algebraStages = await Promise.all([
    db.courseStage.create({
      data: {
        courseId: algebra.id,
        title: "1 · Foundations",
        description: "Language, notation and the shape of a quadratic.",
        order: 0,
      },
    }),
    db.courseStage.create({
      data: {
        courseId: algebra.id,
        title: "2 · Build Fluency",
        description: "Factoring, completing the square and checkpoint practice.",
        order: 1,
      },
    }),
    db.courseStage.create({
      data: {
        courseId: algebra.id,
        title: "3 · Apply & Prove",
        description: "Modeling, mixed review and the unit exam.",
        order: 2,
      },
    }),
  ]);

  // Course-plan tasks power the Kanban board and Gantt timeline on the
  // Course plan tab. Dates are relative so the seed always looks current.
  await db.coursePlanTask.createMany({
    data: [
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[0].id,
        title: "Publish orientation lesson",
        description: "Welcome video, course toolkit and diagnostic link.",
        status: "MET",
        priority: "HIGH",
        startAt: days(-24),
        dueAt: days(-20),
        completedAt: days(-21),
        order: 0,
        assigneeId: marcus.id,
        createdById: elena.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[0].id,
        title: "Approve foundations checkpoint",
        description: "Review item analysis and adjust the reteach group.",
        status: "MET",
        priority: "MEDIUM",
        startAt: days(-18),
        dueAt: days(-14),
        completedAt: days(-15),
        order: 1,
        assigneeId: elena.id,
        createdById: elena.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[1].id,
        title: "Build factoring practice set",
        description: "Twelve scaffolded problems with worked solutions.",
        status: "IN_PROGRESS",
        priority: "HIGH",
        startAt: days(-6),
        dueAt: days(2),
        order: 2,
        assigneeId: marcus.id,
        createdById: elena.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[1].id,
        title: "Record completing-the-square walkthrough",
        description: "Short screencast for the flipped lesson.",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        startAt: days(-2),
        dueAt: days(6),
        order: 3,
        assigneeId: marcus.id,
        createdById: marcus.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[1].id,
        title: "Refresh coding pad starter files",
        description: "Align the quadratic visualiser prompt with week 4.",
        status: "NOT_STARTED",
        priority: "LOW",
        startAt: days(4),
        dueAt: days(10),
        order: 4,
        assigneeId: marcus.id,
        createdById: marcus.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[2].id,
        title: "Draft modeling project rubric",
        description: "Four criteria, including explanation and precision.",
        status: "NOT_STARTED",
        priority: "HIGH",
        startAt: days(8),
        dueAt: days(16),
        order: 5,
        assigneeId: elena.id,
        createdById: elena.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[2].id,
        title: "Schedule unit exam review session",
        description: "Book room 214 and publish the sign-up form.",
        status: "NOT_STARTED",
        priority: "MEDIUM",
        startAt: days(14),
        dueAt: days(21),
        order: 6,
        assigneeId: marcus.id,
        createdById: elena.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        stageId: algebraStages[2].id,
        title: "Run post-exam item analysis",
        description: "Export results and flag objectives below 70%.",
        status: "NOT_STARTED",
        priority: "LOW",
        startAt: days(24),
        dueAt: days(30),
        order: 7,
        assigneeId: elena.id,
        createdById: marcus.id,
      },
    ],
  });

  const algebraLessons = await Promise.all([
    db.lesson.create({
      data: {
        courseId: algebra.id,
        stageId: algebraStages[0].id,
        title: "Welcome to Algebra II",
        summary: "How the course works, the math toolkit and your first diagnostic.",
        order: 0,
        published: true,
        estimatedMinutes: 10,
        content: `# Welcome

Algebra II is about **seeing structure**. A quadratic can look different in standard, vertex and factored form — but it is the same curve.

$$f(x)=ax^2+bx+c$$

## How this course works

- Read the lesson and try the worked examples.
- Complete the checkpoint quiz.
- Use the question bank to revisit anything that felt shaky.

> Tip: You can type math anywhere with LaTeX. Inline math uses \`$x^2$\` and display math uses \`$$...$$\`.`,
      },
    }),
    db.lesson.create({
      data: {
        courseId: algebra.id,
        stageId: algebraStages[0].id,
        title: "Quadratic Functions",
        summary: "Standard, vertex and factored form — and what each one reveals.",
        order: 1,
        published: true,
        estimatedMinutes: 18,
        content: `# Quadratic functions

Every quadratic can be written as

$$f(x)=ax^2+bx+c, \\qquad a\\neq 0.$$

## Three useful forms

| Form | Equation | What it reveals |
| --- | --- | --- |
| Standard | $ax^2+bx+c$ | $y$-intercept is $c$ |
| Vertex | $a(x-h)^2+k$ | Vertex at $(h,k)$ |
| Factored | $a(x-r_1)(x-r_2)$ | Roots at $r_1$ and $r_2$ |

## Worked example

Rewrite $f(x)=x^2-6x+5$ in vertex form.

$$x^2-6x+5=(x^2-6x+9)-9+5=(x-3)^2-4$$

The vertex is $(3,-4)$ and the axis of symmetry is $x=3$.

## The discriminant

$$\\Delta=b^2-4ac$$

- $\\Delta>0$: two real roots
- $\\Delta=0$: one repeated real root
- $\\Delta<0$: two complex roots`,
      },
    }),
    db.lesson.create({
      data: {
        courseId: algebra.id,
        stageId: algebraStages[1].id,
        title: "Factoring & the Zero Product Property",
        summary: "Factor by grouping, difference of squares and trinomials.",
        order: 2,
        published: true,
        estimatedMinutes: 20,
        content: `# Factoring

If $ab=0$, then $a=0$ or $b=0$. That is the **zero product property**.

## Common patterns

$$x^2-a^2=(x-a)(x+a)$$

$$x^2+(p+q)x+pq=(x+p)(x+q)$$

## Example

Factor $x^2-7x+12$.

We need two numbers with product $12$ and sum $-7$: $-3$ and $-4$.

$$x^2-7x+12=(x-3)(x-4)$$

So the roots are $x=3$ and $x=4$.

## Your turn

Factor $2x^2+7x+3$. Start by finding two numbers whose product is $2\\cdot 3=6$ and whose sum is $7$.`,
      },
    }),
    db.lesson.create({
      data: {
        courseId: algebra.id,
        stageId: algebraStages[1].id,
        title: "Completing the Square",
        summary: "Turn any quadratic into vertex form without memorizing formulas.",
        order: 3,
        published: true,
        estimatedMinutes: 25,
        content: `# Completing the square

Start with $x^2+bx$. Add and subtract $\\left(\\frac{b}{2}\\right)^2$:

$$x^2+bx=\\left(x+\\frac{b}{2}\\right)^2-\\frac{b^2}{4}.$$

## Example

$$2x^2-8x+5=2(x^2-4x)+5=2\\left[(x-2)^2-4\\right]+5=2(x-2)^2-3$$

The vertex is $(2,-3)$.

## Why it matters

Completing the square derives the quadratic formula:

$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}.$$`,
      },
    }),
    db.lesson.create({
      data: {
        courseId: algebra.id,
        stageId: algebraStages[2].id,
        title: "Applications: Projectile Motion",
        summary: "Model height with quadratics and interpret the vertex.",
        order: 4,
        published: true,
        estimatedMinutes: 20,
        content: `# Projectile motion

A ball launched upward has height

$$h(t)=-16t^2+64t+5$$

where $h$ is in feet and $t$ is in seconds.

The vertex occurs at

$$t=\\frac{-b}{2a}=\\frac{-64}{2(-16)}=2.$$

At $t=2$, $h(2)=-64+128+5=69$ feet. That is the maximum height.

The ball hits the ground when $h(t)=0$ — solve with the quadratic formula and keep the positive root.`,
      },
    }),
  ]);

  await db.attachment.createMany({
    data: [
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        lessonId: algebraLessons[1].id,
        uploadedById: marcus.id,
        name: "quadratic-worksheet.md",
        mimeType: worksheetFile.mimeType,
        size: worksheetFile.size,
        storageKey: worksheetFile.storageKey,
        kind: "document",
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        uploadedById: marcus.id,
        name: "algebra2-syllabus.md",
        mimeType: syllabusFile.mimeType,
        size: syllabusFile.size,
        storageKey: syllabusFile.storageKey,
        kind: "document",
      },
    ],
  });

  // ── Course operating budget ──────────────────────────────────────────────
  await db.courseExpense.createMany({
    data: [
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        title: "Printed practice packs",
        category: "MATERIALS",
        amount: 420.5,
        vendor: "Northfield Copy Centre",
        incurredAt: days(-18),
        notes: "Six-week supply of guided notes and graph paper.",
        createdById: marcus.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        title: "After-school tutoring",
        category: "INSTRUCTOR",
        amount: 1250,
        vendor: "Math Skills Lab",
        incurredAt: days(-12),
        notes: "Tuesday intervention block for four learners.",
        createdById: marcus.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        title: "Interactive graphing licences",
        category: "TECHNOLOGY",
        amount: 310.75,
        vendor: "Graphly",
        incurredAt: days(-9),
        notes: "Annual classroom licence, 30 seats.",
        createdById: marcus.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        title: "Room 214 projector bulb",
        category: "VENUE",
        amount: 180,
        vendor: "Campus Facilities",
        incurredAt: days(-5),
        createdById: elena.id,
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        title: "Quiz reward stationery",
        category: "OTHER",
        amount: 245.25,
        vendor: "Campus Store",
        incurredAt: days(-2),
        notes: "Pencils, whiteboard markers and sticker charts.",
        createdById: marcus.id,
      },
    ],
  });

  // ── Coding pads ──────────────────────────────────────────────────────────
  const quadraticPad = await db.codePad.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      title: "Build a quadratic explorer",
      language: "html",
      prompt:
        "Use HTML, CSS and JavaScript to build a small explorer. Changing $a$, $h$ or $k$ should update the vertex and the equation shown on screen.",
      starterCode: `<!doctype html>
<html>
  <head>
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #0f172a; }
      label { display: inline-block; margin-right: 12px; font-size: 13px; }
      input { width: 60px; padding: 4px; }
      pre { background: #f1f5f9; padding: 12px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h2>Quadratic explorer</h2>
    <label>a <input id="a" type="number" value="1"></label>
    <label>h <input id="h" type="number" value="2"></label>
    <label>k <input id="k" type="number" value="3"></label>
    <pre id="output"></pre>
    <script>
      function update() {
        var a = Number(document.getElementById("a").value) || 1;
        var h = Number(document.getElementById("h").value) || 0;
        var k = Number(document.getElementById("k").value) || 0;
        document.getElementById("output").textContent =
          "y = " + a + "(x - " + h + ")^2 + " + k + "\\nvertex: (" + h + ", " + k + ")";
      }
      document.querySelectorAll("input").forEach(function (input) {
        input.addEventListener("input", update);
      });
      update();
    </script>
  </body>
</html>`,
      solution: `<!doctype html>
<html>
  <head>
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #0f172a; }
      label { display: inline-block; margin-right: 12px; font-size: 13px; }
      input { width: 60px; padding: 4px; }
      pre { background: #eef2ff; padding: 12px; border-radius: 8px; color: #3730a3; }
    </style>
  </head>
  <body>
    <h2>Quadratic explorer</h2>
    <label>a <input id="a" type="number" value="1"></label>
    <label>h <input id="h" type="number" value="2"></label>
    <label>k <input id="k" type="number" value="3"></label>
    <pre id="output"></pre>
    <script>
      function update() {
        var a = Number(document.getElementById("a").value) || 1;
        var h = Number(document.getElementById("h").value) || 0;
        var k = Number(document.getElementById("k").value) || 0;
        var sign = k < 0 ? " - " + Math.abs(k) : " + " + k;
        document.getElementById("output").textContent =
          "y = " + a + "(x - " + h + ")^2" + sign + "\\nvertex: (" + h + ", " + k + ")";
      }
      document.querySelectorAll("input").forEach(function (input) {
        input.addEventListener("input", update);
      });
      update();
    </script>
  </body>
</html>`,
      published: true,
      order: 0,
      createdById: marcus.id,
    },
  });

  const vertexPad = await db.codePad.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      title: "JavaScript: vertex calculator",
      language: "javascript",
      prompt:
        "Finish the `vertex` function. It receives $a$, $b$ and $c$ and returns an object with the coordinates of the vertex of $y=ax^2+bx+c$.",
      starterCode: `function vertex(a, b, c) {
  // Hint: the x-coordinate is -b / (2a).
  return { x: 0, y: 0 };
}

console.log(vertex(1, -6, 5)); // expected { x: 3, y: -4 }`,
      solution: `function vertex(a, b, c) {
  var x = -b / (2 * a);
  return { x: x, y: a * x * x + b * x + c };
}

console.log(vertex(1, -6, 5)); // { x: 3, y: -4 }`,
      published: true,
      order: 1,
      createdById: marcus.id,
    },
  });

  await db.codePadSubmission.createMany({
    data: [
      {
        padId: quadraticPad.id,
        userId: priya.id,
        code: `<!doctype html><html><body><h2>My explorer</h2><p>Still wiring up the inputs — the vertex updates when I change h and k.</p></body></html>`,
        status: "SUBMITTED",
        submittedAt: days(-1),
      },
      {
        padId: quadraticPad.id,
        userId: jordan.id,
        code: `<!doctype html><html><body><h1>Quadratic explorer</h1><p>I got the sliders working but not the output yet.</p></body></html>`,
        status: "DRAFT",
      },
      {
        padId: vertexPad.id,
        userId: aisha.id,
        code: `function vertex(a, b, c) {
  var x = -b / (2 * a);
  return { x: x, y: a * x * x + b * x + c };
}

console.log(vertex(2, -8, 5)); // { x: 2, y: -3 }`,
        status: "REVIEWED",
        score: 96,
        feedback: "Clean implementation. Nice job substituting x back into the original equation.",
        submittedAt: days(-3),
      },
    ],
  });

  // ── Quadratic Functions Quiz ─────────────────────────────────────────────
  const quadQuiz = await db.assessment.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      stageId: algebraStages[1].id,
      title: "Quadratic Functions Quiz",
      instructions:
        "Show your work on scratch paper. You may use a calculator. **Math is welcome** — use `$...$` for inline LaTeX.",
      type: "QUIZ",
      status: "PUBLISHED",
      timeLimitMin: 20,
      attemptsAllowed: 2,
      passScore: 70,
      showResults: "AFTER_SUBMIT",
      dueAt: days(10),
    },
  });

  const qVertex = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: quadQuiz.id,
      type: "MULTIPLE_CHOICE",
      prompt: "Which equation is written in **vertex form**?",
      points: 2,
      difficulty: "EASY",
      tags: "quadratics,forms",
      order: 0,
      data: JSON.stringify({
        multiple: false,
        options: [
          { id: ids.q1a, text: "$y = a(x-h)^2 + k$" },
          { id: ids.q1b, text: "$y = ax^2 + bx + c$" },
          { id: ids.q1c, text: "$y = a(x-r_1)(x-r_2)$" },
          { id: ids.q1d, text: "$y = mx + b$" },
        ],
        correct: [ids.q1a],
      }),
      explanation: "Vertex form makes the vertex $(h,k)$ visible immediately.",
    },
  });

  const qDiscriminant = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: quadQuiz.id,
      type: "NUMERIC",
      prompt: "What is the discriminant of $2x^2 - 4x + 1 = 0$?",
      points: 2,
      difficulty: "MEDIUM",
      tags: "discriminant",
      order: 1,
      data: JSON.stringify({ answer: 8, tolerance: 0.01 }),
      explanation: "$\\Delta = b^2-4ac = (-4)^2-4(2)(1)=16-8=8$.",
    },
  });

  const qRoot = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: quadQuiz.id,
      type: "FORMULA",
      prompt:
        "Use the quadratic formula to solve $x^2-5x+6=0$. Enter the **larger** root as an exact value (LaTeX accepted).",
      points: 3,
      difficulty: "MEDIUM",
      tags: "quadratic-formula",
      order: 2,
      data: JSON.stringify({ answer: "3", alternatives: ["x=3", "x = 3"] }),
      explanation: "The roots are $x=2$ and $x=3$, so the larger root is $3$.",
    },
  });

  const qVertexYesNo = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: quadQuiz.id,
      type: "YES_NO",
      prompt: "The graph of $y=x^2-4$ has its vertex at $(0,-4)$.",
      points: 1,
      difficulty: "EASY",
      tags: "vertex",
      order: 3,
      data: JSON.stringify({ correct: true }),
      explanation: "The vertex form is $y=(x-0)^2-4$, so the vertex is $(0,-4)$.",
    },
  });

  const qFactor = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: quadQuiz.id,
      type: "FILL_BLANK",
      prompt: "Complete the factorization: $x^2-7x+12=(x-\\_)(x-\\_)$",
      points: 3,
      difficulty: "MEDIUM",
      tags: "factoring",
      order: 4,
      data: JSON.stringify({
        blanks: [
          { id: "b1", accepted: ["3"] },
          { id: "b2", accepted: ["4"] },
        ],
        caseSensitive: false,
      }),
      explanation: "The factors are $(x-3)(x-4)$.",
    },
  });

  const qMatch = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: quadQuiz.id,
      type: "MATCHING",
      prompt: "Match each feature of $y=(x-2)^2+3$ with its value.",
      points: 3,
      difficulty: "MEDIUM",
      tags: "quadratics,features",
      order: 5,
      data: JSON.stringify({
        left: [
          { id: "l1", text: "Vertex" },
          { id: "l2", text: "Axis of symmetry" },
          { id: "l3", text: "$y$-intercept" },
        ],
        right: [
          { id: "r1", text: "$(2,3)$" },
          { id: "r2", text: "$x=2$" },
          { id: "r3", text: "$(0,7)$" },
          { id: "r4", text: "$(0,3)$" },
        ],
        pairs: { l1: "r1", l2: "r2", l3: "r3" },
      }),
      explanation: "Vertex $(2,3)$; axis $x=2$; $y$-intercept $f(0)=7$.",
    },
  });

  // ── Unit 3 Exam (case study, image, open response) ───────────────────────
  const unitExam = await db.assessment.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      stageId: algebraStages[2].id,
      title: "Unit 3 Exam: Polynomials & Functions",
      instructions:
        "This exam has objective, image-based and written questions. Read the case study carefully before answering its three parts.",
      type: "EXAM",
      status: "PUBLISHED",
      timeLimitMin: 45,
      attemptsAllowed: 1,
      passScore: 60,
      showResults: "MANUAL",
      openAt: days(-2),
      dueAt: days(3),
    },
  });

  const graphAttachment = await db.attachment.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      uploadedById: marcus.id,
      name: "cubic-graph.svg",
      mimeType: graphFile.mimeType,
      size: graphFile.size,
      storageKey: graphFile.storageKey,
      kind: "image",
    },
  });

  const qGraph = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: unitExam.id,
      type: "IMAGE_BASED",
      prompt: "The graph shows a cubic function. How many **real roots** does it have?",
      mediaUrl: `/api/files/${graphAttachment.id}?name=cubic-graph.svg`,
      points: 2,
      difficulty: "EASY",
      tags: "polynomials,graphs",
      order: 0,
      data: JSON.stringify({
        multiple: false,
        options: [
          { id: "g1", text: "0" },
          { id: "g2", text: "1" },
          { id: "g3", text: "3" },
          { id: "g4", text: "4" },
        ],
        correct: ["g3"],
      }),
      explanation: "The curve crosses the $x$-axis three times.",
    },
  });

  const qDegree = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: unitExam.id,
      type: "MULTIPLE_CHOICE",
      prompt: "Select **every** expression that is a degree-3 polynomial.",
      points: 2,
      difficulty: "MEDIUM",
      tags: "polynomials,degree",
      order: 1,
      data: JSON.stringify({
        multiple: true,
        partialCredit: true,
        options: [
          { id: "d1", text: "$x^3-1$" },
          { id: "d2", text: "$2x^2+x$" },
          { id: "d3", text: "$x^3+2x^2-x+7$" },
          { id: "d4", text: "$5x$" },
        ],
        correct: ["d1", "d3"],
      }),
      explanation: "Degree is the highest exponent: $x^3-1$ and $x^3+2x^2-x+7$.",
    },
  });

  const caseSubArea = "cs1";
  const caseSubWidth = "cs2";
  const caseSubQuadratic = "cs3";
  const qCase = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: unitExam.id,
      type: "CASE_STUDY",
      prompt: "A rectangular garden is 5 feet longer than it is wide, and its area is 24 square feet.",
      points: 6,
      difficulty: "HARD",
      tags: "polynomials,modeling",
      order: 2,
      data: JSON.stringify({
        passage:
          "Let $w$ be the width of the garden. The length is $w+5$. The area is $w(w+5)=24$. Work through the three parts below.",
        subQuestions: [
          {
            id: caseSubArea,
            type: "MULTIPLE_CHOICE",
            prompt: "Which equation models the situation?",
            points: 2,
            data: {
              multiple: false,
              options: [
                { id: "c1", text: "$w+(w+5)=24$" },
                { id: "c2", text: "$w(w+5)=24$" },
                { id: "c3", text: "$2w+2(w+5)=24$" },
              ],
              correct: ["c2"],
            },
          },
          {
            id: caseSubWidth,
            type: "SHORT_TEXT",
            prompt: "What is the positive width of the garden, in feet?",
            points: 2,
            data: { accepted: ["3", "3 ft", "3 feet"] },
          },
          {
            id: caseSubQuadratic,
            type: "YES_NO",
            prompt: "The area equation can be rewritten as $w^2+5w-24=0$.",
            points: 2,
            data: { correct: true },
          },
        ],
      }),
      explanation: "$w^2+5w-24=(w+8)(w-3)$, so $w=3$ feet and the length is 8 feet.",
    },
  });

  const qExplain = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: unitExam.id,
      type: "OPEN_ENDED",
      prompt:
        "Explain how the **degree** and **leading coefficient** of a polynomial determine its end behavior. Use an example in your answer.",
      points: 5,
      difficulty: "HARD",
      tags: "polynomials,end-behavior,writing",
      order: 3,
      data: JSON.stringify({
        rubric: [
          { id: "r1", criterion: "Connects even/odd degree to matching/opposite directions", points: 2 },
          { id: "r2", criterion: "Connects the sign of the leading coefficient to up/down behavior", points: 2 },
          { id: "r3", criterion: "Includes a correct worked example", points: 1 },
        ],
        minWords: 40,
        sampleAnswer:
          "For an even-degree polynomial both ends point the same direction; a positive leading coefficient sends both ends up. Odd degree sends the ends in opposite directions.",
      }),
      explanation: "Award marks for each rubric criterion the response satisfies.",
    },
  });

  const qEval = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: unitExam.id,
      type: "NUMERIC",
      prompt: "Evaluate $P(2)$ for $P(x)=x^3-2x+1$.",
      points: 2,
      difficulty: "EASY",
      tags: "polynomials,evaluation",
      order: 4,
      data: JSON.stringify({ answer: 5, tolerance: 0 }),
      explanation: "$P(2)=8-4+1=5$.",
    },
  });

  const qFactorTheorem = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: unitExam.id,
      type: "YES_NO",
      prompt: "By the Factor Theorem, $x-1$ is a factor of $x^3-1$.",
      points: 1,
      difficulty: "MEDIUM",
      tags: "factor-theorem",
      order: 5,
      data: JSON.stringify({ correct: true }),
      explanation: "$P(1)=1-1=0$, so $x-1$ is a factor.",
    },
  });

  // ── Draft warm-up ────────────────────────────────────────────────────────
  const warmup = await db.assessment.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      stageId: algebraStages[1].id,
      title: "Warm-up: Factoring Practice",
      instructions: "Five minutes of retrieval practice. Draft — not assigned yet.",
      type: "QUIZ",
      status: "DRAFT",
      attemptsAllowed: 3,
      passScore: 50,
      showResults: "AFTER_SUBMIT",
    },
  });
  await db.question.createMany({
    data: [
      {
        tenantId: northfield.id,
        assessmentId: warmup.id,
        type: "MULTIPLE_CHOICE",
        prompt: "Factor $x^2-9$.",
        points: 1,
        order: 0,
        data: JSON.stringify({
          multiple: false,
          options: [
            { id: "w1", text: "$(x-3)(x+3)$" },
            { id: "w2", text: "$(x-9)(x+1)$" },
            { id: "w3", text: "$(x-3)^2$" },
          ],
          correct: ["w1"],
        }),
      },
      {
        tenantId: northfield.id,
        assessmentId: warmup.id,
        type: "YES_NO",
        prompt: "$x^2+4$ factors over the real numbers.",
        points: 1,
        order: 1,
        data: JSON.stringify({ correct: false }),
      },
      {
        tenantId: northfield.id,
        assessmentId: warmup.id,
        type: "FILL_BLANK",
        prompt: "Factor $x^2+7x+10=(x+\\_)(x+\\_)$.",
        points: 2,
        order: 2,
        data: JSON.stringify({
          blanks: [
            { id: "wb1", accepted: ["2"] },
            { id: "wb2", accepted: ["5"] },
          ],
        }),
      },
    ],
  });

  // ── Placement pre-assessment ─────────────────────────────────────────────
  // Placement assessments are closed-question only and can be taken by
  // learners who are not enrolled yet. Their results feed qualification checks.
  const algebraPlacement = await db.assessment.create({
    data: {
      tenantId: northfield.id,
      courseId: algebra.id,
      stageId: algebraStages[0].id,
      title: "Algebra II Readiness Check",
      instructions:
        "A short, ungraded diagnostic used to check readiness for Algebra II. Only multiple choice, numeric and yes/no questions are used.",
      type: "PLACEMENT",
      status: "PUBLISHED",
      attemptsAllowed: 2,
      passScore: 60,
      showResults: "AFTER_SUBMIT",
      dueAt: days(30),
    },
  });

  const placementOptionA = "placement-vertex-form";
  const placementOptionB = "placement-standard-form";
  const placementOptionC = "placement-slope-form";

  const placementFormQuestion = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: algebraPlacement.id,
      type: "MULTIPLE_CHOICE",
      prompt: "Which form makes the vertex of a quadratic easiest to read?",
      points: 2,
      difficulty: "EASY",
      tags: "placement,forms",
      order: 0,
      data: JSON.stringify({
        multiple: false,
        options: [
          { id: placementOptionA, text: "$y=a(x-h)^2+k$" },
          { id: placementOptionB, text: "$y=ax^2+bx+c$" },
          { id: placementOptionC, text: "$y=mx+b$" },
        ],
        correct: [placementOptionA],
      }),
      explanation: "Vertex form shows the vertex at $(h,k)$.",
    },
  });

  const placementVertexQuestion = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: algebraPlacement.id,
      type: "NUMERIC",
      prompt: "What is the $x$-coordinate of the vertex of $y=x^2-6x+5$?",
      points: 2,
      difficulty: "MEDIUM",
      tags: "placement,vertex",
      order: 1,
      data: JSON.stringify({ answer: 3, tolerance: 0.01 }),
      explanation: "$x=-b/(2a)=6/2=3$.",
    },
  });

  const placementSignQuestion = await db.question.create({
    data: {
      tenantId: northfield.id,
      assessmentId: algebraPlacement.id,
      type: "YES_NO",
      prompt: "A quadratic with $a<0$ opens downward.",
      points: 1,
      difficulty: "EASY",
      tags: "placement,graphing",
      order: 2,
      data: JSON.stringify({ correct: true }),
      explanation: "The sign of $a$ determines whether the parabola opens up or down.",
    },
  });

  // ── Geometry course ──────────────────────────────────────────────────────
  const geometry = await db.course.create({
    data: {
      tenantId: northfield.id,
      ownerId: elena.id,
      title: "Geometry Foundations",
      subtitle: "Reasoning, congruence, similarity and circles",
      description:
        "A visual introduction to Euclidean geometry. Students justify claims with transformations, prove triangles congruent and work with arc length and sector area.",
      subject: "Mathematics",
      level: "High School",
      status: "PUBLISHED",
    },
  });

  await db.lesson.createMany({
    data: [
      {
        courseId: geometry.id,
        title: "Angles, Lines & Triangles",
        summary: "Angle relationships and the triangle angle sum.",
        order: 0,
        published: true,
        estimatedMinutes: 15,
        content: `# Angles and triangles

The angles in a triangle sum to $180^\\circ$.

If two parallel lines are cut by a transversal, corresponding angles are equal and alternate interior angles are equal.

## Example

In $\\triangle ABC$, $\\angle A=48^\\circ$ and $\\angle B=67^\\circ$. Then

$$\\angle C = 180^\\circ-48^\\circ-67^\\circ=65^\\circ.$$`,
      },
      {
        courseId: geometry.id,
        title: "Congruence & Similarity",
        summary: "SSS, SAS, ASA and scale factors.",
        order: 1,
        published: true,
        estimatedMinutes: 20,
        content: `# Congruence and similarity

Two triangles are congruent when a rigid motion maps one onto the other.

**Similar** triangles have equal angles and proportional sides. If the scale factor is $k$, then

$$\\frac{\\text{area}_2}{\\text{area}_1}=k^2.$$`,
      },
      {
        courseId: geometry.id,
        title: "Circles: Arcs & Sectors",
        summary: "Radians, arc length and sector area.",
        order: 2,
        published: true,
        estimatedMinutes: 18,
        content: `# Circles

For a central angle $\\theta$ measured in radians and radius $r$:

$$s=r\\theta \\qquad A=\\tfrac12 r^2\\theta.$$

## Example

A sector has radius $6$ and angle $\\frac{\\pi}{3}$. Then

$$s=6\\cdot\\frac{\\pi}{3}=2\\pi, \\qquad A=\\tfrac12(36)\\left(\\frac{\\pi}{3}\\right)=6\\pi.$$`,
      },
    ],
  });

  const geometryQuiz = await db.assessment.create({
    data: {
      tenantId: northfield.id,
      courseId: geometry.id,
      title: "Geometry Checkpoint",
      instructions: "One attempt. Diagrams are not to scale.",
      type: "QUIZ",
      status: "PUBLISHED",
      timeLimitMin: 25,
      attemptsAllowed: 1,
      passScore: 60,
      showResults: "AFTER_SUBMIT",
      dueAt: days(14),
    },
  });

  await db.question.createMany({
    data: [
      {
        tenantId: northfield.id,
        assessmentId: geometryQuiz.id,
        type: "MULTIPLE_CHOICE",
        prompt: "Two triangles are similar with scale factor $3$. The area of the larger triangle is how many times the smaller area?",
        points: 2,
        order: 0,
        data: JSON.stringify({
          multiple: false,
          options: [
            { id: "geo1", text: "$3$" },
            { id: "geo2", text: "$6$" },
            { id: "geo3", text: "$9$" },
            { id: "geo4", text: "$27$" },
          ],
          correct: ["geo3"],
        }),
        explanation: "Area scales by $k^2=9$.",
      },
      {
        tenantId: northfield.id,
        assessmentId: geometryQuiz.id,
        type: "NUMERIC",
        prompt: "A sector has radius $6$ and central angle $\\frac{\\pi}{2}$. What is its area in square units? Leave your answer in terms of $\\pi$ by entering only the coefficient (so $3\\pi$ is entered as 3).",
        points: 3,
        order: 1,
        data: JSON.stringify({ answer: 9, tolerance: 0.01 }),
        explanation: "$A=\\frac12 r^2\\theta=\\frac12\\cdot36\\cdot\\frac{\\pi}{2}=9\\pi$.",
      },
      {
        tenantId: northfield.id,
        assessmentId: geometryQuiz.id,
        type: "OPEN_ENDED",
        prompt: "Prove that the base angles of an isosceles triangle are congruent.",
        points: 5,
        order: 2,
        data: JSON.stringify({
          rubric: [
            { id: "gr1", criterion: "Draws or names an auxiliary bisector/median", points: 2 },
            { id: "gr2", criterion: "Uses congruence criteria (SAS/SSS/ASA) correctly", points: 2 },
            { id: "gr3", criterion: "Concludes with corresponding parts", points: 1 },
          ],
          minWords: 30,
        }),
        explanation: "Look for a valid auxiliary construction and a congruence argument.",
      },
    ],
  });

  // ── Draft calculus course ────────────────────────────────────────────────
  const calculus = await db.course.create({
    data: {
      tenantId: northfield.id,
      ownerId: marcus.id,
      title: "Calculus Readiness",
      subtitle: "Limits, functions and algebraic fluency",
      description: "A bridge course for students preparing for AP Calculus.",
      subject: "Mathematics",
      level: "Advanced",
      status: "DRAFT",
    },
  });
  await db.lesson.createMany({
    data: [
      {
        courseId: calculus.id,
        title: "Functions & Transformations",
        summary: "Domain, range and composition.",
        order: 0,
        published: true,
        estimatedMinutes: 20,
        content: `# Functions

A function assigns exactly one output to each input. For $f(x)=\\sqrt{x-2}$, the domain is $x\\ge 2$.`,
      },
      {
        courseId: calculus.id,
        title: "An Intuitive Look at Limits",
        summary: "What happens as $x$ approaches a value.",
        order: 1,
        published: false,
        estimatedMinutes: 25,
        content: `# Limits

$$\\lim_{x\\to 2}\\frac{x^2-4}{x-2}=\\lim_{x\\to 2}(x+2)=4.$$`,
      },
    ],
  });

  // ── Question bank (Northfield) ───────────────────────────────────────────
  await db.question.createMany({
    data: [
      {
        tenantId: northfield.id,
        type: "MULTIPLE_CHOICE",
        prompt: "Which limit equals $4$?",
        points: 2,
        difficulty: "MEDIUM",
        tags: "limits,calculus",
        data: JSON.stringify({
          multiple: false,
          options: [
            { id: "b1", text: "$\\lim_{x\\to2}\\frac{x^2-4}{x-2}$" },
            { id: "b2", text: "$\\lim_{x\\to0}\\frac1x$" },
            { id: "b3", text: "$\\lim_{x\\to3}(x-1)$" },
          ],
          correct: ["b1"],
        }),
        explanation: "Factor and cancel: the limit is $x+2\\to4$.",
      },
      {
        tenantId: northfield.id,
        type: "NUMERIC",
        prompt: "If $f(x)=x^2+3x$, what is $f'(2)$?",
        points: 2,
        difficulty: "MEDIUM",
        tags: "derivatives,calculus",
        data: JSON.stringify({ answer: 7, tolerance: 0.01 }),
        explanation: "$f'(x)=2x+3$, so $f'(2)=7$.",
      },
      {
        tenantId: northfield.id,
        type: "FORMULA",
        prompt: "Write the derivative of $\\sin x$.",
        points: 2,
        difficulty: "EASY",
        tags: "derivatives,trigonometry",
        data: JSON.stringify({ answer: "\\cos x", alternatives: ["cos(x)", "\\cos(x)"] }),
        explanation: "$\\frac{d}{dx}\\sin x=\\cos x$.",
      },
      {
        tenantId: northfield.id,
        type: "OPEN_ENDED",
        prompt: "Explain the difference between average rate of change and instantaneous rate of change.",
        points: 4,
        difficulty: "MEDIUM",
        tags: "derivatives,concepts",
        data: JSON.stringify({
          rubric: [
            { id: "br1", criterion: "Defines average rate over an interval", points: 2 },
            { id: "br2", criterion: "Defines instantaneous rate as a limit / derivative", points: 2 },
          ],
        }),
      },
      {
        tenantId: northfield.id,
        type: "FILL_BLANK",
        prompt: "On the unit circle, $\\sin\\left(\\frac{\\pi}{6}\\right)=\\_$ and $\\cos\\left(\\frac{\\pi}{3}\\right)=\\_$.",
        points: 2,
        difficulty: "EASY",
        tags: "trigonometry,unit-circle",
        data: JSON.stringify({
          blanks: [
            { id: "tb1", accepted: ["1/2", "0.5"] },
            { id: "tb2", accepted: ["1/2", "0.5"] },
          ],
        }),
      },
    ],
  });

  // ── Studio Math course ───────────────────────────────────────────────────
  console.log("Building Studio Math course…");
  const sat = await db.course.create({
    data: {
      tenantId: studio.id,
      ownerId: maya.id,
      title: "SAT Math Accelerator",
      subtitle: "Six weeks to a confident 700+",
      description:
        "A focused, small-group SAT math program. Live sessions twice a week, targeted problem sets and a full diagnostic.",
      subject: "Mathematics",
      level: "Test Prep",
      status: "PUBLISHED",
    },
  });

  await db.lesson.createMany({
    data: [
      {
        courseId: sat.id,
        title: "Heart of Algebra",
        summary: "Linear equations, systems and inequalities.",
        order: 0,
        published: true,
        estimatedMinutes: 25,
        content: `# Heart of Algebra

The SAT loves linear models. Practice translating words into equations.

A line through $(1,3)$ and $(3,7)$ has slope

$$m=\\frac{7-3}{3-1}=2.$$

Using point-slope form, $y-3=2(x-1)$, which simplifies to $y=2x+1$.`,
      },
      {
        courseId: sat.id,
        title: "Problem Solving & Data Analysis",
        summary: "Ratios, percentages, graphs and statistics.",
        order: 1,
        published: true,
        estimatedMinutes: 20,
        content: `# Data analysis

Percent change is

$$\\frac{\\text{new}-\\text{old}}{\\text{old}}\\times100\\%.$$

If a price rises from $\\$40$ to $\\$50$, that is a $25\\%$ increase.`,
      },
      {
        courseId: sat.id,
        title: "Passport to Advanced Math",
        summary: "Quadratics, exponents and function notation.",
        order: 2,
        published: true,
        estimatedMinutes: 30,
        content: `# Advanced math

Know the three forms of a quadratic and when each is useful.

$$f(x)=a(x-h)^2+k$$

The vertex is $(h,k)$, which answers most "maximum/minimum" questions.`,
      },
      {
        courseId: sat.id,
        title: "Geometry & Trigonometry",
        summary: "Angles, circles, special right triangles and SOH-CAH-TOA.",
        order: 3,
        published: true,
        estimatedMinutes: 22,
        content: `# Geometry and trig

Special right triangles:

$$45^\\circ-45^\\circ-90^\\circ:\\; x,\\;x,\\;x\\sqrt2$$

$$30^\\circ-60^\\circ-90^\\circ:\\; x,\\;x\\sqrt3,\\;2x$$`,
      },
    ],
  });

  const satQuiz = await db.assessment.create({
    data: {
      tenantId: studio.id,
      courseId: sat.id,
      title: "SAT Algebra Diagnostic",
      instructions:
        "A short diagnostic to place you in the right problem set. No calculator needed for the first three questions.",
      type: "QUIZ",
      status: "PUBLISHED",
      timeLimitMin: 15,
      attemptsAllowed: 3,
      passScore: 60,
      showResults: "AFTER_SUBMIT",
      dueAt: days(21),
    },
  });

  const satQ1 = await db.question.create({
    data: {
      tenantId: studio.id,
      assessmentId: satQuiz.id,
      type: "MULTIPLE_CHOICE",
      prompt: "If $3x+7=22$, what is the value of $6x+14$?",
      points: 2,
      order: 0,
      data: JSON.stringify({
        multiple: false,
        options: [
          { id: "s1", text: "$15$" },
          { id: "s2", text: "$30$" },
          { id: "s3", text: "$44$" },
          { id: "s4", text: "$36$" },
        ],
        correct: ["s2"],
      }),
      explanation: "$3x=15$, so $x=5$ and $6x+14=44$… actually $3x+7=22\\Rightarrow3x=15\\Rightarrow x=5$, hence $6x+14=44$.",
    },
  });
  // Fix the explanation/correct pair: 6x+14 = 44.
  await db.question.update({ where: { id: satQ1.id }, data: { data: JSON.stringify({
    multiple: false,
    options: [
      { id: "s1", text: "$15$" },
      { id: "s2", text: "$30$" },
      { id: "s3", text: "$44$" },
      { id: "s4", text: "$58$" },
    ],
    correct: ["s3"],
  }), explanation: "$3x=15$ so $x=5$, hence $6x+14=44$." } });

  const satQ2 = await db.question.create({
    data: {
      tenantId: studio.id,
      assessmentId: satQuiz.id,
      type: "NUMERIC",
      prompt: "The line $y=2x+1$ crosses the $x$-axis at $x=\\_$. Enter the value as a decimal.",
      points: 2,
      order: 1,
      data: JSON.stringify({ answer: -0.5, tolerance: 0.01 }),
      explanation: "Set $y=0$: $2x+1=0\\Rightarrow x=-\\frac12$.",
    },
  });

  const satQ3 = await db.question.create({
    data: {
      tenantId: studio.id,
      assessmentId: satQuiz.id,
      type: "FORMULA",
      prompt: "Solve $x^2-4=0$ for the positive root.",
      points: 2,
      order: 2,
      data: JSON.stringify({ answer: "2", alternatives: ["x=2"] }),
      explanation: "$x^2=4$, so the positive root is $2$.",
    },
  });

  const satQ4 = await db.question.create({
    data: {
      tenantId: studio.id,
      assessmentId: satQuiz.id,
      type: "YES_NO",
      prompt: "The vertex of $y=(x+3)^2-1$ is $(-3,-1)$.",
      points: 1,
      order: 3,
      data: JSON.stringify({ correct: true }),
      explanation: "Vertex form $a(x-h)^2+k$ with $h=-3$, $k=-1$.",
    },
  });

  const satQ5 = await db.question.create({
    data: {
      tenantId: studio.id,
      assessmentId: satQuiz.id,
      type: "OPEN_ENDED",
      prompt: "Describe one strategy you use to avoid careless errors on the SAT math section.",
      points: 3,
      order: 4,
      data: JSON.stringify({
        rubric: [
          { id: "sr1", criterion: "Names a concrete strategy", points: 2 },
          { id: "sr2", criterion: "Explains how it prevents a specific error", points: 1 },
        ],
        minWords: 20,
      }),
    },
  });

  const precalc = await db.course.create({
    data: {
      tenantId: studio.id,
      ownerId: maya.id,
      title: "Precalculus Bridge",
      subtitle: "Summer refresher before AP Calculus",
      description: "Draft summer program covering functions, trig identities and limits.",
      subject: "Mathematics",
      level: "Advanced",
      status: "DRAFT",
    },
  });
  await db.lesson.createMany({
    data: [
      {
        courseId: precalc.id,
        title: "Function Families",
        summary: "Recognize and transform core function families.",
        order: 0,
        published: true,
        estimatedMinutes: 20,
        content: `# Function families

Know the shapes of $y=x^2$, $y=x^3$, $y=\\sqrt x$, $y=|x|$, $y=\\sin x$ and $y=e^x$.`,
      },
      {
        courseId: precalc.id,
        title: "Trig Identities Warm-up",
        summary: "Pythagorean and reciprocal identities.",
        order: 1,
        published: false,
        estimatedMinutes: 15,
        content: `# Identities

$$\\sin^2\\theta+\\cos^2\\theta=1$$`,
      },
    ],
  });

  // ── enrollments ──────────────────────────────────────────────────────────
  console.log("Enrolling learners…");
  await db.enrollment.createMany({
    data: [
      { tenantId: northfield.id, courseId: algebra.id, userId: priya.id, progress: 60 },
      { tenantId: northfield.id, courseId: algebra.id, userId: jordan.id, progress: 40 },
      { tenantId: northfield.id, courseId: algebra.id, userId: sofia.id, progress: 20 },
      { tenantId: northfield.id, courseId: algebra.id, userId: liam.id, progress: 80 },
      { tenantId: northfield.id, courseId: algebra.id, userId: aisha.id, progress: 100 },
      { tenantId: northfield.id, courseId: geometry.id, userId: priya.id, progress: 33 },
      { tenantId: northfield.id, courseId: geometry.id, userId: sofia.id, progress: 66 },
      { tenantId: studio.id, courseId: sat.id, userId: noah.id, progress: 50 },
      { tenantId: studio.id, courseId: sat.id, userId: ava.id, progress: 75 },
    ],
  });

  await db.lessonCompletion.createMany({
    data: [
      { lessonId: algebraLessons[0].id, userId: priya.id },
      { lessonId: algebraLessons[1].id, userId: priya.id },
      { lessonId: algebraLessons[2].id, userId: priya.id },
      { lessonId: algebraLessons[0].id, userId: aisha.id },
      { lessonId: algebraLessons[1].id, userId: aisha.id },
      { lessonId: algebraLessons[2].id, userId: aisha.id },
      { lessonId: algebraLessons[3].id, userId: aisha.id },
      { lessonId: algebraLessons[4].id, userId: aisha.id },
    ],
  });

  // ── learner profiles & qualifications ────────────────────────────────────
  console.log("Completing learner profiles…");
  await db.studentProfile.createMany({
    data: [
      {
        tenantId: northfield.id,
        userId: priya.id,
        studentNumber: "NF-2026-0142",
        legalName: "Priya R. Patel",
        dateOfBirth: new Date("2009-03-14T00:00:00.000Z"),
        phone: "(555) 214-0188",
        address: "18 Willow Lane",
        city: "Northfield",
        country: "USA",
        guardianName: "Meera Patel",
        guardianRelationship: "Mother",
        guardianPhone: "(555) 214-0190",
        guardianEmail: "meera.patel@example.com",
        emergencyNotes: "Peanut allergy; carry an epinephrine pen.",
        customFields: JSON.stringify([
          { label: "Preferred name", value: "Priya" },
          { label: "Bus route", value: "Route 12" },
        ]),
        notes: "Strong visual learner. Responds well to worked examples and graph-first explanations.",
      },
      {
        tenantId: northfield.id,
        userId: jordan.id,
        studentNumber: "NF-2026-0157",
        legalName: "Jordan Michael Blake",
        dateOfBirth: new Date("2008-11-02T00:00:00.000Z"),
        phone: "(555) 214-0234",
        address: null,
        city: "Northfield",
        country: "USA",
        guardianName: "Denise Blake",
        guardianRelationship: "Mother",
        guardianPhone: null,
        guardianEmail: null,
        emergencyNotes: null,
        customFields: JSON.stringify([{ label: "Accommodation", value: "Extended time" }]),
        notes: "Missed one recent register for a medical appointment. Needs a catch-up plan on factoring.",
      },
      {
        tenantId: northfield.id,
        userId: sofia.id,
        studentNumber: "NF-2026-0188",
        legalName: null,
        dateOfBirth: null,
        phone: null,
        address: null,
        city: "Northfield",
        country: "USA",
        guardianName: null,
        guardianRelationship: null,
        guardianPhone: null,
        guardianEmail: null,
        emergencyNotes: null,
        customFields: "[]",
        notes: "Profile incomplete — office follow-up requested.",
      },
      {
        tenantId: northfield.id,
        userId: aisha.id,
        studentNumber: "NF-2026-0103",
        legalName: "Aisha Khan",
        dateOfBirth: new Date("2009-06-21T00:00:00.000Z"),
        phone: "(555) 214-0112",
        address: "72 Maple Street",
        city: "Northfield",
        country: "USA",
        guardianName: "Nadia Khan",
        guardianRelationship: "Mother",
        guardianPhone: "(555) 214-0114",
        guardianEmail: "nadia.khan@example.com",
        emergencyNotes: null,
        customFields: JSON.stringify([{ label: "Club", value: "Math Olympiad" }]),
        notes: "Ready for enrichment tasks and peer mentoring.",
      },
      {
        tenantId: northfield.id,
        userId: ethan.id,
        studentNumber: "PROSPECTIVE-004",
        legalName: "Ethan James Cole",
        dateOfBirth: new Date("2009-01-30T00:00:00.000Z"),
        phone: "(555) 214-0311",
        address: null,
        city: "Northfield",
        country: "USA",
        guardianName: "Robert Cole",
        guardianRelationship: "Father",
        guardianPhone: "(555) 214-0313",
        guardianEmail: "robert.cole@example.com",
        emergencyNotes: null,
        customFields: JSON.stringify([{ label: "Previous school", value: "Westview Middle" }]),
        notes: "Prospective learner. Placement pre-assessment completed before enrolment.",
      },
    ],
  });

  await db.learnerQualification.createMany({
    data: [
      {
        tenantId: northfield.id,
        userId: priya.id,
        title: "Algebra I — Honors",
        institution: "Northfield Academy",
        year: 2025,
        grade: "A",
      },
      {
        tenantId: northfield.id,
        userId: priya.id,
        title: "Introduction to Python",
        institution: "CodeClub Weekend Lab",
        year: 2025,
        grade: "Certificate",
      },
      {
        tenantId: northfield.id,
        userId: jordan.id,
        title: "Algebra I",
        institution: "Northfield Academy",
        year: 2025,
        grade: "C+",
      },
      {
        tenantId: northfield.id,
        userId: aisha.id,
        title: "Algebra I — Honors",
        institution: "Northfield Academy",
        year: 2025,
        grade: "A",
      },
      {
        tenantId: northfield.id,
        userId: aisha.id,
        title: "Math Olympiad Level 1",
        institution: "Regional Math League",
        year: 2024,
        grade: "Merit",
      },
      {
        tenantId: northfield.id,
        userId: ethan.id,
        title: "Algebra I",
        institution: "Westview Middle School",
        year: 2025,
        grade: "B+",
      },
    ],
  });

  // ── attendance registers ─────────────────────────────────────────────────
  console.log("Taking attendance…");

  async function seedRegister(input: {
    tenantId: string;
    courseId: string;
    lessonId?: string | null;
    teacherId: string;
    date: Date;
    title: string;
    notes?: string;
    marks: { userId: string; status: string; note?: string }[];
  }) {
    const register = await db.attendanceSession.create({
      data: {
        tenantId: input.tenantId,
        courseId: input.courseId,
        lessonId: input.lessonId ?? null,
        title: input.title,
        notes: input.notes ?? null,
        date: input.date,
        createdById: input.teacherId,
        records: {
          create: input.marks.map((m) => ({
            studentId: m.userId,
            status: m.status,
            note: m.note ?? null,
            markedById: input.teacherId,
          })),
        },
      },
    });
    return register;
  }

  await seedRegister({
    tenantId: northfield.id,
    courseId: algebra.id,
    lessonId: algebraLessons[1].id,
    teacherId: marcus.id,
    date: days(-8),
    title: "Quadratic functions — period 2",
    notes: "Room 214",
    marks: [
      { userId: priya.id, status: "PRESENT" },
      { userId: jordan.id, status: "PRESENT" },
      { userId: sofia.id, status: "LATE", note: "Bus delay" },
      { userId: liam.id, status: "PRESENT" },
      { userId: aisha.id, status: "PRESENT" },
    ],
  });

  await seedRegister({
    tenantId: northfield.id,
    courseId: algebra.id,
    lessonId: algebraLessons[2].id,
    teacherId: marcus.id,
    date: days(-1),
    title: "Factoring practice",
    marks: [
      { userId: priya.id, status: "PRESENT" },
      { userId: jordan.id, status: "ABSENT", note: "Doctor appointment" },
      { userId: sofia.id, status: "PRESENT" },
      { userId: liam.id, status: "EXCUSED", note: "Field trip" },
      { userId: aisha.id, status: "PRESENT" },
    ],
  });

  await seedRegister({
    tenantId: northfield.id,
    courseId: geometry.id,
    teacherId: elena.id,
    date: days(-2),
    title: "Angles & triangles",
    marks: [
      { userId: priya.id, status: "PRESENT" },
      { userId: sofia.id, status: "ABSENT" },
    ],
  });

  await seedRegister({
    tenantId: studio.id,
    courseId: sat.id,
    teacherId: maya.id,
    date: days(-3),
    title: "Heart of Algebra — live session",
    notes: "Zoom",
    marks: [
      { userId: noah.id, status: "PRESENT" },
      { userId: ava.id, status: "LATE", note: "Joined 10 minutes late" },
    ],
  });

  // ── attempts ─────────────────────────────────────────────────────────────
  console.log("Creating attempts and grading queues…");

  async function createAttempt(input: {
    assessmentId: string;
    studentId: string;
    tenantId: string;
    status: string;
    startedAt: Date;
    submittedAt?: Date;
    timeSpentSec: number;
    maxScore: number;
    answers: {
      questionId: string;
      response: Record<string, unknown>;
      score: number | null;
      maxScore: number;
    }[];
  }) {
    const score = input.answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const attempt = await db.attempt.create({
      data: {
        tenantId: input.tenantId,
        assessmentId: input.assessmentId,
        studentId: input.studentId,
        status: input.status,
        maxScore: input.maxScore,
        score: input.status === "IN_PROGRESS" ? null : score,
        startedAt: input.startedAt,
        submittedAt: input.submittedAt ?? null,
        gradedAt: input.status === "GRADED" ? (input.submittedAt ?? input.startedAt) : null,
        timeSpentSec: input.timeSpentSec,
      },
    });
    await db.answer.createMany({
      data: input.answers.map((a) => ({
        attemptId: attempt.id,
        questionId: a.questionId,
        response: JSON.stringify(a.response),
        maxScore: a.maxScore,
        score: a.score,
        gradedAt: a.score === null ? null : (input.submittedAt ?? input.startedAt),
      })),
    });
    return attempt;
  }

  // Placement pre-assessment attempts. Ethan is not enrolled in the course,
  // which is exactly the prospective-learner case this assessment type serves.
  const priyaPlacement = await createAttempt({
    assessmentId: algebraPlacement.id,
    studentId: priya.id,
    tenantId: northfield.id,
    status: "GRADED",
    startedAt: days(-4),
    submittedAt: days(-4),
    timeSpentSec: 312,
    maxScore: 5,
    answers: [
      {
        questionId: placementFormQuestion.id,
        response: { selected: [placementOptionA] },
        score: 2,
        maxScore: 2,
      },
      {
        questionId: placementVertexQuestion.id,
        response: { value: "3" },
        score: 2,
        maxScore: 2,
      },
      {
        questionId: placementSignQuestion.id,
        response: { value: true },
        score: 1,
        maxScore: 1,
      },
    ],
  });

  const ethanPlacement = await createAttempt({
    assessmentId: algebraPlacement.id,
    studentId: ethan.id,
    tenantId: northfield.id,
    status: "GRADED",
    startedAt: days(-3),
    submittedAt: days(-3),
    timeSpentSec: 487,
    maxScore: 5,
    answers: [
      {
        questionId: placementFormQuestion.id,
        response: { selected: [placementOptionA] },
        score: 2,
        maxScore: 2,
      },
      {
        questionId: placementVertexQuestion.id,
        response: { value: "3" },
        score: 2,
        maxScore: 2,
      },
      {
        questionId: placementSignQuestion.id,
        response: { value: false },
        score: 0,
        maxScore: 1,
      },
    ],
  });

  // Priya: graded quiz attempt (11 / 14 = 79%)
  await createAttempt({
    assessmentId: quadQuiz.id,
    studentId: priya.id,
    tenantId: northfield.id,
    status: "GRADED",
    startedAt: days(-6),
    submittedAt: days(-6),
    timeSpentSec: 742,
    maxScore: 14,
    answers: [
      { questionId: qVertex.id, response: { selected: [ids.q1a] }, score: 2, maxScore: 2 },
      { questionId: qDiscriminant.id, response: { value: "12" }, score: 0, maxScore: 2 },
      { questionId: qRoot.id, response: { value: "3" }, score: 3, maxScore: 3 },
      { questionId: qVertexYesNo.id, response: { value: true }, score: 1, maxScore: 1 },
      { questionId: qFactor.id, response: { values: { b1: "3", b2: "4" } }, score: 3, maxScore: 3 },
      { questionId: qMatch.id, response: { pairs: { l1: "r1", l2: "r2", l3: "r4" } }, score: 2, maxScore: 3 },
    ],
  });

  // Jordan: submitted exam with one open response waiting for a teacher.
  const jordanAttempt = await createAttempt({
    assessmentId: unitExam.id,
    studentId: jordan.id,
    tenantId: northfield.id,
    status: "SUBMITTED",
    startedAt: days(-1),
    submittedAt: days(-1),
    timeSpentSec: 1_680,
    maxScore: 18,
    answers: [
      { questionId: qGraph.id, response: { selected: ["g3"] }, score: 2, maxScore: 2 },
      { questionId: qDegree.id, response: { selected: ["d1", "d3"] }, score: 2, maxScore: 2 },
      {
        questionId: qCase.id,
        response: {
          sub: {
            [caseSubArea]: { selected: ["c2"] },
            [caseSubWidth]: { value: "3" },
            [caseSubQuadratic]: { value: true },
          },
        },
        score: 6,
        maxScore: 6,
      },
      {
        questionId: qExplain.id,
        response: {
          text:
            "The degree tells you whether the two ends go the same way. Even degree means both ends point the same direction, odd degree means they point opposite ways. The leading coefficient then decides up or down. For example $y=x^2$ goes up on both sides, while $y=-x^2$ goes down on both sides.",
        },
        score: null,
        maxScore: 5,
      },
      { questionId: qEval.id, response: { value: "5" }, score: 2, maxScore: 2 },
      { questionId: qFactorTheorem.id, response: { value: true }, score: 1, maxScore: 1 },
    ],
  });

  // Sofia: a second submitted exam, fully auto-graded except the rubric item.
  await createAttempt({
    assessmentId: unitExam.id,
    studentId: sofia.id,
    tenantId: northfield.id,
    status: "SUBMITTED",
    startedAt: days(-2),
    submittedAt: days(-2),
    timeSpentSec: 2_050,
    maxScore: 18,
    answers: [
      { questionId: qGraph.id, response: { selected: ["g2"] }, score: 0, maxScore: 2 },
      { questionId: qDegree.id, response: { selected: ["d1"] }, score: 1, maxScore: 2 },
      {
        questionId: qCase.id,
        response: {
          sub: {
            [caseSubArea]: { selected: ["c2"] },
            [caseSubWidth]: { value: "3" },
            [caseSubQuadratic]: { value: false },
          },
        },
        score: 4,
        maxScore: 6,
      },
      {
        questionId: qExplain.id,
        response: { text: "The degree determines the end behavior." },
        score: null,
        maxScore: 5,
      },
      { questionId: qEval.id, response: { value: "5" }, score: 2, maxScore: 2 },
      { questionId: qFactorTheorem.id, response: { value: false }, score: 0, maxScore: 1 },
    ],
  });

  // Priya: in-progress Geometry checkpoint, so the UI has a "continue" state.
  const geometryQuestions = await db.question.findMany({
    where: { assessmentId: geometryQuiz.id },
    orderBy: { order: "asc" },
  });
  const geoAttempt = await db.attempt.create({
    data: {
      tenantId: northfield.id,
      assessmentId: geometryQuiz.id,
      studentId: priya.id,
      status: "IN_PROGRESS",
      maxScore: 10,
      startedAt: new Date(Date.now() - 9 * 60_000),
      answers: {
        create: geometryQuestions.map((q, i) => ({
          questionId: q.id,
          maxScore: q.points,
          response:
            i === 0
              ? JSON.stringify({ selected: ["geo3"] })
              : "{}",
        })),
      },
    },
  });
  void geoAttempt;

  // Noah: submitted SAT diagnostic with a pending written response.
  await createAttempt({
    assessmentId: satQuiz.id,
    studentId: noah.id,
    tenantId: studio.id,
    status: "SUBMITTED",
    startedAt: days(-4),
    submittedAt: days(-4),
    timeSpentSec: 630,
    maxScore: 10,
    answers: [
      { questionId: satQ1.id, response: { selected: ["s3"] }, score: 2, maxScore: 2 },
      { questionId: satQ2.id, response: { value: "-0.5" }, score: 2, maxScore: 2 },
      { questionId: satQ3.id, response: { value: "2" }, score: 2, maxScore: 2 },
      { questionId: satQ4.id, response: { value: true }, score: 1, maxScore: 1 },
      {
        questionId: satQ5.id,
        response: {
          text: "I underline the actual question so I don't solve for x when it asks for 2x.",
        },
        score: null,
        maxScore: 3,
      },
    ],
  });

  // Ava: fully graded SAT diagnostic.
  const avaAttempt = await createAttempt({
    assessmentId: satQuiz.id,
    studentId: ava.id,
    tenantId: studio.id,
    status: "GRADED",
    startedAt: days(-7),
    submittedAt: days(-7),
    timeSpentSec: 540,
    maxScore: 10,
    answers: [
      { questionId: satQ1.id, response: { selected: ["s3"] }, score: 2, maxScore: 2 },
      { questionId: satQ2.id, response: { value: "-0.5" }, score: 2, maxScore: 2 },
      { questionId: satQ3.id, response: { value: "2" }, score: 2, maxScore: 2 },
      { questionId: satQ4.id, response: { value: true }, score: 1, maxScore: 1 },
      {
        questionId: satQ5.id,
        response: {
          text: "I re-read the question and circle what it is asking for before I start algebra.",
        },
        score: 3,
        maxScore: 3,
      },
    ],
  });
  await db.answer.updateMany({
    where: { attemptId: avaAttempt.id },
    data: { feedback: "Clear strategy — keep using it on timed sections.", gradedById: maya.id },
  });

  // Give Jordan's pending written answer a teacher note placeholder (unscored).
  await db.answer.updateMany({
    where: { attemptId: jordanAttempt.id, score: null },
    data: { feedback: null },
  });

  // ── AI-assisted qualification checks ─────────────────────────────────────
  // These rows mirror the explainable local scorer used by the qualification
  // action. Hosted providers can refine them later in Settings → AI.
  console.log("Saving qualification checks…");
  await db.courseEligibility.createMany({
    data: [
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        studentId: priya.id,
        status: "QUALIFIED",
        score: 95,
        confidence: 90,
        summary:
          "Priya Patel is ready for Algebra II. A 100% placement result, a 79% quiz average and full attendance clear the 65% entry benchmark, supported by two prior qualifications.",
        reasons: JSON.stringify([
          { label: "Placement pre-assessment", status: "PASS", detail: "Best placement result 100% against a 65% entry benchmark." },
          { label: "Graded course work", status: "PASS", detail: "79% average across 1 graded attempt." },
          { label: "Attendance", status: "PASS", detail: "100% attendance across 2 registers." },
          { label: "Prior qualifications", status: "PASS", detail: "2 qualifications on file (Algebra I — Honors, Introduction to Python)." },
          { label: "Profile completeness", status: "PASS", detail: "100% of identity, contact and next-of-kin details captured." },
        ]),
        source: "HEURISTIC",
        placementAttemptId: priyaPlacement.id,
        createdById: marcus.id,
        createdAt: days(-1),
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        studentId: ethan.id,
        status: "QUALIFIED",
        score: 86,
        confidence: 75,
        summary:
          "Ethan Cole qualifies for Algebra II on the strength of an 80% placement result and a complete profile, even though he is not enrolled yet. No course grades or attendance exist for comparison.",
        reasons: JSON.stringify([
          { label: "Placement pre-assessment", status: "PASS", detail: "Best placement result 80% against a 65% entry benchmark." },
          { label: "Graded course work", status: "WARN", detail: "No graded work in this course yet, so readiness leans on the placement result." },
          { label: "Attendance", status: "WARN", detail: "No attendance register has been taken for this course yet." },
          { label: "Prior qualifications", status: "WARN", detail: "1 qualification on file (Algebra I)." },
          { label: "Profile completeness", status: "PASS", detail: "91% of identity, contact and next-of-kin details captured." },
        ]),
        source: "HEURISTIC",
        placementAttemptId: ethanPlacement.id,
        createdById: marcus.id,
        createdAt: days(-2),
      },
      {
        tenantId: northfield.id,
        courseId: algebra.id,
        studentId: jordan.id,
        status: "PROVISIONAL",
        score: 65,
        confidence: 60,
        summary:
          "Jordan Blake is close to the entry benchmark but needs confirmation. Attendance is 50% and the profile is only partly complete; a placement attempt would settle the decision.",
        reasons: JSON.stringify([
          { label: "Placement pre-assessment", status: "WARN", detail: "No completed placement pre-assessment yet. Run one to confirm readiness." },
          { label: "Graded course work", status: "WARN", detail: "No graded work in this course yet, so readiness leans on the placement result." },
          { label: "Attendance", status: "FAIL", detail: "50% attendance across 2 registers." },
          { label: "Prior qualifications", status: "WARN", detail: "1 qualification on file (Algebra I)." },
          { label: "Profile completeness", status: "WARN", detail: "73% of identity, contact and next-of-kin details captured." },
        ]),
        source: "HEURISTIC",
        createdById: marcus.id,
        createdAt: days(-1),
      },
      {
        tenantId: northfield.id,
        courseId: geometry.id,
        studentId: sofia.id,
        status: "NOT_QUALIFIED",
        score: 14,
        confidence: 45,
        summary:
          "Sofia Martinez does not currently meet the Geometry Foundations entry benchmark. There is no placement result or graded evidence, attendance is 0%, and the profile needs completing before enrolment.",
        reasons: JSON.stringify([
          { label: "Placement pre-assessment", status: "WARN", detail: "No completed placement pre-assessment yet. Run one to confirm readiness." },
          { label: "Graded course work", status: "WARN", detail: "No graded work in this course yet, so readiness leans on the placement result." },
          { label: "Attendance", status: "FAIL", detail: "0% attendance across 1 register." },
          { label: "Prior qualifications", status: "FAIL", detail: "No qualifications recorded on the learner profile." },
          { label: "Profile completeness", status: "FAIL", detail: "27% of identity, contact and next-of-kin details captured." },
        ]),
        source: "HEURISTIC",
        createdById: elena.id,
        createdAt: days(-2),
      },
    ],
  });

  // ── AI success benchmarks ────────────────────────────────────────────────
  // Seeds local-only runs so the insights dashboard is populated out of the
  // box. Hosted models are optional and configure later in Settings → AI.
  console.log("Running local success benchmarks…");

  async function seedLocalBenchmark(input: {
    tenantId: string;
    courseId: string | null;
    actorId: string;
    daysAgo: number;
    offset?: number;
  }) {
    const features = await buildStudentFeatures(db, {
      tenantId: input.tenantId,
      courseId: input.courseId,
    });
    if (features.length === 0) return null;

    const createdAt = days(input.daysAgo);
    const run = await db.aiBenchmarkRun.create({
      data: {
        tenantId: input.tenantId,
        courseId: input.courseId,
        provider: "local",
        model: "nkanyezi-local-v1",
        source: "HEURISTIC",
        status: "SUCCESS",
        studentCount: features.length,
        okCount: features.length,
        latencyMs: 380 + features.length * 24,
        createdById: input.actorId,
        createdAt,
      },
    });

    await db.successBenchmark.createMany({
      data: features.map((student) => {
        const probability = Math.min(
          99,
          Math.max(1, student.heuristic.successProbability + (input.offset ?? 0))
        );
        return {
          tenantId: input.tenantId,
          runId: run.id,
          studentId: student.studentId,
          courseId: input.courseId,
          successProbability: probability,
          confidence: student.heuristic.confidence,
          riskBand: riskBandFor(probability),
          headline: student.heuristic.headline,
          summary: student.heuristic.summary,
          drivers: JSON.stringify(student.heuristic.drivers),
          recommendations: JSON.stringify(student.heuristic.recommendations),
          features: JSON.stringify(student),
          source: "HEURISTIC",
          provider: "local",
          model: "nkanyezi-local-v1",
          createdAt,
        };
      }),
    });

    return run;
  }

  await seedLocalBenchmark({
    tenantId: northfield.id,
    courseId: algebra.id,
    actorId: marcus.id,
    daysAgo: -12,
    offset: -7,
  });
  const northfieldRun = await seedLocalBenchmark({
    tenantId: northfield.id,
    courseId: algebra.id,
    actorId: marcus.id,
    daysAgo: -1,
  });
  await seedLocalBenchmark({
    tenantId: studio.id,
    courseId: sat.id,
    actorId: maya.id,
    daysAgo: -2,
    offset: 3,
  });
  void northfieldRun;

  // ── invitations, email, audit ────────────────────────────────────────────
  const inviteToken = "northfield-demo-invite";
  await db.invitation.create({
    data: {
      tenantId: northfield.id,
      email: "newteacher@northfield.edu",
      role: "TEACHER",
      tokenHash: tokenHash(inviteToken),
      invitedById: elena.id,
      expiresAt: days(7),
    },
  });
  const studioInvite = "studio-demo-invite";
  await db.invitation.create({
    data: {
      tenantId: studio.id,
      email: "parent@studiomath.io",
      role: "STUDENT",
      courseId: sat.id,
      tokenHash: tokenHash(studioInvite),
      invitedById: maya.id,
      expiresAt: days(7),
    },
  });

  await db.emailMessage.createMany({
    data: [
      {
        tenantId: northfield.id,
        to: "newteacher@northfield.edu",
        subject: "You are invited to Northfield Academy on Nkanyezi",
        body: "Dr. Elena Rivera invited you to join Northfield Academy as a teacher.",
        kind: "INVITE",
        sentAt: days(-2),
      },
      {
        tenantId: northfield.id,
        to: "priya.patel@example.com",
        subject: "Your Quadratic Functions Quiz result",
        body: "Your attempt was graded. Sign in to see the feedback.",
        kind: "RESULT",
        sentAt: days(-5),
      },
      {
        tenantId: studio.id,
        to: "maya@studiomath.io",
        subject: "Welcome to Nkanyezi",
        body: "Your Studio Math workspace is ready. Your 14-day Growth trial has started.",
        kind: "WELCOME",
        sentAt: days(-3),
      },
      {
        tenantId: studio.id,
        to: "parent@studiomath.io",
        subject: "Maya invited you to Studio Math",
        body: "Join Studio Math to follow the SAT Math Accelerator course.",
        kind: "INVITE",
      },
    ],
  });

  await db.auditLog.createMany({
    data: [
      { tenantId: northfield.id, actorId: elena.id, action: "tenant.created", target: northfield.id, createdAt: days(-30) },
      { tenantId: northfield.id, actorId: marcus.id, action: "course.published", target: algebra.id, createdAt: days(-20) },
      { tenantId: northfield.id, actorId: priya.id, action: "attempt.started", target: quadQuiz.id, createdAt: days(-6) },
      { tenantId: northfield.id, actorId: priya.id, action: "attempt.submitted", target: quadQuiz.id, createdAt: days(-6) },
      { tenantId: northfield.id, actorId: jordan.id, action: "attempt.submitted", target: unitExam.id, createdAt: days(-1) },
      { tenantId: studio.id, actorId: maya.id, action: "tenant.created", target: studio.id, createdAt: days(-3) },
      { tenantId: studio.id, actorId: maya.id, action: "course.published", target: sat.id, createdAt: days(-3) },
      { tenantId: studio.id, actorId: noah.id, action: "attempt.submitted", target: satQuiz.id, createdAt: days(-4) },
    ],
  });

  console.log("\nDemo data ready.\n");
  console.log("  Super admin   admin@nkanyezi.dev        / Password123!");
  console.log("  School owner  owner@northfield.edu   / Password123!");
  console.log("  Teacher       teacher@northfield.edu / Password123!");
  console.log("  Student       student@northfield.edu / Password123!");
  console.log("  Prospective   ethan@northfield.edu   / Password123! (not enrolled; placement demo)");
  console.log("  Solo teacher  maya@studiomath.io     / Password123!");
  console.log("\n  Invite links: /join/northfield-demo-invite and /join/studio-demo-invite\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
