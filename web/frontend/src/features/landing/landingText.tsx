// related files:
// - web/frontend/src/features/landing/LabOfferSections.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { cn } from "@/shared/ui/cn";
import { landingSky, landingTypo } from "./landingTheme";

/** 문장 단위 줄바꿈. 배열 한 칸 = 한 문장 = 한 줄 (`.cursor/rules/ui-copy-line-break.mdc`). */
export function Lines({
  lines,
  className,
}: {
  lines: readonly string[];
  className?: string;
}) {
  return (
    <p className={cn("break-keep", className)}>
      {lines.map((line, index) => (
        <span key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

/** 섹션 위 작은 대문자 라벨. */
export function SectionEyebrow({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p className={cn(landingTypo.eyebrow, landingSky.accent, className)}>
      {children}
    </p>
  );
}
