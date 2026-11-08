// related files:
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/shipping/estimateShipDate.ts
// change-log:
// - 2026-11-08: 팝오버 안내는 On 높이로 고정. 호버 때 줄어들지 않는다.
// - 2026-11-08: 안내는 선택 팝오버 안에만. 화면에는 두지 않는다.
// - 2026-11-08: 의뢰 아노다이징 기본 On. Off는 출고 +1영업일 안내.
import type { ReactNode } from "react";
import { Droplets } from "lucide-react";
import { CaseOptionPopoverButton } from "@/shared/components/practice/CaseOptionPopoverButton";
import { cn } from "@/shared/ui/cn";

/** 아노다이징 On/Off 안내. 팝오버·설정 안에서만 쓴다. */
export function AnodizingOptionCopy({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <>
        제조사는 낮은 전압으로 노란색 아노다이징 처리합니다.
        <br />
        기공소에서 높은 전압으로 다시 해도 예쁜 노란색이 됩니다.
      </>
    );
  }
  return <>하루 더 늦게 출고됩니다.</>;
}

type AnodizingOptionNoteProps = {
  enabled: boolean;
  className?: string;
};

/** 설정 대화상자처럼 선택을 연 뒤에만 둔다. */
export function AnodizingOptionNote({
  enabled,
  className,
}: AnodizingOptionNoteProps) {
  return (
    <p className={cn("text-xs leading-relaxed text-slate-500", className)}>
      <AnodizingOptionCopy enabled={enabled} />
    </p>
  );
}

/** On·Off 문구를 겹쳐 두어 팝오버 높이가 호버마다 줄지 않게 한다. */
export function anodizingPopoverNote(value: string): ReactNode {
  const on = value === "on";
  return (
    <span className="grid">
      <span
        className={cn("col-start-1 row-start-1", !on && "invisible")}
        aria-hidden={!on}
      >
        <AnodizingOptionCopy enabled />
      </span>
      <span
        className={cn("col-start-1 row-start-1", on && "invisible")}
        aria-hidden={on}
      >
        <AnodizingOptionCopy enabled={false} />
      </span>
    </span>
  );
}

type AnodizingRequestOptionProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
  name?: string;
};

/** 의뢰 작성 — 아노다이징 On(기본) / Off. 안내는 팝오버 안. */
export function AnodizingRequestOption({
  enabled,
  onChange,
  disabled = false,
  className,
}: AnodizingRequestOptionProps) {
  return (
    <CaseOptionPopoverButton
      className={cn("h-8 px-2.5 text-xs", className)}
      icon={
        <Droplets
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            enabled ? "text-sky-600" : "opacity-50",
          )}
        />
      }
      label={enabled ? "아노다이징 On" : "아노다이징 Off"}
      value={enabled ? "on" : "off"}
      options={[
        { value: "on", label: "아노다이징 On" },
        { value: "off", label: "아노다이징 Off" },
      ]}
      disabled={disabled}
      optionNote={anodizingPopoverNote}
      onChange={(next) => onChange(next === "on")}
    />
  );
}
