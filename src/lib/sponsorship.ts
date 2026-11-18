export const SPONSORSHIP_TYPES = [
  "SELF",
  "BURSAR",
  "SCHOLARSHIP",
  "WORK_SPONSORED",
  "EMPLOYER",
  "GOVERNMENT",
  "DONOR",
  "FAMILY",
  "OTHER",
] as const;

export type SponsorshipType = (typeof SPONSORSHIP_TYPES)[number];

export const SPONSORSHIP_TYPE_LABELS: Record<SponsorshipType, string> = {
  SELF: "Self-funded",
  BURSAR: "Bursary",
  SCHOLARSHIP: "Scholarship",
  WORK_SPONSORED: "Work-sponsored",
  EMPLOYER: "Employer-sponsored",
  GOVERNMENT: "Government / NSFAS",
  DONOR: "Donor / NGO",
  FAMILY: "Family / Guardian",
  OTHER: "Other",
};

export function isSponsorshipType(value: unknown): value is SponsorshipType {
  return typeof value === "string" && (SPONSORSHIP_TYPES as readonly string[]).includes(value);
}

export function sponsorshipLabel(value?: string | null) {
  return isSponsorshipType(value) ? SPONSORSHIP_TYPE_LABELS[value] : "Not set";
}

/** Parse a yyyy-mm-dd form value into a stable local-noon date. */
export function parseSponsorshipDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toSponsorshipDateInput(date?: Date | null) {
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addSponsorshipMonths(start: Date, months: number) {
  const result = new Date(start.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function monthsBetweenSponsorshipDates(start: Date, end: Date) {
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export function sponsorshipDuration(
  start?: Date | null,
  end?: Date | null,
  months?: number | null
) {
  if (months && months > 0) return `${months} month${months === 1 ? "" : "s"}`;
  if (start && end) {
    const derived = monthsBetweenSponsorshipDates(start, end);
    if (derived > 0) return `${derived} month${derived === 1 ? "" : "s"}`;
  }
  return "Not set";
}

export function sponsorshipStatus(
  start?: Date | null,
  end?: Date | null,
  now = new Date()
): "UPCOMING" | "ACTIVE" | "ENDED" | "NOT_SET" {
  if (!start && !end) return "NOT_SET";
  if (end && end.getTime() < now.getTime()) return "ENDED";
  if (start && start.getTime() > now.getTime()) return "UPCOMING";
  return "ACTIVE";
}
