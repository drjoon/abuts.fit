// related files:
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - 2026-09-08: 후속 채팅 견적 = 의뢰건 최종 기공비(지르+CA). billingDelta 증분·skipAbutmentFees 제거.
// - 2026-09-08: 후속 보철 채팅 — 임플란트·어벗 스펙 유지 + transfer toothWorks로 레거시 payload 보강.
// - 2026-09-08: 후속 채팅 차트 — 스팬을 치아별로 펼치고 원 임시치아 CA·스펙을 치아단위로 복원.
// - 2026-09-02: 후속 보철 차트 — 버블 밖 전폭(의뢰상세와 동일 레이아웃), embedded 제거.
import { cn } from "@/shared/ui/cn";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import { compactRemakeSummaryLabel } from "@/features/chat/components/chatRemakeParts";
import type { ChatMessage } from "@/shared/hooks/useChatRooms";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import { isFollowUpProsthesisPhase } from "@/shared/practice/prosthesisFollowUp";
import {
  pickToothWorkAbutmentProductMode,
  pickToothWorkCustomSpecs,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export type ProsthesisFollowUpChatPayload = {
  arrivalYmd: string;
  toothWorks: ToothWorkSelection[];
};

const linkedTeethOfRow = (row: Partial<ToothWorkSelection>) => {
  const self = String(row?.toothNumber || "").trim();
  const linked = Array.isArray(row?.bridgeLinkedTeeth)
    ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  return Array.from(
    new Set([self, ...linked].filter((t) => /^[1-4][1-8]$/.test(t))),
  );
};

const normalizeToothWorkRow = (
  row: Partial<ToothWorkSelection> | null | undefined,
): ToothWorkSelection | null => {
  const toothNumber = String(row?.toothNumber || "").trim();
  const prosthesisType = String(row?.prosthesisType || "").trim();
  if (!toothNumber || !prosthesisType) return null;
  const bridgeLinkedTeeth = Array.isArray(row?.bridgeLinkedTeeth)
    ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  const customAbutment = Boolean(row?.customAbutment);
  return {
    toothNumber,
    prosthesisType,
    customAbutment,
    bridgeLinkedTeeth,
    ...pickToothWorkCustomSpecs(row, customAbutment),
    ...pickToothWorkAbutmentProductMode(row, customAbutment),
    ...(row?.prosthesisPhase ? { prosthesisPhase: row.prosthesisPhase } : {}),
  } as ToothWorkSelection;
};

/** 레거시 한 줄 텍스트 → toothWorks (예: `33-34 브리지, 45-46 브리지`) */
const parseLegacyFollowUpToothWorks = (label: string): ToothWorkSelection[] => {
  const parts = String(label || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const rows: ToothWorkSelection[] = [];
  for (const part of parts) {
    const match = part.match(/^([\d-]+)\s+(.+)$/);
    if (!match) continue;
    const teeth = match[1].split("-").map((t) => t.trim()).filter(Boolean);
    const prosthesisType = match[2].replace(/\.$/, "").trim();
    if (!teeth.length || !prosthesisType) continue;
    const row = normalizeToothWorkRow({
      toothNumber: teeth[0],
      prosthesisType,
      bridgeLinkedTeeth: teeth.length > 1 ? teeth : [],
      prosthesisPhase: "followUp",
    });
    if (row) rows.push(row);
  }
  return rows;
};

/**
 * 후속 채팅 차트용 — transfer 원 임시치아의 치아별 CA·스펙으로 스팬을 펼친다.
 * (채팅 payload 단독 행이 스팬 sourceRow CA를 전체에 심어 #45↔#44가 뒤집히던 문제)
 */
export const enrichFollowUpChatToothWorksFromTransfer = (
  chatRows: ToothWorkSelection[],
  transferToothWorks?: Partial<ToothWorkSelection>[] | null,
): ToothWorkSelection[] => {
  if (!Array.isArray(chatRows) || chatRows.length === 0) return chatRows;
  const transferRows = Array.isArray(transferToothWorks) ? transferToothWorks : [];
  if (transferRows.length === 0) return chatRows;

  const baseByTooth = new Map<string, Partial<ToothWorkSelection>>();
  for (const row of transferRows) {
    if (isFollowUpProsthesisPhase(row)) continue;
    const tooth = String(row?.toothNumber || "").trim();
    if (!/^[1-4][1-8]$/.test(tooth)) continue;
    if (!baseByTooth.has(tooth)) baseByTooth.set(tooth, row);
  }

  const buildPerToothFollowUp = (
    followRow: Partial<ToothWorkSelection>,
    tooth: string,
    spanTeeth: string[],
  ): ToothWorkSelection | null => {
    const base = baseByTooth.get(tooth);
    const hasCa = base
      ? Boolean(base.customAbutment)
      : Boolean(followRow.customAbutment);
    const specSource = hasCa ? base || followRow : null;
    const prosthesisType =
      String(followRow.prosthesisType || "").trim() || "브리지";
    return normalizeToothWorkRow({
      ...followRow,
      toothNumber: tooth,
      prosthesisType,
      prosthesisPhase: "followUp",
      bridgeLinkedTeeth: spanTeeth,
      customAbutment: hasCa,
      ...(specSource
        ? {
            ...pickToothWorkCustomSpecs(specSource, true),
            ...pickToothWorkAbutmentProductMode(specSource, true),
          }
        : {
            abutmentProductMode: undefined,
            implantManufacturer: "",
            implantBrand: "",
            implantFamily: "",
            implantType: "",
            abutmentManufacturer: "",
            abutmentDiameter: "",
            abutmentHeight: "",
          }),
    });
  };

  const out: ToothWorkSelection[] = [];
  const seen = new Set<string>();

  for (const row of chatRows) {
    const spanTeeth = linkedTeethOfRow(row);
    if (spanTeeth.length === 0) continue;
    for (const tooth of spanTeeth) {
      if (seen.has(tooth)) continue;
      const next = buildPerToothFollowUp(row, tooth, spanTeeth);
      if (!next) continue;
      seen.add(tooth);
      out.push(next);
    }
  }

  return out.length > 0 ? out : chatRows;
};

export const resolveProsthesisFollowUpChatPayload = (
  message: Pick<ChatMessage, "content" | "systemPayload">,
  transferToothWorks?: Partial<ToothWorkSelection>[] | null,
): ProsthesisFollowUpChatPayload | null => {
  const payload =
    message.systemPayload && typeof message.systemPayload === "object"
      ? (message.systemPayload as Record<string, unknown>)
      : null;
  const payloadRows = Array.isArray(payload?.toothWorks) ? payload!.toothWorks : [];
  const fromPayload = payloadRows
    .map((row) => normalizeToothWorkRow(row as Partial<ToothWorkSelection>))
    .filter((row): row is ToothWorkSelection => Boolean(row));

  const content = String(message.content || "").trim();
  const newFormatArrival = content.match(/치과도착일\s*(\d{4}-\d{2}-\d{2})/);
  const legacyMatch = content.match(
    /^후속 보철 추가:\s*(.+?)\.\s*치과도착일\s*(\d{4}-\d{2}-\d{2})/,
  );
  const arrivalYmd =
    String(payload?.arrivalYmd || "").trim() ||
    newFormatArrival?.[1]?.trim() ||
    legacyMatch?.[2]?.trim() ||
    "";

  const rawToothWorks =
    fromPayload.length > 0
      ? fromPayload
      : legacyMatch?.[1]
        ? parseLegacyFollowUpToothWorks(legacyMatch[1])
        : [];
  const toothWorks = enrichFollowUpChatToothWorksFromTransfer(
    rawToothWorks,
    transferToothWorks,
  );

  if (!arrivalYmd && toothWorks.length === 0) return null;
  return { arrivalYmd, toothWorks };
};

/** 레거시 한 줄 재도착 텍스트 → 줄바꿈 본문 */
export const formatArrivalAppendedChatContent = (content: string): string => {
  const text = String(content || "").trim();
  const legacy = text.match(
    /^재도착 반영: 주문일 (.+?) → (.+?), 치과(?:도착)?일 (.+?) → (.+?)\.?$/,
  );
  if (legacy) {
    return `재도착 반영\n주문일 ${legacy[1]} → ${legacy[2]}\n치과도착일 ${legacy[3]} → ${legacy[4]}`;
  }
  const legacyArrivalOnly = text.match(
    /^치과도착일이 (.+?) → (.+?)(?:\(으\))?로 변경되었습니다\.?$/,
  );
  if (legacyArrivalOnly) {
    return `치과도착일 변경\n${legacyArrivalOnly[1]} → ${legacyArrivalOnly[2]}`;
  }
  return text;
};

type PracticeTransferSystemChatBodyProps = {
  message: ChatMessage;
  compact?: boolean;
  formatTime: (createdAt: string) => string;
  messageDomId: string;
  labAnchorId?: string | null;
  /** 레거시 스펙 미포함 채팅 payload 보강용 */
  transferToothWorks?: Partial<ToothWorkSelection>[] | null;
  /** 의뢰건 기공비 SSOT — 후속 증분이 아니라 최종(지르+CA) 견적 */
  transferFeeQuote?: PracticeTransferFeeQuote | null;
  /** 기공소 — 리메이크 청구 취소 */
  onCancelRemakeCharge?: (chargeIndex: number | null) => void;
  remakeChargeCancelBusy?: boolean;
  /** 아직 유효한 remakeCharges chargeIndex 목록(취소 버튼 노출) */
  activeRemakeChargeIndexes?: ReadonlySet<number> | null;
};

export function PracticeTransferSystemChatBody({
  message,
  compact = false,
  formatTime,
  messageDomId,
  labAnchorId = null,
  transferToothWorks = null,
  transferFeeQuote = null,
  onCancelRemakeCharge = undefined,
  remakeChargeCancelBusy = false,
  activeRemakeChargeIndexes = null,
}: PracticeTransferSystemChatBodyProps): JSX.Element | null {
  const systemEvent = String(message.systemEvent || "").trim();
  const followUpPayload =
    systemEvent === "practice_transfer_prosthesis_follow_up"
      ? resolveProsthesisFollowUpChatPayload(message, transferToothWorks)
      : null;

  if (followUpPayload) {
    const { arrivalYmd, toothWorks } = followUpPayload;
    // 한 의뢰건 기공비는 1가지(최종 지르+CA). 후속 billingDelta(증분)로 대체하지 않는다.
    const caseFeeQuote =
      transferFeeQuote &&
      (transferFeeQuote.total > 0 ||
        (Array.isArray(transferFeeQuote.lines) && transferFeeQuote.lines.length > 0))
        ? transferFeeQuote
        : null;
    const feeToothWorks = Array.isArray(transferToothWorks)
      ? (transferToothWorks as ToothWorkSelection[])
      : toothWorks;
    return (
      <div
        id={messageDomId}
        className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden scroll-mt-4 py-1.5"
      >
        <div className="flex w-full justify-center">
          <div
            className={cn(
              "mx-auto w-full min-w-0 max-w-[min(100%,28rem)] rounded-md bg-muted/70 px-4 py-2 text-center text-muted-foreground",
              compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
            )}
          >
            <p className="font-medium leading-snug">후속 보철 추가</p>
            {arrivalYmd ? (
              <p className="mt-1 leading-snug">치과도착일 {arrivalYmd}</p>
            ) : null}
          </div>
        </div>
        {toothWorks.length > 0 ? (
          <div className="mt-2 w-full min-w-0 max-w-full text-left text-foreground">
            <PracticeToothWorkChartReadOnly
              toothWorks={toothWorks}
              feeToothWorks={feeToothWorks}
              showHeader={false}
              labAnchorId={labAnchorId}
              feeQuote={caseFeeQuote}
              enlargeOverlayClassName="z-[350]"
              enlargeDialogClassName="z-[360]"
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : null}
        <p
          className={cn(
            "mt-1.5 text-center opacity-70 text-muted-foreground",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    );
  }

  if (systemEvent === "practice_transfer_arrival_appended") {
    const formatted = formatArrivalAppendedChatContent(message.content);
    return (
      <div
        id={messageDomId}
        className="flex w-full justify-center scroll-mt-4 py-1.5"
      >
        <div
          className={cn(
            "max-w-[min(92%,28rem)] rounded-md bg-muted/70 px-3 py-1.5 text-center text-muted-foreground",
            compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
          )}
        >
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">
            {formatted}
          </p>
          <p className={cn("mt-0.5 opacity-70", compact ? "text-[10px]" : "text-[11px]")}>
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  if (systemEvent === "practice_transfer_remake_charge_cancel") {
    const payload =
      message.systemPayload && typeof message.systemPayload === "object"
        ? (message.systemPayload as Record<string, unknown>)
        : {};
    const feeTotal = Math.max(0, Math.round(Number(payload.remakeFeeTotal || 0)));
    const summaryLabel = compactRemakeSummaryLabel(
      String(payload.summaryLabel || "").trim(),
    );
    return (
      <div
        id={messageDomId}
        className="flex w-full justify-center scroll-mt-4 py-1.5"
      >
        <div
          className={cn(
            "max-w-[min(92%,28rem)] rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-center text-slate-600",
            compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            리메이크 청구 취소
          </p>
          {summaryLabel ? (
            <p className="mt-1 font-medium leading-snug text-slate-800">
              {summaryLabel}
            </p>
          ) : null}
          {feeTotal > 0 ? (
            <p className="mt-1 text-[11px] opacity-80">
              리메이크비 {feeTotal.toLocaleString("ko-KR")}원
            </p>
          ) : null}
          <p className={cn("mt-0.5 opacity-60", compact ? "text-[10px]" : "text-[11px]")}>
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  if (
    systemEvent === "practice_transfer_remake" ||
    systemEvent === "practice_transfer_remake_charge"
  ) {
    const payload =
      message.systemPayload && typeof message.systemPayload === "object"
        ? (message.systemPayload as Record<string, unknown>)
        : {};
    const feeTotal = Math.max(
      0,
      Math.round(
        Number(
          payload.remakeFeeTotal ??
            (payload.billingDelta &&
            typeof payload.billingDelta === "object"
              ? (payload.billingDelta as { labFeeTotal?: unknown; total?: unknown })
                  .labFeeTotal ??
                (payload.billingDelta as { total?: unknown }).total
              : 0) ??
            0,
        ),
      ),
    );
    const arrivalYmd = String(payload.arrivalYmd || "").trim();
    const summaryLabel = compactRemakeSummaryLabel(
      String(payload.summaryLabel || "").trim(),
    );
    const source = String(payload.source || "").trim();
    const rawChargeIndex = Math.trunc(Number(payload.chargeIndex));
    let chargeIndex = Number.isFinite(rawChargeIndex) ? rawChargeIndex : null;
    // 레거시 채팅(payload에 chargeIndex 없음) — 활성 청구가 1건이면 그 인덱스 사용
    if (
      chargeIndex == null &&
      activeRemakeChargeIndexes &&
      activeRemakeChargeIndexes.size === 1
    ) {
      chargeIndex = [...activeRemakeChargeIndexes][0] ?? null;
    }
    const headerLabel =
      systemEvent === "practice_transfer_remake_charge"
        ? source === "ca_reupload"
          ? "CA 재업로드"
          : "리메이크 청구"
        : "리메이크";
    const contentLines = String(message.content || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    // 첫 줄이 헤더와 같으면 중복 제거
    const bodyLines =
      contentLines[0] === headerLabel ||
      contentLines[0] === "커스텀어벗 리메이크" ||
      contentLines[0] === "리메이크 청구" ||
      contentLines[0] === "CA 재업로드"
        ? contentLines.slice(1)
        : contentLines;
    const bodyWithoutFee = bodyLines
      .filter((line) => !/^리메이크비\s/.test(line))
      .map((line) => compactRemakeSummaryLabel(line) || line);
    const feeFromContent = (() => {
      const feeLine = bodyLines.find((line) => /^리메이크비\s/.test(line));
      if (!feeLine) return 0;
      const n = Number(String(feeLine).replace(/[^\d]/g, ""));
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    })();
    const displayFeeTotal = feeTotal > 0 ? feeTotal : feeFromContent;
    // remakeCharges SSOT — 활성 청구가 있을 때만 「청구 취소」표시
    const chargeStillActive =
      chargeIndex != null
        ? Boolean(activeRemakeChargeIndexes?.has(chargeIndex))
        : Boolean(activeRemakeChargeIndexes && activeRemakeChargeIndexes.size > 0);
    const canCancel =
      systemEvent === "practice_transfer_remake_charge" &&
      source !== "ca_reupload" &&
      typeof onCancelRemakeCharge === "function" &&
      displayFeeTotal > 0 &&
      chargeStillActive;

    return (
      <div
        id={messageDomId}
        className="flex w-full justify-center scroll-mt-4 py-1.5"
      >
        <div
          className={cn(
            "max-w-[min(92%,28rem)] rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-2.5 text-center text-amber-950",
            compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80">
            {headerLabel}
          </p>
          {bodyWithoutFee.length > 0 ? (
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-medium leading-snug">
              {bodyWithoutFee.join("\n")}
            </p>
          ) : summaryLabel ? (
            <p className="mt-1 font-medium leading-snug">{summaryLabel}</p>
          ) : null}
          {summaryLabel &&
          bodyWithoutFee.length > 0 &&
          !bodyWithoutFee.some((line) => line.includes(summaryLabel)) ? (
            <p className="mt-1 text-[11px] opacity-80">{summaryLabel}</p>
          ) : null}
          {displayFeeTotal > 0 || arrivalYmd ? (
            <p className="mt-1 text-[11px] opacity-80">
              {arrivalYmd ? `도착 ${arrivalYmd}` : null}
              {arrivalYmd && displayFeeTotal > 0 ? " · " : null}
              {displayFeeTotal > 0
                ? `리메이크비 ${displayFeeTotal.toLocaleString("ko-KR")}원`
                : null}
            </p>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="mt-2 inline-flex h-7 items-center justify-center rounded-md border border-destructive/35 bg-white px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={remakeChargeCancelBusy}
              onClick={() => onCancelRemakeCharge?.(chargeIndex)}
            >
              {remakeChargeCancelBusy ? "취소 중…" : "청구 취소"}
            </button>
          ) : null}
          <p className={cn("mt-0.5 opacity-60", compact ? "text-[10px]" : "text-[11px]")}>
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
