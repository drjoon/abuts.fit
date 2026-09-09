// related files:
// - web/frontend/src/features/chat/components/chatRemakeParts.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/usePracticeTransferFeeQuote.ts
// - web/backend/services/practiceTransferRemakeCharge.service.js
// - 2026-09-10: 표시 라벨 「어벗」·dense 레이아웃(세로 스크롤 최소화).
// - 2026-09-10: X·바깥클릭 닫기. 가로 3.5칸+스크롤. 기공비 안내 상시.
// - 2026-09-10: 보철+CA 선택·부위별 리메이크비. 수동 청구에 CA 포함.
// - 2026-09-09: 청구됨 잠금·미청구 기본선택·접힘 이력·합계 바.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { LAB_FEE_SETTINGS_PATH } from "@/features/settings/LabFeeSetupPrompt";
import {
  listRemakePartOptions,
  selectedKeysToRemakeParts,
  buildToothWorksFromRemakeSelection,
  collectChargedRemakePartKeys,
  remakeChargeSourceLabel,
  type RemakePartOption,
} from "@/features/chat/components/chatRemakeParts";
import {
  formatManWon,
  formatWon,
} from "@/shared/practice/practiceTransferFeeQuote";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import {
  LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
  LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
} from "@/shared/practice/labFeeSchedule";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import { cn } from "@/shared/ui/cn";

export type LabRemakeChargeResult = {
  selectedParts: ReturnType<typeof selectedKeysToRemakeParts>;
  remakeFeeTotal: number;
  summaryLabel: string;
};

type RemakeChargeHistoryRow = {
  chargedAt?: string | Date | null;
  source?: string;
  summaryLabel?: string;
  toothNumbers?: string[];
  selectedParts?: unknown;
  billingDelta?: { total?: number; labFeeTotal?: number } | null;
};

type LabRemakeChargeDialogProps = {
  open: boolean;
  toothWorks?: ToothWorkSelection[] | null;
  labAnchorId?: string | null;
  /** 현재 의뢰건 청구/견적 요약 */
  feeQuote?: PracticeTransferFeeQuote | null;
  remakeCharges?: RemakeChargeHistoryRow[] | null;
  busy?: boolean;
  onConfirm: (result: LabRemakeChargeResult) => void | Promise<void>;
  onCancel: () => void;
};

const formatChargeAt = (raw?: string | Date | null) => {
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isCaFeeLineType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  return (
    raw === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME ||
    raw === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME ||
    raw.includes("커스텀어벗")
  );
};

function PartTile({
  opt,
  selected,
  charged,
  busy,
  fee,
  feeReady,
  onToggle,
}: {
  opt: RemakePartOption;
  selected: boolean;
  charged: boolean;
  busy: boolean;
  fee: number;
  feeReady: boolean;
  onToggle: () => void;
}) {
  const selectedTone =
    opt.kind === "ca"
      ? "border-sky-300 bg-sky-50/70 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.35)]"
      : "border-amber-300 bg-amber-50/70 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)]";

  return (
    <label
      className={cn(
        "relative flex w-[8.5rem] shrink-0 items-start gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
        charged
          ? "cursor-not-allowed border-slate-200/80 bg-slate-50/90 opacity-70"
          : selected
            ? `cursor-pointer ${selectedTone}`
            : "cursor-pointer border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <Checkbox
        checked={charged || selected}
        onCheckedChange={() => {
          if (charged || busy) return;
          onToggle();
        }}
        className="mt-0.5"
        disabled={busy || charged}
      />
      <span className="min-w-0 flex-1 text-[11px] leading-tight">
        <span className="flex items-center gap-1">
          <span className="font-semibold tabular-nums text-slate-900">
            #{opt.toothNumber}
          </span>
          {charged ? (
            <span className="rounded bg-slate-200/80 px-1 py-px text-[9px] font-medium text-slate-600">
              청구됨
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-1.5">
          <span className="min-w-0 truncate text-muted-foreground">
            {opt.kind === "ca" ? "어벗" : opt.prosthesisType}
          </span>
          <span
            className={cn(
              "shrink-0 tabular-nums text-[10px] font-medium",
              feeReady && fee > 0
                ? "text-slate-800"
                : "text-muted-foreground",
            )}
          >
            {!feeReady ? "…" : fee > 0 ? formatWon(fee) : "0원"}
          </span>
        </span>
      </span>
    </label>
  );
}

function PartGroup({
  title,
  options,
  selectable,
  activeSelectedKeys,
  chargedKeys,
  feeByKey,
  feeReady,
  busy,
  onToggleKey,
  onToggleGroup,
}: {
  title: string;
  options: RemakePartOption[];
  selectable: RemakePartOption[];
  activeSelectedKeys: ReadonlySet<string>;
  chargedKeys: ReadonlySet<string>;
  feeByKey: ReadonlyMap<string, number>;
  feeReady: boolean;
  busy: boolean;
  onToggleKey: (key: string) => void;
  onToggleGroup: (group: RemakePartOption[], allOn: boolean) => void;
}) {
  if (options.length === 0) return null;
  const allOn =
    selectable.length > 0 &&
    selectable.every((o) => activeSelectedKeys.has(o.key));

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-slate-800">{title}</p>
        {selectable.length > 0 ? (
          <button
            type="button"
            className="text-[11px] text-primary"
            disabled={busy}
            onClick={() => onToggleGroup(selectable, allOn)}
          >
            {allOn ? "전체 해제" : "전체 선택"}
          </button>
        ) : null}
      </div>
      <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
        {options.map((opt) => (
          <PartTile
            key={opt.key}
            opt={opt}
            selected={activeSelectedKeys.has(opt.key)}
            charged={chargedKeys.has(opt.key)}
            busy={busy}
            fee={feeByKey.get(opt.key) || 0}
            feeReady={feeReady}
            onToggle={() => onToggleKey(opt.key)}
          />
        ))}
      </div>
    </section>
  );
}

export function LabRemakeChargeDialog({
  open,
  toothWorks = null,
  labAnchorId = null,
  feeQuote = null,
  remakeCharges = null,
  busy = false,
  onConfirm,
  onCancel,
}: LabRemakeChargeDialogProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [historyOpen, setHistoryOpen] = useState(false);

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
  const chargedKeys = useMemo(
    () => collectChargedRemakePartKeys(remakeCharges),
    [remakeCharges],
  );
  const selectableProsthesis = useMemo(
    () => prosthesisOptions.filter((o) => !chargedKeys.has(o.key)),
    [prosthesisOptions, chargedKeys],
  );
  const selectableCa = useMemo(
    () => caOptions.filter((o) => !chargedKeys.has(o.key)),
    [caOptions, chargedKeys],
  );

  useEffect(() => {
    if (!open) return;
    setHistoryOpen(false);
    setSelectedKeys(
      new Set(partOptions.filter((o) => !chargedKeys.has(o.key)).map((o) => o.key)),
    );
  }, [open, partOptions, chargedKeys]);

  const activeSelectedKeys = useMemo(() => {
    const next = new Set<string>();
    for (const key of selectedKeys) {
      if (!chargedKeys.has(key) && partOptions.some((o) => o.key === key)) {
        next.add(key);
      }
    }
    return next;
  }, [selectedKeys, chargedKeys, partOptions]);

  const sourceRows = useMemo(
    () => (Array.isArray(toothWorks) ? toothWorks : []),
    [toothWorks],
  );

  const selectedToothWorks = useMemo(
    () => buildToothWorksFromRemakeSelection(sourceRows, activeSelectedKeys),
    [sourceRows, activeSelectedKeys],
  );

  const allPartKeys = useMemo(
    () => new Set(partOptions.map((o) => o.key)),
    [partOptions],
  );
  const catalogToothWorks = useMemo(
    () => buildToothWorksFromRemakeSelection(sourceRows, allPartKeys),
    [sourceRows, allPartKeys],
  );

  const liveQuote = usePracticeTransferFeeQuote({
    enabled: open && Boolean(labAnchorId),
    labAnchorId,
    toothWorks: selectedToothWorks,
    remake: true,
  });
  const catalogQuote = usePracticeTransferFeeQuote({
    enabled: open && Boolean(labAnchorId) && catalogToothWorks.length > 0,
    labAnchorId,
    toothWorks: catalogToothWorks,
    remake: true,
  });

  const feeByKey = useMemo(() => {
    const map = new Map<string, number>();
    const lines = Array.isArray(catalogQuote.quote?.lines)
      ? catalogQuote.quote.lines
      : [];
    const usedLineIdx = new Set<number>();

    const takeLineFee = (
      pred: (line: (typeof lines)[number]) => boolean,
    ): number => {
      const idx = lines.findIndex(
        (line, i) => !usedLineIdx.has(i) && pred(line),
      );
      if (idx < 0) return 0;
      usedLineIdx.add(idx);
      const line = lines[idx];
      return Math.max(
        0,
        Math.round(Number(line.labFee || 0) + Number(line.labAbutmentFee || 0)),
      );
    };

    for (const opt of partOptions) {
      const tooth = String(opt.toothNumber || "").trim();
      if (opt.kind === "ca") {
        map.set(
          opt.key,
          takeLineFee(
            (line) =>
              String(line.toothNumber || "").trim() === tooth &&
              isCaFeeLineType(line.prosthesisType),
          ),
        );
      } else {
        map.set(
          opt.key,
          takeLineFee(
            (line) =>
              String(line.toothNumber || "").trim() === tooth &&
              !isCaFeeLineType(line.prosthesisType),
          ),
        );
      }
    }
    return map;
  }, [catalogQuote.quote?.lines, partOptions]);

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

  const billedTotal = Math.max(
    0,
    Math.round(
      Number(
        feeQuote?.total ??
          feeQuote?.finalTotal ??
          feeQuote?.labFeeTotal ??
          feeQuote?.finalLabFeeTotal ??
          0,
      ),
    ),
  );

  const history = Array.isArray(remakeCharges) ? remakeCharges : [];
  const selectedCount = activeSelectedKeys.size;
  const feeReady = catalogQuote.contextReady;

  const canSubmit =
    selectedToothWorks.length > 0 && remakeFeeTotal > 0 && !busy;

  const toggleKey = (key: string) => {
    if (chargedKeys.has(key)) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectableGroup = (
    group: RemakePartOption[],
    currentlyAllOn: boolean,
  ) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const o of group) {
        if (currentlyAllOn) next.delete(o.key);
        else next.add(o.key);
      }
      return next;
    });
  };

  const confirmLabel = busy
    ? "청구 중..."
    : canSubmit
      ? `${selectedCount}부위 · ${remakeFeeTotal.toLocaleString("ko-KR")}원 청구`
      : "리메이크 청구";

  if (!open) return null;

  return (
    <ConfirmDialog
      open
      title="리메이크 청구"
      panelClassName="max-w-[36rem]"
      showCloseButton
      closeOnBackdrop
      dense
      description={
        <div className="space-y-3 text-left">
          <p className="text-[12px] leading-snug text-muted-foreground">
            청구할 보철·어벗을 선택하세요.
          </p>

          <section className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium text-slate-500">
                현재 의뢰 합계
              </p>
              <p className="text-[15px] font-semibold tabular-nums tracking-tight text-slate-900">
                {billedTotal > 0 ? formatWon(billedTotal) : "—"}
              </p>
            </div>
            {history.length > 0 ? (
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="mt-1.5 flex w-full items-center justify-between gap-2 border-t border-slate-200/80 pt-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900"
                  >
                    <span>이전 리메이크 {history.length}건</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform",
                        historyOpen && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-1.5 max-h-24 space-y-1 overflow-y-auto">
                    {history.map((row, idx) => {
                      const fee = Math.max(
                        0,
                        Math.round(
                          Number(
                            row?.billingDelta?.total ??
                              row?.billingDelta?.labFeeTotal ??
                              0,
                          ),
                        ),
                      );
                      const label =
                        String(row?.summaryLabel || "")
                          .trim()
                          .replace(/커스텀어벗/g, "어벗") ||
                        (Array.isArray(row?.toothNumbers) &&
                        row.toothNumbers.length
                          ? row.toothNumbers.map((t) => `#${t}`).join(", ")
                          : "리메이크");
                      const sourceLabel = remakeChargeSourceLabel(row?.source);
                      return (
                        <li
                          key={`${row?.chargedAt || idx}-${label}`}
                          className="flex items-start justify-between gap-2 text-[11px] text-slate-600"
                        >
                          <span className="min-w-0">
                            <span className="inline-flex items-center gap-1">
                              <span className="rounded bg-slate-200/70 px-1 py-px text-[10px] text-slate-600">
                                {sourceLabel}
                              </span>
                              <span className="font-medium text-slate-800">
                                {label}
                              </span>
                            </span>
                            {formatChargeAt(row?.chargedAt) ? (
                              <span className="mt-0.5 block opacity-70">
                                {formatChargeAt(row?.chargedAt)}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums font-medium text-slate-800">
                            {fee > 0 ? `+${fee.toLocaleString("ko-KR")}원` : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </section>

          {partOptions.length > 0 ? (
            <div className="space-y-2.5">
              <PartGroup
                title="보철"
                options={prosthesisOptions}
                selectable={selectableProsthesis}
                activeSelectedKeys={activeSelectedKeys}
                chargedKeys={chargedKeys}
                feeByKey={feeByKey}
                feeReady={feeReady}
                busy={busy}
                onToggleKey={toggleKey}
                onToggleGroup={toggleSelectableGroup}
              />
              <PartGroup
                title="어벗"
                options={caOptions}
                selectable={selectableCa}
                activeSelectedKeys={activeSelectedKeys}
                chargedKeys={chargedKeys}
                feeByKey={feeByKey}
                feeReady={feeReady}
                busy={busy}
                onToggleKey={toggleKey}
                onToggleGroup={toggleSelectableGroup}
              />
              <div className="space-y-0.5 text-[11px] text-muted-foreground">
                <p>
                  <Link
                    to={LAB_FEE_SETTINGS_PATH}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    기공비
                  </Link>
                  에서 리메이크 단가를 설정하세요.
                </p>
                <p>커스텀어벗은 단가 미설정시 초기값 2만원으로 설정됩니다.</p>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-muted-foreground">
              청구할 보철·어벗이 없습니다.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-950">
              <Repeat className="h-3.5 w-3.5 text-amber-700" />
              이번 청구
            </div>
            <div className="text-right">
              <div className="text-[15px] font-semibold tabular-nums text-amber-950">
                {selectedCount === 0
                  ? "선택 없음"
                  : liveQuote.contextReady
                    ? formatWon(remakeFeeTotal)
                    : "견적 계산 중…"}
              </div>
              {remakeFeeTotal > 0 && liveQuote.contextReady ? (
                <div className="text-[10px] text-amber-800/80">
                  ≈ {formatManWon(remakeFeeTotal)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      }
      confirmLabel={confirmLabel}
      cancelLabel="취소"
      confirmTone="primary"
      busy={busy}
      confirmDisabled={!canSubmit && !busy}
      onConfirm={() => {
        if (!canSubmit) return;
        const parts = selectedKeysToRemakeParts(partOptions, activeSelectedKeys);
        const labels = partOptions
          .filter((o) => activeSelectedKeys.has(o.key))
          .map((o) =>
            o.kind === "ca"
              ? `${o.toothNumber || "—"} · 어벗`
              : o.label,
          );
        void onConfirm({
          selectedParts: parts,
          remakeFeeTotal,
          summaryLabel: labels.join(", "),
        });
      }}
      onCancel={() => {
        if (busy) return;
        onCancel();
      }}
    />
  );
}
