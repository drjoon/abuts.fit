// related files:
// - web/frontend/src/features/chat/components/chatRemakeParts.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/usePracticeTransferFeeQuote.ts
// - web/backend/services/practiceTransferRemakeCharge.service.js

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { LAB_FEE_SETTINGS_PATH } from "@/features/settings/LabFeeSetupPrompt";
import {
  listRemakePartOptions,
  selectedKeysToRemakeParts,
  buildToothWorksFromRemakeSelection,
  type RemakeSelectedPart,
} from "@/features/chat/components/chatRemakeParts";
import {
  formatManWon,
  formatWon,
} from "@/shared/practice/practiceTransferFeeQuote";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import { LAB_FEE_CUSTOM_ABUTMENT_REMAKE_DEFAULT_PRICE } from "@/shared/practice/labFeeSchedule";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import { cn } from "@/shared/ui/cn";

export type LabRemakeChargeResult = {
  selectedParts: RemakeSelectedPart[];
  remakeFeeTotal: number;
  summaryLabel: string;
};

type RemakeChargeHistoryRow = {
  chargedAt?: string | Date | null;
  source?: string;
  summaryLabel?: string;
  toothNumbers?: string[];
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
    setSelectedKeys(new Set(partOptions.map((o) => o.key)));
  }, [open, partOptions]);

  const selectedToothWorks = useMemo(() => {
    const rows = Array.isArray(toothWorks) ? toothWorks : [];
    return buildToothWorksFromRemakeSelection(rows, selectedKeys);
  }, [toothWorks, selectedKeys]);

  const liveQuote = usePracticeTransferFeeQuote({
    enabled: open && Boolean(labAnchorId),
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
    () => partOptions.some((o) => o.kind === "ca" && selectedKeys.has(o.key)),
    [partOptions, selectedKeys],
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

  const canSubmit =
    selectedToothWorks.length > 0 && remakeFeeTotal > 0 && !busy;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!open) return null;

  return (
    <ConfirmDialog
      open
      title="리메이크 비용 청구"
      description={
        <div className="space-y-3 text-left">
          <p className="text-[13px] leading-snug text-muted-foreground">
            이 의뢰건의 청구 내역을 확인한 뒤, 리메이크할 보철·커스텀어벗을 선택하세요.
            설정 → 기공비의 리메이크 단가로 치과에 청구됩니다.
          </p>

          <section className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
            <p className="text-[12px] font-medium text-slate-700">현재 의뢰 청구</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-slate-900">
              {billedTotal > 0 ? formatWon(billedTotal) : "—"}
            </p>
            {history.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-slate-200/80 pt-2">
                {history.map((row, idx) => {
                  const fee = Math.max(
                    0,
                    Math.round(
                      Number(row?.billingDelta?.total ?? row?.billingDelta?.labFeeTotal ?? 0),
                    ),
                  );
                  const label =
                    String(row?.summaryLabel || "").trim() ||
                    (Array.isArray(row?.toothNumbers) && row.toothNumbers.length
                      ? row.toothNumbers.map((t) => `#${t}`).join(", ")
                      : "리메이크");
                  return (
                    <li
                      key={`${row?.chargedAt || idx}-${label}`}
                      className="flex items-start justify-between gap-2 text-[11px] text-slate-600"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">{label}</span>
                        {formatChargeAt(row?.chargedAt) ? (
                          <span className="ml-1 opacity-70">
                            · {formatChargeAt(row?.chargedAt)}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {fee > 0 ? `+${fee.toLocaleString("ko-KR")}원` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                아직 리메이크 청구 이력이 없습니다.
              </p>
            )}
          </section>

          {prosthesisOptions.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium text-slate-800">보철</p>
                <button
                  type="button"
                  className="text-[11px] text-primary"
                  disabled={busy}
                  onClick={() =>
                    setSelectedKeys((prev) => {
                      const next = new Set(prev);
                      const allOn = prosthesisOptions.every((o) => next.has(o.key));
                      for (const o of prosthesisOptions) {
                        if (allOn) next.delete(o.key);
                        else next.add(o.key);
                      }
                      return next;
                    })
                  }
                >
                  {prosthesisOptions.every((o) => selectedKeys.has(o.key))
                    ? "보철 해제"
                    : "보철 전체"}
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {prosthesisOptions.map((opt) => (
                  <label
                    key={opt.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2",
                      selectedKeys.has(opt.key)
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-slate-200 bg-white",
                    )}
                  >
                    <Checkbox
                      checked={selectedKeys.has(opt.key)}
                      onCheckedChange={() => toggleKey(opt.key)}
                      className="mt-0.5"
                      disabled={busy}
                    />
                    <span className="min-w-0 text-[12px] leading-snug">
                      <span className="font-semibold tabular-nums">#{opt.toothNumber}</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {opt.prosthesisType}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {caOptions.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium text-slate-800">커스텀어벗</p>
                <button
                  type="button"
                  className="text-[11px] text-primary"
                  disabled={busy}
                  onClick={() =>
                    setSelectedKeys((prev) => {
                      const next = new Set(prev);
                      const allOn = caOptions.every((o) => next.has(o.key));
                      for (const o of caOptions) {
                        if (allOn) next.delete(o.key);
                        else next.add(o.key);
                      }
                      return next;
                    })
                  }
                >
                  {caOptions.every((o) => selectedKeys.has(o.key))
                    ? "CA 해제"
                    : "CA 전체"}
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {caOptions.map((opt) => (
                  <label
                    key={opt.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2",
                      selectedKeys.has(opt.key)
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-slate-200 bg-white",
                    )}
                  >
                    <Checkbox
                      checked={selectedKeys.has(opt.key)}
                      onCheckedChange={() => toggleKey(opt.key)}
                      className="mt-0.5"
                      disabled={busy}
                    />
                    <span className="min-w-0 text-[12px] leading-snug">
                      <span className="font-semibold tabular-nums">#{opt.toothNumber}</span>
                      <span className="mt-0.5 block text-muted-foreground">커스텀어벗</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {partOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-muted-foreground">
              청구할 보철·커스텀어벗이 없습니다.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/60 px-3.5 py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-amber-950">
              <Repeat className="h-4 w-4 text-amber-700" />
              이번 청구액
            </div>
            <div className="text-right">
              <div className="text-[15px] font-semibold tabular-nums text-amber-950">
                {selectedToothWorks.length === 0
                  ? "선택 없음"
                  : liveQuote.contextReady
                    ? formatWon(remakeFeeTotal)
                    : "견적 계산 중…"}
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
              커스텀어벗 리메이크 수가가 미설정이면 개당{" "}
              {LAB_FEE_CUSTOM_ABUTMENT_REMAKE_DEFAULT_PRICE.toLocaleString("ko-KR")}
              원이 적용됩니다.{" "}
              <Link
                to={LAB_FEE_SETTINGS_PATH}
                className="font-medium text-amber-900 underline underline-offset-2"
              >
                설정 → 기공비
              </Link>
              에서 변경할 수 있습니다.
            </p>
          ) : null}
        </div>
      }
      confirmLabel={busy ? "청구 중..." : "리메이크 청구"}
      cancelLabel="취소"
      confirmTone="primary"
      busy={busy}
      onConfirm={() => {
        if (!canSubmit) return;
        const parts = selectedKeysToRemakeParts(partOptions, selectedKeys);
        const labels = partOptions
          .filter((o) => selectedKeys.has(o.key))
          .map((o) => o.label);
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
