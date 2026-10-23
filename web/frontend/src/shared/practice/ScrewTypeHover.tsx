// related files:
// - web/frontend/src/shared/practice/screwSupply.ts
// - web/frontend/src/components/ui/tooltip.tsx
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// 제조사 스크류 번호에 마우스를 올리면 1–6 회사명을 보여 준다.
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  FIXTURE_MANUFACTURER_SCREW_ROWS,
  manufacturerScrewHoverNumber,
} from "@/shared/practice/screwSupply";

function ScrewManufacturerLegend({ activeNumber }: { activeNumber: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5 text-left text-sm">
      {FIXTURE_MANUFACTURER_SCREW_ROWS.map((row) => {
        const active = row.number === activeNumber;
        return (
          <div key={row.number} className="whitespace-nowrap">
            <span className={active ? "font-bold text-red-600" : undefined}>{row.number}</span>{" "}
            {row.name}
          </div>
        );
      })}
    </div>
  );
}

/** 제조사 번호(1–6)일 때만 회사 목록 툴팁. A–E는 그대로 둔다. */
export function ScrewTypeHover({
  screwType,
  className,
  children,
}: {
  screwType: unknown;
  className?: string;
  children: ReactNode;
}) {
  const number = manufacturerScrewHoverNumber(screwType);
  if (!number) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex max-w-full", className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>
        <ScrewManufacturerLegend activeNumber={number} />
      </TooltipContent>
    </Tooltip>
  );
}
