// change-log:
// - 2026-08-17: 사업영역 공통 섹션 헤더·도움말.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
import type { ComponentType, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";

export function FieldHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600"
          aria-label="도움말"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
          <Icon className="h-5 w-5 text-primary-strong" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export function initials(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1);
}
