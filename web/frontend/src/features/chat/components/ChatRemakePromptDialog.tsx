// - 2026-09-12: 기공소(actor=lab) — 치과도착일 read-only.
// - 2026-09-12: 리메이크 기본 도착일=오늘+원본 리드 · 주문일(오늘) 표시.
// - 2026-09-12: 와이드 모달·8열 치아 타일·안내 툴팁화.
// - 2026-09-12: ConfirmDialog showCloseButton · closeOnBackdrop.
// - 2026-09-11: intent=abutment_remake — 가공 후 선택 치아 리메이크 의뢰(기본 미선택·어벗 라벨).
// related files:
// - web/frontend/src/features/chat/components/chatRemake.ts
// - web/frontend/src/features/chat/components/chatRemakeParts.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/usePracticeTransferFeeQuote.ts

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Check, CircleHelp, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  listRemakePartOptions,
  selectedKeysToRemakeParts,
  buildToothWorksFromRemakeSelection,
  summarizeRemakeSelection,
  type RemakePartOption,
  type RemakeSelectedPart,
} from "@/features/chat/components/chatRemakeParts";
import { toKstYmd, kstAddCivilDays, kstYmdDiffDays } from "@/shared/date/kst";
import {
  formatManWon,
  formatWon,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  LAB_FEE_CUSTOM_ABUTMENT_REMAKE_DEFAULT_PRICE,
  LAB_FEE_REMAKE_FREE,
} from "@/shared/practice/labFeeSchedule";
import { DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS } from "@/shared/practice/labArrivalDefaults";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import { cn } from "@/shared/ui/cn";

/** 리메이크 기본 도착일 = 오늘 + 원본(주문→도착) 일수. 없으면 계정 기본 오프셋. */
export function resolveRemakeDefaultArrivalYmd(input: {
  todayYmd: string;
  sourceOrderYmd?: string | null;
  sourceArrivalYmd?: string | null;
  fallbackOffsetDays?: number;
}): string {
  const today = String(input.todayYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return "";
  const lead = kstYmdDiffDays(input.sourceOrderYmd, input.sourceArrivalYmd);
  const fallback = Math.max(
    0,
    Math.floor(
      Number(
        input.fallbackOffsetDays ?? DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      ) || 0,
    ),
  );
  const offset = lead != null && lead > 0 ? lead : fallback;
  const next = kstAddCivilDays(today, offset) || today;
  return next < today ? today : next;
}

export type ChatRemakePromptResult =
  | { kind: "skip" }
  | {
      kind: "remake";
      arrivalYmd: string;
      includeCustomAbutment: boolean;
      selectedParts: RemakeSelectedPart[];
      remakeFeeTotal: number;
      summaryLabel: string;
    };

type ChatRemakePromptDialogProps = {
  open: boolean;
  toothWorks?: ToothWorkSelection[] | null;
  labAnchorId?: string | null;
  remakeFeeLabel?: string;
  remakeFeeWithCaLabel?: string;
  busy?: boolean;
  initialStep?: "ask" | "configure";
  variant?: "from_3d" | "meta_only";
  /** 기공소가 기록할 때 안내 문구 조정 */
  actor?: "practice" | "lab";
  /**
   * abutment_remake: 가공 후 STL 취소 불가 → 선택 치아만 새 리메이크 의뢰.
   * 기본 선택은 비움(전부 선택 실수 방지). initialSelectedTeeth가 있으면 해당 CA 사전선택.
   */
  intent?: "chat_record" | "abutment_remake";
  /** abutment_remake — 치아번호로 CA 옵션 사전선택(예: 가공 치아 클릭) */
  initialSelectedTeeth?: string[] | null;
  /** 원본 의뢰 주문일·도착일 → 리메이크 기본 도착일(오늘+리드) 계산 */
  sourceOrderYmd?: string | null;
  sourceArrivalYmd?: string | null;
  onResolve: (result: ChatRemakePromptResult) => void | Promise<void>;
  onCancel: () => void;
};

function HelpTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[min(100vw-2rem,22rem)] space-y-1 text-left text-xs leading-relaxed"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function RemakePartTile({
  opt,
  checked,
  busy,
  subtitle,
  tone,
  onToggle,
}: {
  opt: RemakePartOption;
  checked: boolean;
  busy: boolean;
  subtitle: string;
  tone: "amber" | "sky";
  onToggle: () => void;
}) {
  const selectedTone =
    tone === "sky"
      ? "border-sky-400 bg-sky-50 text-sky-950 ring-1 ring-sky-300/60"
      : "border-amber-400 bg-amber-50 text-amber-950 ring-1 ring-amber-300/60";

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "relative flex h-[3.25rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? selectedTone
          : "border-slate-200/90 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50/80",
      )}
    >
      {checked ? (
        <span
          className={cn(
            "absolute right-1 top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-white",
            tone === "sky" ? "bg-sky-500" : "bg-amber-500",
          )}
          aria-hidden
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : null}
      <span className="text-[13px] font-semibold tabular-nums leading-none">
        #{opt.toothNumber}
      </span>
      <span
        className={cn(
          "max-w-full truncate px-0.5 text-[10px] leading-tight",
          checked ? "opacity-80" : "text-muted-foreground",
        )}
        title={subtitle}
      >
        {subtitle}
      </span>
    </button>
  );
}

function PartSection({
  title,
  options,
  selectedKeys,
  busy,
  tone,
  subtitleFor,
  onToggleKey,
  onSelectAll,
}: {
  title: string;
  options: RemakePartOption[];
  selectedKeys: ReadonlySet<string>;
  busy: boolean;
  tone: "amber" | "sky";
  subtitleFor: (opt: RemakePartOption) => string;
  onToggleKey: (key: string) => void;
  onSelectAll: () => void;
}) {
  if (options.length === 0) return null;
  const allOn = options.every((o) => selectedKeys.has(o.key));

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-center gap-2">
        <h3 className="text-[12px] font-semibold tracking-tight text-slate-700">
          {title}
          <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
            {options.filter((o) => selectedKeys.has(o.key)).length}/
            {options.length}
          </span>
        </h3>
        <button
          type="button"
          className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={onSelectAll}
        >
          {allOn ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {options.map((opt) => (
          <RemakePartTile
            key={opt.key}
            opt={opt}
            checked={selectedKeys.has(opt.key)}
            busy={busy}
            subtitle={subtitleFor(opt)}
            tone={tone}
            onToggle={() => onToggleKey(opt.key)}
          />
        ))}
      </div>
    </section>
  );
}

export function ChatRemakePromptDialog({
  open,
  toothWorks = null,
  labAnchorId = null,
  remakeFeeLabel,
  remakeFeeWithCaLabel,
  busy = false,
  initialStep = "ask",
  variant = "from_3d",
  actor = "practice",
  intent = "chat_record",
  initialSelectedTeeth = null,
  sourceOrderYmd = null,
  sourceArrivalYmd = null,
  onResolve,
  onCancel,
}: ChatRemakePromptDialogProps) {
  const todayYmd = toKstYmd(new Date()) || "";
  const defaultArrivalYmd = useMemo(
    () =>
      resolveRemakeDefaultArrivalYmd({
        todayYmd,
        sourceOrderYmd,
        sourceArrivalYmd,
      }),
    [todayYmd, sourceOrderYmd, sourceArrivalYmd],
  );
  const [step, setStep] = useState<"ask" | "configure">(initialStep);
  const [arrivalYmd, setArrivalYmd] = useState(defaultArrivalYmd || todayYmd);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const isAbutmentRemake = intent === "abutment_remake";

  const partOptions = useMemo(
    () => listRemakePartOptions(toothWorks),
    [toothWorks],
  );
  const prosthesisOptions = useMemo(
    () => partOptions.filter((o) => o.kind === "prosthesis"),
    [partOptions],
  );
  const caOptions = useMemo(
    () => partOptions.filter((o) => o.kind === "ca"),
    [partOptions],
  );

  const initialToothSet = useMemo(() => {
    const set = new Set<string>();
    if (!Array.isArray(initialSelectedTeeth)) return set;
    for (const raw of initialSelectedTeeth) {
      const tooth = String(raw || "").trim();
      if (tooth) set.add(tooth);
    }
    return set;
  }, [initialSelectedTeeth]);

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setArrivalYmd(defaultArrivalYmd || todayYmd);
    setArrivalOpen(false);
    // abutment_remake: 전부 선택 실수 방지(예: 14 제외·15-17만).
    // initialSelectedTeeth가 있으면 해당 CA만 사전선택.
    // chat_record: 보철 전부 선택, CA는 미선택 (기존 정책).
    if (isAbutmentRemake) {
      if (initialToothSet.size > 0) {
        setSelectedKeys(
          new Set(
            partOptions
              .filter(
                (o) => o.kind === "ca" && initialToothSet.has(o.toothNumber),
              )
              .map((o) => o.key),
          ),
        );
      } else {
        setSelectedKeys(new Set());
      }
    } else {
      setSelectedKeys(
        new Set(
          partOptions.filter((o) => o.kind === "prosthesis").map((o) => o.key),
        ),
      );
    }
  }, [
    open,
    initialStep,
    todayYmd,
    defaultArrivalYmd,
    partOptions,
    isAbutmentRemake,
    initialToothSet,
  ]);

  const selectedToothWorks = useMemo(() => {
    const rows = Array.isArray(toothWorks) ? toothWorks : [];
    return buildToothWorksFromRemakeSelection(rows, selectedKeys);
  }, [toothWorks, selectedKeys]);

  const liveQuote = usePracticeTransferFeeQuote({
    enabled: open && step === "configure" && Boolean(labAnchorId),
    labAnchorId,
    toothWorks: selectedToothWorks,
    remake: true,
  });

  const remakeFeeTotal = Math.max(
    0,
    Math.round(
      Number(
        liveQuote.quote?.total ||
          liveQuote.quote?.labFeeTotal ||
          liveQuote.quote?.finalLabFeeTotal ||
          0,
      ),
    ),
  );

  const hasSelectedCa = useMemo(
    () =>
      partOptions.some((o) => o.kind === "ca" && selectedKeys.has(o.key)),
    [partOptions, selectedKeys],
  );

  const caRemakeDefaultLabel = `${LAB_FEE_CUSTOM_ABUTMENT_REMAKE_DEFAULT_PRICE.toLocaleString("ko-KR")}원`;

  const feeText = useMemo(() => {
    if (selectedToothWorks.length === 0) return "—";
    if (liveQuote.contextReady && remakeFeeTotal >= 0) {
      return formatWon(remakeFeeTotal);
    }
    const hasCa = selectedKeysToRemakeParts(partOptions, selectedKeys).some(
      (p) => p.customAbutment,
    );
    if (hasCa && remakeFeeWithCaLabel) return remakeFeeWithCaLabel;
    return remakeFeeLabel || "…";
  }, [
    liveQuote.contextReady,
    remakeFeeLabel,
    remakeFeeTotal,
    remakeFeeWithCaLabel,
    partOptions,
    selectedKeys,
    selectedToothWorks.length,
  ]);

  const canSubmitRemake =
    /^\d{4}-\d{2}-\d{2}$/.test(arrivalYmd) &&
    (!todayYmd || arrivalYmd >= todayYmd) &&
    selectedToothWorks.length > 0 &&
    !busy;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllIn = (keys: string[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  if (!open) return null;

  if (step === "ask") {
    return (
      <ConfirmDialog
        open
        title="이 첨부는 리메이크인가요?"
        description={
          <p className="text-left text-sm text-muted-foreground">
            예 → 범위·도착일 기록 · 아니요 → 채팅 첨부만
          </p>
        }
        confirmLabel="예, 리메이크"
        cancelLabel="아니요"
        confirmTone="primary"
        busy={busy}
        showCloseButton
        closeOnBackdrop
        onConfirm={() => setStep("configure")}
        onCancel={() => {
          if (busy) return;
          void onResolve({ kind: "skip" });
        }}
      />
    );
  }

  const isMetaOnly = variant === "meta_only";
  const isLab = actor === "lab";

  const titleHelp = isAbutmentRemake
    ? "가공이 시작된 어벗은 취소할 수 없습니다. 재제작이 필요한 부위만 선택하세요. 선택하지 않은 치아는 그대로 둡니다."
    : isMetaOnly
      ? "구강 스캔은 3Shape 등으로 보내고, 여기에는 범위·도착일·수가만 기록합니다."
      : isLab
        ? "치과가 리메이크 체크를 빠뜨린 경우 기공소에서 범위를 기록할 수 있습니다."
        : "선택한 보철·어벗만 리메이크 의뢰로 전달됩니다. 작업시작 시 리메이크 기공비가 청구됩니다.";

  const feeHelp =
    LAB_FEE_REMAKE_FREE || isLab || isAbutmentRemake ? (
      <p>치과↔기공소 리메이크비는 무료입니다.</p>
    ) : hasSelectedCa ? (
      <p>
        커스텀어벗 리메이크 수가 미설정 시 개당 {caRemakeDefaultLabel}. 설정 →
        기공비에서 변경할 수 있습니다.
      </p>
    ) : (
      <p>작업시작 시 정산에 반영됩니다.</p>
    );

  return (
    <ConfirmDialog
      open
      title={
        <span className="inline-flex items-center gap-1.5">
          <span>
            {isAbutmentRemake
              ? "리메이크 부위 선택"
              : isLab
                ? "리메이크 범위 기록"
                : isMetaOnly
                  ? "리메이크 내역 전달"
                  : "리메이크 범위 선택"}
          </span>
          <HelpTip label="도움말">
            <p>{titleHelp}</p>
          </HelpTip>
        </span>
      }
      panelClassName="max-w-[52rem]"
      dense
      showCloseButton
      closeOnBackdrop
      description={
        <div className="space-y-3.5 text-left">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">주문일</span>
                <span className="tabular-nums font-semibold text-slate-800">
                  {todayYmd || "—"}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[12px]">
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  치과도착일
                  {isLab ? (
                    <HelpTip label="치과도착일 안내">
                      <p>치과도착일은 치과가 지정합니다. 기공소에서는 변경할 수 없습니다.</p>
                    </HelpTip>
                  ) : null}
                </span>
                {isLab ? (
                  <span className="tabular-nums font-semibold text-slate-800">
                    {arrivalYmd || "—"}
                  </span>
                ) : (
                  <Popover open={arrivalOpen} onOpenChange={setArrivalOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 min-w-[8.5rem] justify-start px-2.5 text-[13px] font-medium tabular-nums",
                          arrivalYmd ? "text-slate-900" : "text-muted-foreground",
                        )}
                        disabled={busy}
                      >
                        {arrivalYmd || "날짜 선택"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto p-0"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <Calendar
                        mode="single"
                        required
                        numberOfMonths={1}
                        selected={
                          arrivalYmd
                            ? new Date(`${arrivalYmd}T12:00:00+09:00`)
                            : undefined
                        }
                        onSelect={(date) => {
                          const ymd = toKstYmd(date) || "";
                          if (!ymd) return;
                          setArrivalYmd(ymd);
                          setArrivalOpen(false);
                        }}
                        disabled={(date) => {
                          const ymd = toKstYmd(date) || "";
                          if (!ymd) return true;
                          return Boolean(todayYmd && ymd < todayYmd);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50/50 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900/80">
                <Repeat className="h-3.5 w-3.5 text-amber-700" />
                리메이크비
                <HelpTip label="리메이크비 안내">{feeHelp}</HelpTip>
              </span>
              <span className="text-[14px] font-semibold tabular-nums tracking-tight text-amber-950">
                {feeText}
              </span>
              {remakeFeeTotal > 0 && liveQuote.contextReady ? (
                <span className="text-[10px] tabular-nums text-amber-800/70">
                  ≈{formatManWon(remakeFeeTotal)}
                </span>
              ) : null}
            </div>
          </div>

          <PartSection
            title="보철"
            options={prosthesisOptions}
            selectedKeys={selectedKeys}
            busy={busy}
            tone="amber"
            subtitleFor={(o) => o.prosthesisType}
            onToggleKey={toggleKey}
            onSelectAll={() =>
              selectAllIn(prosthesisOptions.map((o) => o.key))
            }
          />

          <PartSection
            title={isAbutmentRemake ? "어벗" : "커스텀어벗"}
            options={caOptions}
            selectedKeys={selectedKeys}
            busy={busy}
            tone="sky"
            subtitleFor={() => (isAbutmentRemake ? "어벗" : "CA")}
            onToggleKey={toggleKey}
            onSelectAll={() => selectAllIn(caOptions.map((o) => o.key))}
          />

          {partOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-muted-foreground">
              선택할 보철·어벗이 없습니다.
            </p>
          ) : null}
        </div>
      }
      confirmLabel={
        busy
          ? "전송 중..."
          : isAbutmentRemake
            ? selectedToothWorks.length > 0
              ? `${selectedToothWorks.length}부위 리메이크 의뢰`
              : "리메이크 의뢰"
            : isLab
              ? "리메이크 기록"
              : "리메이크 전달"
      }
      cancelLabel={initialStep === "ask" ? "뒤로" : "취소"}
      confirmTone="primary"
      busy={busy}
      confirmDisabled={!canSubmitRemake && !busy}
      onConfirm={() => {
        if (!canSubmitRemake) return;
        const parts = selectedKeysToRemakeParts(partOptions, selectedKeys);
        void onResolve({
          kind: "remake",
          arrivalYmd,
          includeCustomAbutment: parts.some((p) => p.customAbutment),
          selectedParts: parts,
          remakeFeeTotal,
          summaryLabel: summarizeRemakeSelection(partOptions, selectedKeys),
        });
      }}
      onCancel={() => {
        if (busy) return;
        if (initialStep === "ask") {
          setStep("ask");
          return;
        }
        onCancel();
      }}
    />
  );
}
