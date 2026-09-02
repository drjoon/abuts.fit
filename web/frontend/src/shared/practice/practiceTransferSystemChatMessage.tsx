// related files:
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - 2026-09-02: 후속 보철 차트 — 버블 밖 전폭(의뢰상세와 동일 레이아웃), embedded 제거.
import { cn } from "@/shared/ui/cn";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import type { ChatMessage } from "@/shared/hooks/useChatRooms";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import type { ProsthesisFollowUpRecord } from "@/shared/practice/prosthesisFollowUp";
import {
  emptyToothWorkCustomSpecs,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export type ProsthesisFollowUpChatPayload = {
  arrivalYmd: string;
  toothWorks: ToothWorkSelection[];
  billingDelta?: { labFeeTotal?: number; total?: number } | null;
};

const buildFollowUpChatFeeQuote = (
  billingDelta: unknown,
): PracticeTransferFeeQuote | null => {
  const delta =
    billingDelta && typeof billingDelta === "object"
      ? (billingDelta as { labFeeTotal?: number; total?: number })
      : null;
  const labFeeTotal = Math.max(0, Math.round(Number(delta?.labFeeTotal || 0)));
  const total = Math.max(0, Math.round(Number(delta?.total || 0)));
  const amount = total > 0 ? total : labFeeTotal;
  if (amount <= 0) return null;
  return {
    labFeeTotal: labFeeTotal || amount,
    labAbutmentTotal: 0,
    labAbutmentPending: false,
    abutmentRetailTotal: 0,
    abutmentQuotePending: false,
    abutmentQty: 0,
    total: amount,
    lines: [],
    relationshipKind: "none",
    feeRateApplied: 0,
    labSettlementAmount: 0,
    abutsRevenueAmount: 0,
    labFeeConfigured: true,
    billed: true,
  };
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
  return {
    toothNumber,
    prosthesisType,
    customAbutment: Boolean(row?.customAbutment),
    bridgeLinkedTeeth,
    ...emptyToothWorkCustomSpecs(),
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

export const resolveProsthesisFollowUpChatPayload = (
  message: Pick<ChatMessage, "content" | "systemPayload">,
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

  const toothWorks =
    fromPayload.length > 0
      ? fromPayload
      : legacyMatch?.[1]
        ? parseLegacyFollowUpToothWorks(legacyMatch[1])
        : [];

  if (!arrivalYmd && toothWorks.length === 0) return null;
  const billingDelta =
    payload?.billingDelta && typeof payload.billingDelta === "object"
      ? (payload.billingDelta as { labFeeTotal?: number; total?: number })
      : null;
  return { arrivalYmd, toothWorks, billingDelta };
};

const resolveFollowUpBillingDelta = (
  payload: ProsthesisFollowUpChatPayload,
  prosthesisFollowUps?: ProsthesisFollowUpRecord[] | null,
) => {
  const fromPayload = payload.billingDelta;
  if (
    fromPayload &&
    (Math.max(0, Number(fromPayload.total || 0)) > 0 ||
      Math.max(0, Number(fromPayload.labFeeTotal || 0)) > 0)
  ) {
    return fromPayload;
  }
  const arrivalYmd = String(payload.arrivalYmd || "").trim();
  if (!arrivalYmd) return null;
  const matched = (Array.isArray(prosthesisFollowUps) ? prosthesisFollowUps : []).find(
    (row) => String(row?.arrivalYmd || "").trim() === arrivalYmd && !row?.canceledAt,
  );
  return matched?.billingDelta || null;
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
  prosthesisFollowUps?: ProsthesisFollowUpRecord[] | null;
};

export function PracticeTransferSystemChatBody({
  message,
  compact = false,
  formatTime,
  messageDomId,
  labAnchorId = null,
  prosthesisFollowUps = null,
}: PracticeTransferSystemChatBodyProps): JSX.Element | null {
  const systemEvent = String(message.systemEvent || "").trim();
  const followUpPayload =
    systemEvent === "practice_transfer_prosthesis_follow_up"
      ? resolveProsthesisFollowUpChatPayload(message)
      : null;

  if (followUpPayload) {
    const { arrivalYmd, toothWorks } = followUpPayload;
    const storedFeeQuote = buildFollowUpChatFeeQuote(
      resolveFollowUpBillingDelta(followUpPayload, prosthesisFollowUps),
    );
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
              showHeader={false}
              skipAbutmentFees
              labAnchorId={labAnchorId}
              feeQuote={storedFeeQuote}
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

  return null;
}
