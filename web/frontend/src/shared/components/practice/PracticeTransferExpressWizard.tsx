import { useEffect, useMemo, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferFilePane,
  type PracticeTransferFilePaneProps,
} from "@/shared/components/practice/PracticeTransferFilePane";
import {
  PracticeTransferRequestIntakePanel,
  type PracticeTransferRequestIntakePanelProps,
} from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import {
  ABUTS_PINNED_LAB_NAME,
  getBusinessLabel,
  isAutoMatchLab,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { cn } from "@/shared/ui/cn";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";
import { PRACTICE_CA_DIRECT_SHIP_NOTE } from "@/shared/practice/practiceWorkPeriod";

// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
// - web/frontend/src/shared/workspace/workspaceMode.ts
// - 2026-08-15: 기공의뢰 익스프레스 모드 — 한 화면 한 질문 위저드.
// - 2026-08-15: Enter로 다음 단계(마지막은 전송). 메모 textarea·팝오버는 제외.
// - 2026-08-15: 상단 1~6 단계 버튼은 언제든 바로가기.
// - 2026-08-15: 스텝(좌)·진행률(우) 한 줄. 체크는 지나온+완료 단계만.
// - 2026-08-15: 체크는 실제 방문 단계만. 새로 작성 시 방문·파일 캐시 리셋.
// - 2026-08-15: 스텝·진행률은 카드 헤더(제목 오른쪽)로 이동.
// - 2026-08-15: 체크 표시는 일정 기본값·빈 파일을 제외(게이트와 분리).
// - 2026-08-18: Express 보철물도 Expert와 같이 full 치식(16칸).
// - 2026-08-19: 일정 스텝 — 출고=도착−2영업일, 지정 도착일 1영업일 전 배송 목표.

export type PracticeTransferExpressStepId =
  | "lab"
  | "patient"
  | "schedule"
  | "prosthesis"
  | "files"
  | "confirm";

export const PRACTICE_TRANSFER_EXPRESS_STEPS: Array<{
  id: PracticeTransferExpressStepId;
  title: string;
  hint: string;
}> = [
  {
    id: "lab",
    title: "어디로 보낼까요?",
    hint: "자주 쓰는 기공소나 어벗츠기공소를 선택하세요.",
  },
  {
    id: "patient",
    title: "환자 이름은 무엇인가요?",
    hint: "의뢰서에 표시되는 환자명입니다.",
  },
  {
    id: "schedule",
    title: "언제 치과에 도착하면 될까요?",
    hint: `주문일은 오늘로 고정됩니다. 도착일만 고르면 됩니다. ${PRACTICE_CA_DIRECT_SHIP_NOTE}`,
  },
  {
    id: "prosthesis",
    title: "어떤 보철인가요?",
    hint: "치아를 선택한 뒤 형태를 고르세요. 커스텀어벗은 설정 창이 열립니다.",
  },
  {
    id: "files",
    title: "파일을 첨부할까요?",
    hint: "구강스캔 등이 있으면 여기에 올립니다.",
  },
  {
    id: "confirm",
    title: "확인하고 전송할까요?",
    hint: "메모는 선택 사항입니다. 맞으면 전송을 눌러 주세요.",
  },
];

export const normalizeExpressStepId = (
  raw: unknown,
): PracticeTransferExpressStepId | null => {
  const value = String(raw || "").trim();
  if (
    PRACTICE_TRANSFER_EXPRESS_STEPS.some((step) => step.id === value)
  ) {
    return value as PracticeTransferExpressStepId;
  }
  return null;
};

export type PracticeTransferExpressSummary = {
  labLabel: string;
  patientName: string;
  orderDate: string;
  arrivalDate: string;
  toothCount: number;
  fileCount: number;
};

type PracticeTransferExpressWizardProps = {
  stepId: PracticeTransferExpressStepId;
  onStepIdChange: (next: PracticeTransferExpressStepId) => void;
  requestIntakeProps: PracticeTransferRequestIntakePanelProps;
  filePaneProps: PracticeTransferFilePaneProps;
  summary: PracticeTransferExpressSummary;
  canProceed: boolean;
  proceedBlockedReason?: string;
  oralScanRequired: boolean;
  skipDesignConfirm: boolean;
  onSkipDesignConfirmChange: (next: boolean) => void;
  onOpenSkipDesignConfirmUncheck: () => void;
  onSubmit: () => void;
  submitting: boolean;
  canSubmit: boolean;
  missingRequiredFields: string[];
  submitLabel?: string;
  submittingLabel?: string;
};

const stepIndexOf = (id: PracticeTransferExpressStepId) =>
  PRACTICE_TRANSFER_EXPRESS_STEPS.findIndex((step) => step.id === id);

export function PracticeTransferExpressStepProgress({
  stepId,
  onStepIdChange,
  stepOkById,
  className,
}: {
  stepId: PracticeTransferExpressStepId;
  onStepIdChange: (next: PracticeTransferExpressStepId) => void;
  /** 체크 표시용. 일정 기본값·빈 파일은 false로 넘긴다(게이트 ok와 별개). */
  stepOkById?: Partial<Record<PracticeTransferExpressStepId, boolean>>;
  className?: string;
}) {
  const stepIndex = Math.max(0, stepIndexOf(stepId));
  const progressPercent = Math.round(
    ((stepIndex + 1) / PRACTICE_TRANSFER_EXPRESS_STEPS.length) * 100,
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {PRACTICE_TRANSFER_EXPRESS_STEPS.map((step, index) => {
          const current = index === stepIndex;
          // 지나온 단계 중, 의미 있는 입력이 있을 때만 체크(일정 기본·빈 파일 제외)
          const done = index < stepIndex && Boolean(stepOkById?.[step.id]);
          return (
            <button
              key={step.id}
              type="button"
              className={cn(
                "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors cursor-pointer",
                done && "bg-primary-soft text-primary-strong hover:bg-primary-soft/80",
                current && "bg-primary-strong text-white",
                !done && !current && "bg-muted text-foreground hover:bg-muted/80",
              )}
              onClick={() => {
                if (current) return;
                onStepIdChange(step.id);
              }}
              aria-current={current ? "step" : undefined}
              aria-label={`${index + 1}단계 ${step.title}로 이동`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </button>
          );
        })}
      </div>
      <div className="flex w-28 shrink-0 items-center gap-2 sm:w-36">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary-strong transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {stepIndex + 1}/{PRACTICE_TRANSFER_EXPRESS_STEPS.length}
        </span>
      </div>
    </div>
  );
}

export function PracticeTransferExpressWizard({
  stepId,
  onStepIdChange,
  requestIntakeProps,
  filePaneProps,
  summary,
  canProceed,
  proceedBlockedReason,
  oralScanRequired,
  skipDesignConfirm,
  onSkipDesignConfirmChange,
  onOpenSkipDesignConfirmUncheck,
  onSubmit,
  submitting,
  canSubmit,
  missingRequiredFields,
  submitLabel = "기공소로 전송",
  submittingLabel = "전송 중…",
}: PracticeTransferExpressWizardProps) {
  const stepIndex = Math.max(0, stepIndexOf(stepId));
  const stepMeta = PRACTICE_TRANSFER_EXPRESS_STEPS[stepIndex];
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= PRACTICE_TRANSFER_EXPRESS_STEPS.length - 1;

  const filesHint = oralScanRequired
    ? "구강스캔 첨부가 필수입니다."
    : stepMeta.hint;

  const stepIntakeProps = useMemo((): PracticeTransferRequestIntakePanelProps => {
    const base = {
      ...requestIntakeProps,
      variant: "plain" as const,
      hideEnlargeButton: true,
      toothChartDisplayMode: "full" as const,
      showFeeEstimate: stepId === "prosthesis" || stepId === "confirm",
    };
    switch (stepId) {
      case "lab":
        return {
          ...base,
          showHeaderFields: true,
          showLabField: true,
          showPatientField: false,
          showDateFields: false,
          showProsthesisSection: false,
          showMemoSection: false,
        };
      case "patient":
        return {
          ...base,
          showHeaderFields: true,
          showLabField: false,
          showPatientField: true,
          showDateFields: false,
          showProsthesisSection: false,
          showMemoSection: false,
        };
      case "schedule":
        return {
          ...base,
          showHeaderFields: true,
          showLabField: false,
          showPatientField: false,
          showDateFields: true,
          showProsthesisSection: false,
          showMemoSection: false,
        };
      case "prosthesis":
        return {
          ...base,
          showHeaderFields: false,
          showLabField: false,
          showPatientField: false,
          showDateFields: false,
          showProsthesisSection: true,
          showMemoSection: false,
        };
      case "confirm":
        return {
          ...base,
          showHeaderFields: false,
          showLabField: false,
          showPatientField: false,
          showDateFields: false,
          showProsthesisSection: false,
          showMemoSection: true,
        };
      default:
        return {
          ...base,
          showHeaderFields: false,
          showLabField: false,
          showPatientField: false,
          showDateFields: false,
          showProsthesisSection: false,
          showMemoSection: false,
        };
    }
  }, [requestIntakeProps, stepId]);

  const goPrev = () => {
    if (isFirst) return;
    onStepIdChange(PRACTICE_TRANSFER_EXPRESS_STEPS[stepIndex - 1].id);
  };

  const goNext = () => {
    if (isLast || !canProceed) return;
    onStepIdChange(PRACTICE_TRANSFER_EXPRESS_STEPS[stepIndex + 1].id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (event.defaultPrevented) return;
      if (event.isComposing || event.keyCode === 229) return;
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // 메모 줄바꿈·제안 수락 등은 필드 onKeyDown이 처리(defaultPrevented)
      if (target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // 기공소 검색·날짜·커스텀어벗 모달 등 열린 오버레이는 기존 Enter 유지
      if (
        target.closest('[role="listbox"]') ||
        target.closest('[role="dialog"]') ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest("[data-radix-menu-content]")
      ) {
        return;
      }

      // 이전/단계 버튼 등은 네이티브 클릭. 기공소 콤보(닫힘)만 Enter=다음
      const comboboxTrigger = target.closest('[role="combobox"]');
      if (target.closest("button, [role='button'], a")) {
        if (!comboboxTrigger) return;
        if (isLast ? submitting || !canSubmit : !canProceed) return;
        event.preventDefault();
        if (isLast) onSubmit();
        else onStepIdChange(PRACTICE_TRANSFER_EXPRESS_STEPS[stepIndex + 1].id);
        return;
      }

      if (isLast) {
        if (submitting || !canSubmit) return;
        event.preventDefault();
        onSubmit();
        return;
      }

      if (!canProceed) return;
      event.preventDefault();
      onStepIdChange(PRACTICE_TRANSFER_EXPRESS_STEPS[stepIndex + 1].id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canProceed,
    canSubmit,
    isLast,
    onStepIdChange,
    onSubmit,
    stepIndex,
    submitting,
  ]);

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {stepMeta.title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {stepId === "files" ? filesHint : stepMeta.hint}
        </p>
      </div>

      <div className="min-h-[12rem]">
        {stepId === "files" ? (
          <PracticeTransferFilePane {...filePaneProps} />
        ) : (
          <>
            {stepId === "confirm" ? (
              <div className="mb-6 w-full max-w-sm space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm">
                <SummaryRow label="기공소" value={summary.labLabel || "-"} />
                <SummaryRow label="환자" value={summary.patientName || "-"} />
                <SummaryRow
                  label="일정"
                  value={
                    summary.orderDate && summary.arrivalDate ? (
                      <PracticeWorkPeriodText
                        orderDate={summary.orderDate}
                        arrivalDate={summary.arrivalDate}
                        variant="orderArrival"
                        className="text-sm"
                      />
                    ) : (
                      "-"
                    )
                  }
                />
                <SummaryRow label="보철" value={`${summary.toothCount}개 치아`} />
                <SummaryRow label="파일" value={`${summary.fileCount}개`} />
              </div>
            ) : null}
            <PracticeTransferRequestIntakePanel {...stepIntakeProps} />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-1.5"
          onClick={goPrev}
          disabled={isFirst || submitting}
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </Button>

        {isLast ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  htmlFor="practice-express-skip-design-confirm"
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 select-none"
                >
                  <Checkbox
                    id="practice-express-skip-design-confirm"
                    checked={skipDesignConfirm}
                    onCheckedChange={(value) => {
                      if (value === true) {
                        onSkipDesignConfirmChange(true);
                        return;
                      }
                      onOpenSkipDesignConfirmUncheck();
                    }}
                    disabled={submitting}
                  />
                  <span>디자인 컨펌 생략</span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                <p>
                  커스텀어벗은 어벗츠가 디자인한 뒤 기공소가 확인하면 생산합니다.
                  체크를 해제하면 치과도 디자인을 컨펌해야 생산이 시작되어 일정이
                  늦어질 수 있습니다.
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    className="h-10 gap-1.5 bg-primary-strong text-white hover:bg-primary-strong disabled:pointer-events-none disabled:opacity-40"
                    onClick={onSubmit}
                    disabled={submitting || !canSubmit}
                  >
                    {submitting ? submittingLabel : submitLabel}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-sm">
                {submitting ? (
                  <p>{submittingLabel}</p>
                ) : canSubmit ? (
                  <p className="text-primary-strong">
                    {submitLabel === "기공소로 전송" ? "전송 가능" : "수정 저장 가능"}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {missingRequiredFields.map((field) => (
                      <li key={field} className="font-semibold text-accent-strong">
                        {field} · 필요
                      </li>
                    ))}
                  </ul>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  className="h-10 gap-1.5 bg-primary-strong text-white hover:bg-primary-strong disabled:pointer-events-none disabled:opacity-40"
                  onClick={goNext}
                  disabled={!canProceed}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            {!canProceed && proceedBlockedReason ? (
              <TooltipContent side="top" className="max-w-xs text-sm">
                {proceedBlockedReason}
              </TooltipContent>
            ) : null}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function PracticeTransferExpressDonePanel({
  onStartNew,
  onViewRecent,
}: {
  onStartNew: () => void;
  onViewRecent: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
          <CircleCheck className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            전송이 완료되었습니다
          </h2>
          <p className="text-sm text-muted-foreground">
            방금 보낸 의뢰는 「최근 의뢰」에서 확인할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="h-10 bg-primary-strong text-white hover:bg-primary-strong"
          onClick={onViewRecent}
        >
          최근 의뢰 보기
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={onStartNew}>
          새 의뢰 작성
        </Button>
      </div>
    </div>
  );
}

export function resolveExpressLabLabel(
  selectedLab: PracticeTransferRequestIntakePanelProps["selectedLab"],
): string {
  if (!selectedLab) return "";
  if (isAutoMatchLab(selectedLab)) return ABUTS_PINNED_LAB_NAME;
  return getBusinessLabel(selectedLab);
}
