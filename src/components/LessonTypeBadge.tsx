import { BookOpen, Code2, Palette, Sigma } from "lucide-react";
import { Badge } from "@/components/ui";
import { LESSON_TYPE_META, lessonTypeFrom } from "@/lib/lesson-types";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  TEXT: BookOpen,
  CODE: Code2,
  MATH: Sigma,
  VISUAL: Palette,
} as const;

export function LessonTypeIcon({
  type,
  className,
}: {
  type?: string | null;
  className?: string;
}) {
  const value = lessonTypeFrom(type);
  const Icon = TYPE_ICONS[value];
  return <Icon className={cn("size-3.5", className)} aria-hidden />;
}

export function LessonTypeBadge({
  type,
  compact = false,
  className,
}: {
  type?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const value = lessonTypeFrom(type);
  const meta = LESSON_TYPE_META[value];
  const Icon = TYPE_ICONS[value];
  return (
    <Badge tone={meta.tone} className={cn("inline-flex items-center gap-1", className)}>
      <Icon className="size-3" aria-hidden />
      {compact ? meta.short : meta.label}
    </Badge>
  );
}
