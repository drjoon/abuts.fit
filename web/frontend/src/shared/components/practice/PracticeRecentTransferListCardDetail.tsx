/**
 * 치과·기공소 의뢰 목록 카드 본문 메타 SSOT.
 * 필수만: 시각 / 상태 / 주문일·치과도착일 / 상대(기공소|치과)·환자명·치아번호.
 * 2026-08-16: headerActions — 1행 오른쪽 끝(의뢰 수락 취소 등).
 * 2026-08-16: 전송ID·파일수·기간·메모 덤프 제거, 2열 메타·시맨틱 뱃지.
 * 2026-08-16: 기공소 수신 카드와 동일 레이아웃(counterpart 라벨로 분기).
 * 2026-08-16: 카드에 치아번호(11,21)만 — 보철 형태 등은 상세 모달.
 * 2026-08-16: 상태 뱃지를 시각과 같은 줄에 배치(행 높이 절약).
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/ui/cn";
import { SEMANTIC_BADGE } from "@/shared/ui/semanticStatus";
import {
  formatToothNumbersForCard,
  parsePracticeTransferMemoMeta,
  parseToothWorks,
} from "@/shared/practice/transferMemo";
import { toStatusBadgeLabel } from "@/shared/practice/practiceRecentTransferList";

export function resolvePracticeTransferListPatientName(transfer: {
  rawTransferMemo?: string | null;
  transferMemo?: string | null;
  draftPatientName?: string | null;
  files?: Array<{ patientName?: string | null }> | null;
}): string {
  const fromDraft = String(transfer.draftPatientName || "").trim();
  if (fromDraft) return fromDraft;

  const raw = String(transfer.rawTransferMemo || "").trim();
  const fromRaw = String(parsePracticeTransferMemoMeta(raw).patientName || "").trim();
  if (fromRaw) return fromRaw;

  const display = String(transfer.transferMemo || "").trim();
  const fromDisplayMeta = String(parsePracticeTransferMemoMeta(display).patientName || "").trim();
  if (fromDisplayMeta) return fromDisplayMeta;

  const displayLine = display.match(/(?:^|\n)\s*환자명\s+([^\n·]+)/);
  if (displayLine) return String(displayLine[1] || "").trim();

  const fromFile = (transfer.files || [])
    .map((f) => String(f?.patientName || "").trim())
    .find(Boolean);
  return fromFile || "";
}

/** 목록 카드용 치아번호 라벨 (예: 11,21). 보철 형태는 상세 모달. */
export function resolvePracticeTransferListToothNumbers(transfer: {
  rawTransferMemo?: string | null;
  transferMemo?: string | null;
  toothWorksSummary?: string | null;
  toothWorks?: Array<{ toothNumber?: string | null }> | null;
  toothNumbers?: string[] | null;
}): string {
  if (Array.isArray(transfer.toothWorks) && transfer.toothWorks.length > 0) {
    const fromRows = formatToothNumbersForCard(transfer.toothWorks);
    if (fromRows) return fromRows;
  }

  const summary = String(transfer.toothWorksSummary || "").trim();
  if (summary) {
    const fromSummary = formatToothNumbersForCard(parseToothWorks(summary));
    if (fromSummary) return fromSummary;
  }

  const raw = String(transfer.rawTransferMemo || "").trim();
  if (raw) {
    const fromRaw = formatToothNumbersForCard(
      parsePracticeTransferMemoMeta(raw).toothWorks,
    );
    if (fromRaw) return fromRaw;
  }

  const display = String(transfer.transferMemo || "").trim();
  if (display) {
    const fromDisplay = formatToothNumbersForCard(
      parsePracticeTransferMemoMeta(display).toothWorks,
    );
    if (fromDisplay) return fromDisplay;
  }

  if (Array.isArray(transfer.toothNumbers) && transfer.toothNumbers.length > 0) {
    return formatToothNumbersForCard(transfer.toothNumbers);
  }

  return "";
}

/** 목록 뱃지 라벨(의뢰·수락…) 또는 원 상태(발송완료…) → semantic class */
export function practiceTransferStatusBadgeClass(statusOrLabel: string) {
  const label = toStatusBadgeLabel(statusOrLabel);
  if (label === "취소" || label === "거부") return SEMANTIC_BADGE.dangerSoft;
  if (label === "수락" || label === "완료" || label === "발송") {
    return SEMANTIC_BADGE.primarySoft;
  }
  if (label === "의뢰" || label === "임시저장") return SEMANTIC_BADGE.neutral;
  return SEMANTIC_BADGE.neutralOutline;
}

function MetaField({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <p className="min-w-0 truncate text-[12px] leading-snug">
      <span className="text-muted-foreground">{label}</span>{" "}
      <span
        className={cn(
          "font-medium text-slate-900",
          tabular && "tabular-nums tracking-tight",
        )}
      >
        {value}
      </span>
    </p>
  );
}

export type PracticeTransferRequestCardMetaProps = {
  createdAt: string;
  statusLabel?: string;
  statusBadgeClassName?: string;
  extraBadges?: ReactNode;
  /** 1행 오른쪽 끝 — 의뢰 수락 취소 등 */
  headerActions?: ReactNode;
  /** 치과 카드=기공소, 기공소 카드=치과 */
  counterpartLabel: string;
  counterpartValue: string;
  orderDate?: string;
  arrivalDate?: string;
  patientName?: string;
  /** 예: 11,21 — 보철 형태 등 세부는 상세 모달 */
  toothNumbers?: string;
  layout?: "compact" | "comfortable";
  /** 기공비 등 필수 부가 행 */
  afterMeta?: ReactNode;
};

export function PracticeTransferRequestCardMeta({
  createdAt,
  statusLabel,
  statusBadgeClassName,
  extraBadges,
  headerActions,
  counterpartLabel,
  counterpartValue,
  orderDate,
  arrivalDate,
  patientName,
  toothNumbers,
  layout = "compact",
  afterMeta,
}: PracticeTransferRequestCardMetaProps) {
  const order = String(orderDate || "").trim();
  const arrival = String(arrivalDate || "").trim();
  const counterpart = String(counterpartValue || "").trim() || "-";
  const patient = String(patientName || "").trim();
  const teeth = String(toothNumbers || "").trim();
  const comfortable = layout === "comfortable";
  const hasDates = Boolean(order || arrival);

  return (
    <div className={cn("min-w-0", comfortable ? "space-y-2.5" : "space-y-2")}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-[11px] tabular-nums tracking-tight text-muted-foreground">
            {createdAt}
          </p>
          {statusLabel ? (
            <Badge
              variant="outline"
              className={cn(
                "h-5 shrink-0 px-1.5 text-[11px] font-semibold leading-none",
                statusBadgeClassName || practiceTransferStatusBadgeClass(statusLabel),
              )}
            >
              {statusLabel}
            </Badge>
          ) : null}
          {extraBadges}
        </div>
        {headerActions ? (
          <div
            className="flex shrink-0 items-center gap-1.5"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {headerActions}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-x-3 gap-y-1",
          comfortable &&
            "rounded-lg border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white px-2.5 py-2",
        )}
      >
        {hasDates ? (
          <>
            <MetaField label="주문일" value={order || "—"} tabular />
            <MetaField label="치과도착일" value={arrival || "—"} tabular />
          </>
        ) : null}
        <MetaField label={counterpartLabel} value={counterpart} />
        {patient ? <MetaField label="환자명" value={patient} /> : null}
        {teeth ? <MetaField label="치아번호" value={teeth} tabular /> : null}
      </div>

      {afterMeta}
    </div>
  );
}

/** @deprecated 이름 호환 — PracticeTransferRequestCardMeta 사용 */
export const PracticeRecentTransferListCardDetail = (
  props: Omit<
    PracticeTransferRequestCardMetaProps,
    "counterpartLabel" | "counterpartValue"
  > & {
    targetLabText: string;
  },
) => {
  const { targetLabText, ...rest } = props;
  return (
    <PracticeTransferRequestCardMeta
      {...rest}
      counterpartLabel="기공소"
      counterpartValue={targetLabText}
    />
  );
};
