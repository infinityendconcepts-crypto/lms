export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

type Tone = "green" | "red" | "amber" | "sky";

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  {
    label: string;
    short: string;
    tone: Tone;
    /** Classes applied to the radio "chip" when selected. */
    selected: string;
    /** Small solid marker used in tables. */
    dot: string;
  }
> = {
  PRESENT: {
    label: "Present",
    short: "P",
    tone: "green",
    selected: "peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white",
    dot: "bg-emerald-500",
  },
  ABSENT: {
    label: "Absent",
    short: "A",
    tone: "red",
    selected: "peer-checked:border-rose-600 peer-checked:bg-rose-600 peer-checked:text-white",
    dot: "bg-rose-500",
  },
  LATE: {
    label: "Late",
    short: "L",
    tone: "amber",
    selected: "peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white",
    dot: "bg-amber-500",
  },
  EXCUSED: {
    label: "Excused",
    short: "E",
    tone: "sky",
    selected: "peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:text-white",
    dot: "bg-sky-500",
  },
};

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/**
 * Attendance rate counts present + late as attended. Excused absences are
 * removed from the denominator so authorized leave does not hurt the rate.
 */
export function attendanceRate(records: { status: string }[]) {
  const considered = records.filter((r) => r.status !== "EXCUSED");
  if (considered.length === 0) return 0;
  const attended = considered.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  return Math.round((attended / considered.length) * 100);
}

export function countStatuses(records: { status: string }[]) {
  const counts: Record<AttendanceStatus, number> = {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    EXCUSED: 0,
  };
  for (const record of records) {
    if (isAttendanceStatus(record.status)) counts[record.status] += 1;
  }
  return counts;
}

/** Parse a yyyy-mm-dd input into a stable local-noon date (avoids UTC off-by-one). */
export function registerDate(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return today;
}

export function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Classroom codes are short-lived; teachers can generate a fresh one anytime. */
export const ATTENDANCE_CODE_MINUTES = 30;

export function normalizeAttendanceCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function attendanceCodeActive(
  session: { checkInCode: string | null; checkInCodeExpiresAt: Date | null },
  now = new Date()
) {
  return Boolean(
    session.checkInCode &&
      session.checkInCodeExpiresAt &&
      session.checkInCodeExpiresAt.getTime() > now.getTime()
  );
}

/** Parse a yyyy-mm-dd value strictly so invalid calendar links fall back safely. */
export function parseDateInput(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || dateInputValue(parsed) !== value) return null;
  return parsed;
}

/** Always return a local-noon date on the first of a month. */
export function monthDate(value?: string | null) {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})$/) : null;
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return new Date(year, month - 1, 1, 12);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12);
}

export function shiftMonth(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
}

export function monthBounds(date: Date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0),
  };
}

/** Sunday-first calendar grid padded to whole weeks; null means an empty cell. */
export function calendarMonthDays(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const leading = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (Date | null)[] = [];
  for (let i = 0; i < leading; i += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) days.push(new Date(year, month, day, 12));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
