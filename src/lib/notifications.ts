export const MESSAGE_AUDIENCES = ["ALL", "STAFF", "TEACHERS", "LEARNERS"] as const;

export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];

export const MESSAGE_AUDIENCE_LABELS: Record<MessageAudience, string> = {
  ALL: "Everyone in this workspace",
  STAFF: "All staff",
  TEACHERS: "Teachers & course owners",
  LEARNERS: "All learners",
};

export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  MESSAGE: "Message",
  ANNOUNCEMENT: "Announcement",
  SYSTEM: "System",
};

export function isMessageAudience(value: unknown): value is MessageAudience {
  return typeof value === "string" && (MESSAGE_AUDIENCES as readonly string[]).includes(value);
}

export function audienceLabel(value?: string | null) {
  return value && isMessageAudience(value) ? MESSAGE_AUDIENCE_LABELS[value] : "Direct message";
}

export function notificationKindLabel(value?: string | null) {
  return (value && NOTIFICATION_KIND_LABELS[value]) || "Message";
}
