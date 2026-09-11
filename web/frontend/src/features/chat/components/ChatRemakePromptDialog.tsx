// - 2026-09-11: intent=abutment_remake — 가공 후 선택 치아 리메이크 의뢰(기본 미선택·어벗 라벨).
// related files:
// - web/frontend/src/features/chat/components/chatRemake.ts
// - web/frontend/src/features/chat/components/chatRemakeParts.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/usePracticeTransferFeeQuote.ts

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { LAB_FEE_SETTINGS_PATH } from "@/features/settings/LabFeeSetupPrompt";
import {
  listRemakePartOptions,
  selectedKeysToRemakeParts,
  buildToothWorksFromRemakeSelection,
  type RemakeSelectedPart,
} from "@/features/chat/components/chatRemakeParts";
import { toKstYmd } from "@/shared/date/kst";
import {
  formatManWon,
  formatWon,
} from "@/shared/practice/practiceTransferFeeQuote";
import { LAB_FEE_CUSTOM_ABUTMENT_REMAKE_DEFAULT_PRICE } from "@/shared/practice/labFeeSchedule";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import { cn } from "@/shared/ui/cn";

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
   * 기본 선택은 비움(전부 선택 실수 방지).
   */
  intent?: "chat_record" | "abutment_remake";
  onResolve: (result: ChatRemakePromptResult) => void | Promise<void>;
  onCancel: () => void;
};

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
  onResolve,
  onCancel,
}: ChatRemakePromptDialogProps) {
  const todayYmd = toKstYmd(new Date()) || "";
  const [step, setStep] = useState<"ask" | "configure">(initialStep);
  const [arrivalYmd, setArrivalYmd] = useState(todayYmd);
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

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setArrivalYmd(todayYmd);
    setArrivalOpen(false);
    // abutment_remake: 전부 선택 실수 방지(예: 14 제외·15-17만).
    // chat_record: 보철 전부 선택, CA는 미선택 (기존 정책).
    if (isAbutmentRemake) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(
        new Set(
          partOptions.filter((o) => o.kind === "prosthesis").map((o) => o.key),
        ),
      );
    }
  }, [open, initialStep, todayYmd, partOptions, isAbutmentRemake]);

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
    if (selectedToothWorks.length === 0) return "선택 없음";
    if (liveQuote.contextReady && remakeFeeTotal >= 0) {
      return formatWon(remakeFeeTotal);
    }
    const hasCa = selectedKeysToRemakeParts(partOptions, selectedKeys).some(
      (p) => p.customAbutment,
    );
    if (hasCa && remakeFeeWithCaLabel) return remakeFeeWithCaLabel;
    return remakeFeeLabel || "견적 계산 중…";
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
          <div className="space-y-2 text-left text-sm">
            <p>
              리메이크이면 범위·도착일을 선택한 뒤 기공의뢰로 기록·과금됩니다.
              아니면 채팅 첨부만 전송합니다.
            </p>
          </div>
        }
        confirmLabel="예, 리메이크"
        cancelLabel="아니요"
        confirmTone="primary"
        busy={busy}
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

  return (
    <ConfirmDialog
      open
      title={
        isAbutmentRemake
          ? "리메이크할 부위를 선택하세요"
          : isLab
            ? "리메이크 범위를 기록할까요?"
            : isMetaOnly
              ? "리메이크 내역을 전달할까요?"
              : "리메이크 범위를 선택하세요"
      }
      panelClassName="max-w-lg"
      description={
        <div className="space-y-4 text-left text-sm">
          <p className="text-[13px] leading-snug text-slate-600">
            {isAbutmentRemake
              ? "제조 가공이 시작된 어벗은 취소할 수 없습니다. 재제작이 필요한 보철·어벗만 골라 새 리메이크 의뢰를 만듭니다. 선택하지 않은 치아(예: 14 크라운·어벗)는 그대로 둡니다."
              : isMetaOnly
                ? "구강 스캔은 3Shape Communicate 등으로 보내고, 여기에는 리메이크 범위·도착일·수가만 기록합니다."
                : isLab
                  ? "치과가 리메이크 체크를 빠뜨린 경우, 기공소에서 범위를 지정해 기록할 수 있습니다."
                  : "리메이크할 보철·커스텀어벗을 선택한 뒤 전달합니다. 작업시작 시 리메이크 기공비가 청구됩니다."}
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
              <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
              치과도착일
            </div>
            <Popover open={arrivalOpen} onOpenChange={setArrivalOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-10 w-full justify-start font-medium",
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
          </div>

          {prosthesisOptions.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-slate-800">보철</h3>
                <button
                  type="button"
                  className="text-[12px] font-medium text-primary hover:underline"
                  disabled={busy}
                  onClick={() =>
                    selectAllIn(prosthesisOptions.map((o) => o.key))
                  }
                >
                  {prosthesisOptions.every((o) => selectedKeys.has(o.key))
                    ? "전체 해제"
                    : "전체 선택"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {prosthesisOptions.map((opt) => {
                  const checked = selectedKeys.has(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                        checked
                          ? "border-amber-300 bg-amber-50/90 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleKey(opt.key)}
                        className="mt-0.5"
                        disabled={busy}
                      />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block text-[13px] font-semibold tabular-nums text-slate-900">
                          #{opt.toothNumber}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {opt.prosthesisType}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}

          {caOptions.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-slate-800">
                  {isAbutmentRemake ? "어벗" : "커스텀어벗"}
                </h3>
                <button
                  type="button"
                  className="text-[12px] font-medium text-primary hover:underline"
                  disabled={busy}
                  onClick={() => selectAllIn(caOptions.map((o) => o.key))}
                >
                  {caOptions.every((o) => selectedKeys.has(o.key))
                    ? "전체 해제"
                    : "전체 선택"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {caOptions.map((opt) => {
                  const checked = selectedKeys.has(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                        checked
                          ? "border-sky-300 bg-sky-50/90 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleKey(opt.key)}
                        className="mt-0.5"
                        disabled={busy}
                      />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block text-[13px] font-semibold tabular-nums text-slate-900">
                          #{opt.toothNumber}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {isAbutmentRemake ? "어벗" : "커스텀어벗"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}

          {partOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-muted-foreground">
              선택할 보철·어벗이 없습니다.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/60 px-3.5 py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-amber-950">
              <Repeat className="h-4 w-4 text-amber-700" />
              리메이크비
            </div>
            <div className="text-right">
              <div className="text-[15px] font-semibold tabular-nums text-amber-950">
                {feeText}
              </div>
              {remakeFeeTotal > 0 && liveQuote.contextReady ? (
                <div className="text-[11px] text-amber-800/80">
                  ≈ {formatManWon(remakeFeeTotal)}
                </div>
              ) : null}
            </div>
          </div>
          {hasSelectedCa ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-[11px] leading-snug text-amber-950/90">
              {isLab || isAbutmentRemake ? (
                <>
                  어벗 리메이크 수가가 미설정이면 개당 {caRemakeDefaultLabel}이
                  적용됩니다.{" "}
                  <Link
                    to={LAB_FEE_SETTINGS_PATH}
                    className="font-medium text-amber-900 underline underline-offset-2"
                  >
                    설정 → 기공비
                  </Link>
                  에서 변경할 수 있습니다.
                </>
              ) : (
                <>
                  커스텀어벗 리메이크 수가가 기공소에 미설정이면 개당{" "}
                  {caRemakeDefaultLabel}이 적용됩니다. 기공소는 설정 → 기공비에서
                  변경할 수 있습니다.
                </>
              )}
            </p>
          ) : null}
          <p className="text-[11px] leading-snug text-muted-foreground">
            {isAbutmentRemake
              ? "새 리메이크 의뢰가 생성됩니다. 작업시작 후 선택한 어벗 STL만 다시 올리면 됩니다."
              : "작업시작 시 정산(GL)에 반영되며, 채팅에도 내역이 남습니다."}
          </p>
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
        const labels = partOptions
          .filter((o) => selectedKeys.has(o.key))
          .map((o) =>
            isAbutmentRemake && o.kind === "ca"
              ? `${o.toothNumber || "—"} · 어벗`
              : o.label,
          );
        void onResolve({
          kind: "remake",
          arrivalYmd,
          includeCustomAbutment: parts.some((p) => p.customAbutment),
          selectedParts: parts,
          remakeFeeTotal,
          summaryLabel: labels.join(", "),
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
