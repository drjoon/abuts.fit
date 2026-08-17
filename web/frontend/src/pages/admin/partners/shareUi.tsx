// change-log:
// - 2026-08-17: 사업영역 공통 섹션 헤더·도움말. 헤더를 더 작게.
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
          className="inline-flex text-slate-400 transition-colors hover:text-slate-700"
          aria-label="도움말"
        >
          <CircleHelp className="h-3.5 w-3.5" />
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
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
          <Icon className="h-4 w-4 text-primary-strong" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  );
}
