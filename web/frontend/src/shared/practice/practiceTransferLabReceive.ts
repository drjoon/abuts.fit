// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/LabReceiveWorkUploadDialog.tsx
// change-log:
// - 2026-09-02: designStlUploadMode — 어벗/보철 CTA 통합 분기(abutment|prosthetic|dual|none).
// - 2026-08-29: 보철 디자인 업로드=작업완료(디자인). skip 자동 confirmedAt은 출고로 올리지 않음.
// - 2026-08-28: 심플어벗(치과 재고)은 어벗츠 CNC·디자인 업로드 기대 개수에서 제외.
// - 2026-08-21: expectedAbutmentDesigns — 치식 CA 개수 우선(헥스 샘플 related 과다 방지).
// - 2026-08-21: 미제공 CA 목록·상세 한 줄(formatPendingLabAbutmentDetailLine).
// - 2026-08-21: 요청중(헥스 사이즈 미정) CA는 어벗츠 생산 CTA·기대 디자인 수에서 제외.
// - 2026-08-25: unread — 치과 삭제(deleted|레거시 canceled)는 채팅 unread만.
// - 2026-08-21: unread 배지 — 휴지통(canceled)은 채팅 unread만(사이드바 received-unread와 정합).
// - 2026-08-21: resolvePracticeLabReceiveWorkActionState — 카드·상세 모달 CTA 판정 SSOT.
// - 2026-08-16: prosthetic slots — 크라운은 연결 잔여여도 스팬 묶지 않음; 기대 라벨 헬퍼.
// - 2026-08-16: prosthetic upload slots — 브리지 1파일·크라운/인레이 치아당 1파일·분할 업로드.
// - 2026-08-16: expectedAbutmentDesigns / needsMoreAbutmentDesigns — 다치아 어벗 업로드 CTA.
// - 2026-08-16: machiningStarted — abutmentPastReady 우선(준비 복귀 후 sticky startedAt 무시).
// - 2026-08-16: abutmentPastReady — 가공 시작 시 생산/수락 취소 불가 판정.
// - 2026-08-16: 별점 다운그레이드(starDowngrade) 수신 타입.
// - 2026-08-16: labRatingSummary(내 별점·평가 횟수) 수신 타입.
// - 2026-08-16: 생산 취소 시 confirmedAt·autoMatch.completed·manufacturerStage 클리어 →「의뢰수락」.
// - 2026-08-15: 기공의뢰수신(어벗츠기공소·일반 lab) 카드 SSOT — 상태·CA 판정·타입.
// - 2026-08-26: 기공소 수신 — 거부·작업취소(취소) 건은 목록·캘린더에서 제외.
// - 2026-08-26: 지정·클레임 거부 후 기공소 목록 제거 — 자동매칭 decline도 동일.
// - 2026-08-16: 자동매칭 재공개(openPool)는 workCanceledAt보다 우선 →「자동매칭」(수락 취소 후 수락 잔상 방지).
// - 2026-08-19: 임시치아+Pontic 스팬 업로드 라벨은 임시치아.
// - 2026-08-21: abutmentDeliveryInfo — 연동 CA 한진 배송 요약(치과 발신과 동일).
// - 2026-08-20: 수신 미확인+채팅 unread 합산(사이드바·캘린더 칩 공통).
import {
  formatImplantSummary,
  isBridgeLikeProsthesisType,
  isMissingToothProsthesisType,
  isTemporaryToothProsthesisType,
  parseToothWorks,
  toothWorkHasLabProsthesis,
  toToothMemoSortNumber,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  isPendingRoundBarAbutment,
  isSimpleAbutmentModeForFee,
} from "@/shared/practice/labFeeSchedule";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import type {
  LabRatingSummary,
  StarDowngradeInfo,
} from "@/shared/practice/practiceLabRating";
import type { PracticeAbutmentDeliveryInfo } from "@/shared/shipping/hanjinTrackingLabel";

export type PracticeTransferLabReceiveFile = {
  id: string;
  patientName: string;
  tooth: string;
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
};

export type PracticeTransferLabReceiveItem = {
  _id: string;
  transferId: string;
  targetLabName: string;
  transferMemo: string;
  rawTransferMemo: string;
  orderDate: string;
  arrivalDate: string;
  /** 누적 주문일(마지막=최종·재주문일). 캘린더 다중 표시 */
  orderDates?: string[];
  /** 누적 치과도착일(마지막=최종·재도착일). 캘린더 다중 표시 */
  arrivalDates?: string[];
  prosthesisTypes: string[];
  toothWorksSummary: string;
  status: string;
  manufacturerStage?: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  requestorReadAt: string | null;
  isDownloaded: boolean;
  isAccepted: boolean;
  requestorDownloadedAt: string | null;
  requestorAcceptedAt: string | null;
  workCanceledAt?: string | null;
  labRejected?: boolean;
  labRejectedAt?: string | null;
  matchingMode?: "direct" | "auto";
  autoMatch?: {
    claimedAt?: string | null;
    deadlineAt?: string | null;
    claimHours?: number | null;
    completedAt?: string | null;
    openPool?: boolean;
    claimActive?: boolean;
    completed?: boolean;
    mine?: boolean;
    declinedByMe?: boolean;
    remainingMs?: number | null;
    releaseCount?: number;
    priorityUntil?: string | null;
    priorityActive?: boolean;
    priorityLabForMe?: boolean;
    canOpenSubcontract?: boolean;
    subcontracted?: boolean;
  } | null;
  hasCustomAbutment?: boolean;
  production?: {
    shippingMode?: "normal" | "express" | null;
    skipDesignConfirm?: boolean;
    skipJig?: boolean;
    rushProcessing?: boolean;
    designReadyAt?: string | null;
    designFileCount?: number;
    designFiles?: PracticeTransferLabReceiveFile[];
    labDesignConfirmedAt?: string | null;
    practiceDesignConfirmedAt?: string | null;
    abutmentProductionStartedAt?: string | null;
    /** 연동 CA가 준비 단계를 지남(가공 등) — 생산/수락 취소 불가 */
    abutmentPastReady?: boolean;
    confirmedAt?: string | null;
    relatedRequestIds?: string[];
  } | null;
  /** 연동 커스텀어벗 Request 한진 배송 요약 */
  abutmentDeliveryInfo?: PracticeAbutmentDeliveryInfo | null;
  practice: {
    businessName: string;
    userName: string;
  };
  practiceBusinessAnchorId?: string | null;
  labFeeMultiplier?: number;
  fileCount: number;
  files: PracticeTransferLabReceiveFile[];
  resultFileCount?: number;
  resultFiles?: PracticeTransferLabReceiveFile[];
  feeQuote?: PracticeTransferFeeQuote | null;
  /** 자동매칭 — 우리 별점(수가)보다 의뢰 별점(수가)이 낮을 때 */
  starDowngrade?: StarDowngradeInfo | null;
  /** 수신 기공소 본인 별점 요약 */
  labRatingSummary?: LabRatingSummary | null;
  /** 기공소→치과 내부 메모(기공소만 조회) */
  practicePartnerMemo?: { memo: string; updatedAt?: string | null } | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
};

export type PracticeTransferLabReceiveDisplayStatus =
  | "거부"
  | "생산진행"
  | "작업완료"
  | "취소"
  | "자동매칭"
  | "의뢰수락"
  | "수신완료"
  | "발송완료";

/** 사이드바「기공의뢰수신」과 동일: 미확인 의뢰(1) + 채팅 unread.
 * 치과 삭제(status=deleted|레거시 canceled)는 수신 미확인 집계에서 빠지므로 채팅 unread만 센다.
 */
export function practiceTransferLabReceiveUnreadBadgeCount(
  transfer: {
    isRead?: boolean | null;
    status?: string | null;
  },
  chatUnreadCount = 0,
) {
  const status = String(transfer.status || "").trim().toLowerCase();
  const isPracticeDeleted =
    status === "deleted" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "취소";
  const unreadTransfer = isPracticeDeleted || transfer.isRead ? 0 : 1;
  return unreadTransfer + Math.max(0, Number(chatUnreadCount) || 0);
}

/** 기공소 수신 캘린더·목록에서 숨기는 종료 상태(거부·작업취소). */
export function isLabReceiveHiddenTerminalStatus(
  status: PracticeTransferLabReceiveDisplayStatus,
): boolean {
  return status === "취소" || status === "거부";
}

export function getPracticeTransferLabReceiveDisplayStatus(
  transfer: {
    status?: string;
    manufacturerStage?: string;
    isRead?: boolean;
    isDownloaded?: boolean;
    isAccepted?: boolean;
    requestorDownloadedAt?: string | null;
    requestorAcceptedAt?: string | null;
    workCanceledAt?: string | null;
    matchingMode?: string | null;
    labRejected?: boolean;
    production?: {
      confirmedAt?: string | null;
    } | null;
    autoMatch?: {
      openPool?: boolean;
      completed?: boolean;
      claimActive?: boolean;
      mine?: boolean;
      declinedByMe?: boolean;
    } | null;
  },
): PracticeTransferLabReceiveDisplayStatus {
  if (
    transfer.labRejected ||
    transfer.manufacturerStage === "거부" ||
    transfer.autoMatch?.declinedByMe
  ) {
    return "거부";
  }
  // 보철 디자인 파일 업로드(완료) → 작업완료(UI「디자인」).
  // skipDesignConfirm 자동 confirmedAt은 출고로 올리지 않음 — backend stage SSOT와 동일.
  // 연동 CA 포장.발송·택배면 출고(생산진행).
  const delivery = transfer.abutmentDeliveryInfo;
  if (
    delivery?.shippedAt ||
    delivery?.pickedUpAt ||
    delivery?.deliveredAt ||
    String(delivery?.tracking?.lastStatusText || "").trim() ||
    (Array.isArray(delivery?.manufacturerStages) &&
      delivery.manufacturerStages.some((s) =>
        ["포장.발송", "발송", "추적관리", "shipping", "tracking"].includes(
          String(s || "").trim(),
        ),
      ))
  ) {
    return "생산진행";
  }
  // API manufacturerStage가 이미 출고면 유지(delivery enrich 누락 대비)
  if (transfer.manufacturerStage === "생산진행") {
    return "생산진행";
  }

  const designCount = Math.max(
    Number(transfer.production?.designFileCount || 0) || 0,
    Array.isArray(transfer.production?.designFiles)
      ? transfer.production.designFiles.length
      : 0,
  );
  const resultCount = Math.max(
    Number(transfer.resultFileCount || 0) || 0,
    Array.isArray(transfer.resultFiles) ? transfer.resultFiles.length : 0,
  );
  const hasDesignOrResult =
    designCount > 0 ||
    resultCount > 0 ||
    Boolean(transfer.production?.designReadyAt);

  if (
    transfer.autoMatch?.completed ||
    transfer.manufacturerStage === "작업완료" ||
    (hasDesignOrResult &&
      (Boolean(transfer.isAccepted) ||
        Boolean(transfer.isDownloaded) ||
        Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
        Boolean(String(transfer.requestorAcceptedAt || "").trim()) ||
        transfer.manufacturerStage === "의뢰수락" ||
        transfer.manufacturerStage === "작업완료"))
  ) {
    const skipDesignConfirm = transfer.production?.skipDesignConfirm !== false;
    if (
      transfer.production?.confirmedAt &&
      !skipDesignConfirm &&
      transfer.autoMatch?.completed
    ) {
      return "생산진행";
    }
    return "작업완료";
  }

  // 자동매칭 재공개(수락 취소 포함) — workCanceledAt이 남아 있어도 공개 풀이면 「자동매칭」
  if (
    String(transfer.matchingMode || "") === "auto" &&
    (transfer.autoMatch?.openPool || transfer.manufacturerStage === "자동매칭")
  ) {
    return "자동매칭";
  }

  const stage = String(transfer.manufacturerStage || "").trim();
  if (
    stage === "작업취소" ||
    stage === "취소" ||
    Boolean(String(transfer.workCanceledAt || "").trim())
  ) {
    return "취소";
  }

  const rawStatus = String(transfer.status || "").trim().toLowerCase();
  if (
    Boolean(transfer.isAccepted) ||
    Boolean(transfer.isDownloaded) ||
    Boolean(String(transfer.requestorAcceptedAt || "").trim()) ||
    Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
    rawStatus === "downloaded" ||
    rawStatus === "accepted" ||
    rawStatus === "다운로드완료" ||
    rawStatus === "의뢰수락"
  ) {
    return "의뢰수락";
  }

  return transfer.isRead ? "수신완료" : "발송완료";
}

export function practiceTransferHasCustomAbutment(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return false;
  // 치식 요약이 있으면 심플어벗 제외 목록이 SSOT(레거시 hasCustomAbutment 과다 true 보정).
  if (String(transfer.toothWorksSummary || "").trim()) {
    return listPracticeTransferCustomAbutmentToothWorks(transfer).length > 0;
  }
  if (typeof transfer.hasCustomAbutment === "boolean") {
    return transfer.hasCustomAbutment;
  }
  return false;
}

/**
 * 치식 요약의 커스텀어벗 행 (스캔바디 CNC·요청중 포함).
 * 심플어벗(치과 재고)은 제외 — STL 업로드·어벗츠 Request 대상 아님.
 */
export function listPracticeTransferCustomAbutmentToothWorks(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return [] as ToothWorkSelection[];
  return parseToothWorks(transfer.toothWorksSummary).filter(
    (row) =>
      Boolean(row.customAbutment) && !isSimpleAbutmentModeForFee(row),
  );
}

/**
 * 어벗츠 CNC Request·「어벗 업로드 & 생산의뢰」대상.
 * 임플란트 추가 요청(요청중/헥스 사이즈 미정)·심플어벗은 제외.
 */
export function listPracticeTransferAbutsCustomAbutmentToothWorks(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  return listPracticeTransferCustomAbutmentToothWorks(transfer).filter(
    (row) => !isPendingRoundBarAbutment(row),
  );
}

export function practiceTransferHasAbutsCustomAbutment(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  return listPracticeTransferAbutsCustomAbutmentToothWorks(transfer).length > 0;
}

/** 요청중 CA가 하나라도 있으면 기공소 CNC 직접 의뢰 안내 */
export function practiceTransferHasPendingLabCustomAbutment(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  return listPracticeTransferPendingLabCustomAbutmentToothWorks(transfer).length > 0;
}

/** 어벗츠 미제공(요청중) 커스텀어벗 치식 — 치아번호 순 */
export function listPracticeTransferPendingLabCustomAbutmentToothWorks(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  return listPracticeTransferCustomAbutmentToothWorks(transfer)
    .filter((row) => isPendingRoundBarAbutment(row))
    .slice()
    .sort(
      (a, b) =>
        toToothMemoSortNumber(a.toothNumber) -
        toToothMemoSortNumber(b.toothNumber),
    );
}

/** 미제공 안내용 한 줄: `22번 · 오스템 / US` */
export function formatPendingLabAbutmentDetailLine(
  row: Pick<
    ToothWorkSelection,
    | "toothNumber"
    | "implantManufacturer"
    | "implantBrand"
    | "implantFamily"
    | "implantType"
    | "implantAddRequest"
  > | null | undefined,
) {
  const tooth = String(row?.toothNumber || "").trim();
  const implant = formatImplantSummary(row);
  if (tooth && implant) return `${tooth}번 · ${implant}`;
  if (tooth) return `${tooth}번`;
  return implant || "임플란트 미정";
}

export function practiceTransferAbutmentMachiningStarted(
  transfer:
    | {
        production?: {
          abutmentProductionStartedAt?: string | null;
          abutmentPastReady?: boolean | null;
        } | null;
      }
    | null
    | undefined,
) {
  // 라이브 pastReady가 있으면 그것만 본다(가공→준비 복귀 후 sticky startedAt 무시).
  if (
    transfer?.production &&
    Object.prototype.hasOwnProperty.call(transfer.production, "abutmentPastReady")
  ) {
    return Boolean(transfer.production.abutmentPastReady);
  }
  return Boolean(transfer?.production?.abutmentProductionStartedAt);
}

export function countPracticeTransferDesignFiles(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return 0;
  return Number(
    transfer.production?.designFileCount ||
      transfer.production?.designFiles?.length ||
      0,
  );
}

/** 치식 요약·연동 Request 기준, 올려야 할 어벗디자인 개수(어벗츠 CNC 대상만) */
export function countPracticeTransferExpectedAbutmentDesigns(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return 0;
  const caTeeth =
    listPracticeTransferAbutsCustomAbutmentToothWorks(transfer).length;
  // 치식이 있으면 치식 개수 SSOT. relatedRequestIds는 헥스 샘플 혼입 등 과다일 수 있음.
  if (caTeeth > 0) return caTeeth;
  const related = Array.isArray(transfer.production?.relatedRequestIds)
    ? transfer.production.relatedRequestIds.filter((id) =>
        Boolean(String(id || "").trim()),
      ).length
    : 0;
  return Math.max(related, 0);
}

/** 어벗츠 CNC 커스텀어벗이 있고 아직 치아별 어벗디자인이 부족한지 */
export function practiceTransferNeedsMoreAbutmentDesigns(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!practiceTransferHasAbutsCustomAbutment(transfer)) return false;
  const designCount = countPracticeTransferDesignFiles(transfer);
  const expected = countPracticeTransferExpectedAbutmentDesigns(transfer);
  if (expected <= 0) return designCount === 0;
  return designCount < expected;
}

/** 보철 업로드 슬롯 — 브리지(연결) 1파일, 크라운·인레이 등 치아당 1파일 */
export type PracticeTransferProstheticUploadSlot = {
  id: string;
  label: string;
  /** resultFiles.tooth 에 넣는 대표 치아 */
  tooth: string;
  teeth: string[];
  prosthesisType: string;
  kind: "bridge" | "single";
};

const sortTeeth = (teeth: string[]) =>
  [...new Set(teeth.map((t) => String(t || "").trim()).filter(Boolean))].sort(
    (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
  );

const collectProstheticBridgeLinks = (
  rows: ToothWorkSelection[],
  toothNumber: string,
) => {
  const tooth = String(toothNumber || "").trim();
  const byTooth = new Map(
    rows.map((row) => [String(row.toothNumber || "").trim(), row] as const),
  );
  const links = new Set<string>();
  const self = byTooth.get(tooth);
  for (const linked of Array.isArray(self?.bridgeLinkedTeeth)
    ? self.bridgeLinkedTeeth
    : []) {
    const other = String(linked || "").trim();
    if (other && byTooth.has(other)) links.add(other);
  }
  for (const [other, row] of byTooth) {
    if (!other || other === tooth) continue;
    const otherLinks = Array.isArray(row.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    if (otherLinks.some((value) => String(value || "").trim() === tooth)) {
      links.add(other);
    }
  }
  return [...links];
};

/**
 * 기공소가 올려야 할 보철 파일 슬롯 목록.
 * - 브리지·Pontic·유지장치 연결 스팬 → 스팬당 1파일
 * - 크라운·인레이·단독 임시치아 등 → 치아당 1파일 (연결 플래그만 있어도 묶지 않음)
 * - 커스텀어벗 단독·작업X → 제외
 */
export function listPracticeTransferProstheticUploadSlots(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
): PracticeTransferProstheticUploadSlot[] {
  if (!transfer) return [];
  const rows = parseToothWorks(transfer.toothWorksSummary).filter((row) =>
    toothWorkHasLabProsthesis(row),
  );
  if (rows.length === 0) return [];

  const remaining = new Set(
    rows.map((row) => String(row.toothNumber || "").trim()).filter(Boolean),
  );
  const byTooth = new Map(
    rows.map((row) => [String(row.toothNumber || "").trim(), row] as const),
  );
  const slots: PracticeTransferProstheticUploadSlot[] = [];

  const canGroupAsBridgeSpan = (prosthesisType: string, tooth: string) => {
    const type = String(prosthesisType || "").trim();
    // 크라운·인레이는 절대 스팬 묶음 금지(연결 잔여 플래그 무시)
    if (!isBridgeLikeProsthesisType(type) && !isTemporaryToothProsthesisType(type)) {
      return false;
    }
    if (isMissingToothProsthesisType(type)) return false;
    // 임시치아는 연결이 있을 때만 1파일, 브리지 계열은 연결 필수
    return collectProstheticBridgeLinks(rows, tooth).length > 0;
  };

  while (remaining.size > 0) {
    const start = remaining.values().next().value as string;
    const startRow = byTooth.get(start);
    const startType = String(startRow?.prosthesisType || "").trim();
    const canGroup = canGroupAsBridgeSpan(startType, start);

    if (!canGroup) {
      remaining.delete(start);
      slots.push({
        id: `single:${start}`,
        label: `${start} ${startType || "보철"}`,
        tooth: start,
        teeth: [start],
        prosthesisType: startType || "보철",
        kind: "single",
      });
      continue;
    }

    const stack = [start];
    const component: string[] = [];
    remaining.delete(start);
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      component.push(cur);
      for (const linked of collectProstheticBridgeLinks(rows, cur)) {
        if (!remaining.has(linked)) continue;
        const linkedType = String(byTooth.get(linked)?.prosthesisType || "").trim();
        if (!canGroupAsBridgeSpan(linkedType, linked) && !isBridgeLikeProsthesisType(linkedType)) {
          continue;
        }
        // 크라운이 연결만 된 경우는 스팬에 넣지 않음
        if (
          !isBridgeLikeProsthesisType(linkedType) &&
          !isTemporaryToothProsthesisType(linkedType)
        ) {
          continue;
        }
        remaining.delete(linked);
        stack.push(linked);
      }
    }

    const teeth = sortTeeth(component);
    const primary = teeth[0] || start;
    const primaryType = String(
      byTooth.get(primary)?.prosthesisType || startType || "브리지",
    ).trim();
    const labelType = teeth.some(
      (t) => String(byTooth.get(t)?.prosthesisType || "").trim() === "브리지",
    )
      ? "브리지"
      : teeth.some((t) => isTemporaryToothProsthesisType(String(byTooth.get(t)?.prosthesisType || "")))
        ? "임시치아"
        : primaryType || "브리지";
    const spanLabel =
      teeth.length > 1 ? `${teeth[0]}-${teeth[teeth.length - 1]}` : primary;

    slots.push({
      id: `bridge:${teeth.join("-")}`,
      label: `${spanLabel} ${labelType}`,
      tooth: primary,
      teeth,
      prosthesisType: labelType,
      kind: "bridge",
    });
  }

  return slots.sort(
    (a, b) => toToothMemoSortNumber(a.tooth) - toToothMemoSortNumber(b.tooth),
  );
}

export function countPracticeTransferExpectedProstheticFiles(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  return listPracticeTransferProstheticUploadSlots(transfer).length;
}

/** 치아 매칭된 결과파일·레거시(치아 없음) 개수를 반영한 남은 보철 슬롯 */
export function listPracticeTransferPendingProstheticSlots(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
): PracticeTransferProstheticUploadSlot[] {
  const slots = listPracticeTransferProstheticUploadSlots(transfer);
  if (slots.length === 0) return [];

  const resultFiles = Array.isArray(transfer?.resultFiles)
    ? transfer.resultFiles
    : [];
  const usedSlotIds = new Set<string>();
  let unassignedCount = 0;

  for (const file of resultFiles) {
    const tooth = String(file?.tooth || "").trim();
    if (!tooth) {
      unassignedCount += 1;
      continue;
    }
    const matched = slots.find(
      (slot) =>
        !usedSlotIds.has(slot.id) &&
        (slot.tooth === tooth || slot.teeth.includes(tooth)),
    );
    if (matched) usedSlotIds.add(matched.id);
    else unassignedCount += 1;
  }

  const pending = slots.filter((slot) => !usedSlotIds.has(slot.id));
  if (unassignedCount <= 0) return pending;
  return pending.slice(unassignedCount);
}

export function countPracticeTransferPendingProstheticFiles(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  return listPracticeTransferPendingProstheticSlots(transfer).length;
}

/** 보철 파일이 일부만 올라왔고 아직 작업완료 전인지 (분할 업로드 CTA) */
export function practiceTransferHasPartialProstheticUploads(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return false;
  if (transfer.autoMatch?.completed) return false;
  const resultCount = Number(
    transfer.resultFileCount || transfer.resultFiles?.length || 0,
  );
  if (resultCount <= 0) return false;
  return countPracticeTransferPendingProstheticFiles(transfer) > 0;
}

/** 카드/툴팁용 — 예: "11 크라운, 21 크라운" / "11-21 브리지" */
export function formatPracticeTransferProstheticSlotLabels(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
  opts?: { pendingOnly?: boolean },
) {
  const slots = opts?.pendingOnly
    ? listPracticeTransferPendingProstheticSlots(transfer)
    : listPracticeTransferProstheticUploadSlots(transfer);
  if (slots.length === 0) return "";
  return slots.map((slot) => slot.label).join(", ");
}

/** 통합「디자인(STL) 업로드」분기 — 카드·상세·드롭 공통 */
export type PracticeLabReceiveDesignStlUploadMode =
  | "none"
  | "abutment"
  | "prosthetic"
  | "dual";

/** 수락 후 어벗·보철 업로드 CTA 노출 판정(카드·상세 모달 공통) */
export type PracticeLabReceiveWorkActionState = {
  displayStatus: PracticeTransferLabReceiveDisplayStatus;
  designFileCount: number;
  /** 치식에 커스텀어벗 체크(요청중 포함) */
  hasCa: boolean;
  /** 어벗츠 CNC 생산의뢰 대상 CA */
  hasAbutsCa: boolean;
  /** 임플란트 추가 요청(요청중) CA — 기공소 CNC 직접 */
  hasPendingLabCa: boolean;
  needsMoreAbutmentDesigns: boolean;
  /** 어벗 디자인 STL이 더 필요한지(통합 CTA용 alias) */
  needsAbutmentDesigns: boolean;
  /** 남은 어벗 디자인 개수(기대 − 업로드) */
  pendingAbutmentCount: number;
  /** 보철 결과 STL 슬롯이 남아 있는지 */
  needsProstheticUploads: boolean;
  /** 통합 디자인(STL) 업로드 모드 */
  designStlUploadMode: PracticeLabReceiveDesignStlUploadMode;
  hasPartialProsthetic: boolean;
  pendingProstheticCount: number;
  prostheticSlotLabels: string;
  productionStarted: boolean;
  /** 의뢰수락(또는 재오픈) — 업로드 CTA 활성 */
  showWorkActions: boolean;
  /** 연동 CA + (디자인 있음 | 스테이지 재오픈) */
  showAbutmentProductionCancel: boolean;
  /** 보철완료 후 — 업로드 비활성 + 헤더「작업 완료 취소」 */
  showCompletedStageHeaderCancel: boolean;
  /** 레거시: 디자인 업로드 후 기공소 확인 CTA */
  showDesignConfirm: boolean;
};

export function resolvePracticeLabReceiveWorkActionState(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
): PracticeLabReceiveWorkActionState {
  const empty: PracticeLabReceiveWorkActionState = {
    displayStatus: "의뢰",
    designFileCount: 0,
    hasCa: false,
    hasAbutsCa: false,
    hasPendingLabCa: false,
    needsMoreAbutmentDesigns: false,
    needsAbutmentDesigns: false,
    pendingAbutmentCount: 0,
    needsProstheticUploads: false,
    designStlUploadMode: "none",
    hasPartialProsthetic: false,
    pendingProstheticCount: 0,
    prostheticSlotLabels: "",
    productionStarted: false,
    showWorkActions: false,
    showAbutmentProductionCancel: false,
    showCompletedStageHeaderCancel: false,
    showDesignConfirm: false,
  };
  if (!transfer) return empty;

  const displayStatus = getPracticeTransferLabReceiveDisplayStatus(transfer);
  const resultCount = Number(
    transfer.resultFileCount || transfer.resultFiles?.length || 0,
  );
  const designFileCount = countPracticeTransferDesignFiles(transfer);
  const hasCa = practiceTransferHasCustomAbutment(transfer);
  const hasAbutsCa = practiceTransferHasAbutsCustomAbutment(transfer);
  const hasPendingLabCa = practiceTransferHasPendingLabCustomAbutment(transfer);
  const needsMoreAbutmentDesigns =
    practiceTransferNeedsMoreAbutmentDesigns(transfer);
  const hasPartialProsthetic =
    practiceTransferHasPartialProstheticUploads(transfer);
  const pendingProstheticCount =
    countPracticeTransferPendingProstheticFiles(transfer);
  const expectedAbutment =
    countPracticeTransferExpectedAbutmentDesigns(transfer);
  const pendingAbutmentCount = needsMoreAbutmentDesigns
    ? Math.max(0, expectedAbutment - designFileCount) ||
      (designFileCount === 0 && expectedAbutment <= 0 ? 1 : 0)
    : 0;
  const needsAbutmentDesigns = needsMoreAbutmentDesigns;
  const needsProstheticUploads = pendingProstheticCount > 0;
  const designStlUploadMode: PracticeLabReceiveDesignStlUploadMode =
    needsAbutmentDesigns && needsProstheticUploads
      ? "dual"
      : needsAbutmentDesigns
        ? "abutment"
        : needsProstheticUploads
          ? "prosthetic"
          : "none";
  const prostheticSlotLabels = formatPracticeTransferProstheticSlotLabels(
    transfer,
    { pendingOnly: hasPartialProsthetic },
  );
  const isLabAccepted =
    Boolean(transfer.isAccepted) ||
    Boolean(transfer.isDownloaded) ||
    Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
    Boolean(String(transfer.requestorAcceptedAt || "").trim());
  const productionStarted = practiceTransferAbutmentMachiningStarted(transfer);
  const needsStageReopen =
    hasAbutsCa &&
    isLabAccepted &&
    designFileCount === 0 &&
    (resultCount > 0 ||
      Boolean(transfer.production?.confirmedAt) ||
      Boolean(transfer.autoMatch?.completed) ||
      displayStatus === "생산진행" ||
      displayStatus === "작업완료");
  const showWorkActions =
    displayStatus === "의뢰수락" ||
    (isLabAccepted &&
      !productionStarted &&
      designFileCount === 0 &&
      resultCount === 0 &&
      !transfer.production?.confirmedAt &&
      !transfer.autoMatch?.completed);
  const showAbutmentProductionCancel =
    hasAbutsCa &&
    (designFileCount > 0 || needsStageReopen) &&
    Array.isArray(transfer.production?.relatedRequestIds) &&
    transfer.production.relatedRequestIds.length > 0;
  const showCompletedStageHeaderCancel =
    !showWorkActions && showAbutmentProductionCancel;
  const showDesignConfirm =
    hasAbutsCa &&
    designFileCount > 0 &&
    !transfer.production?.labDesignConfirmedAt;

  return {
    displayStatus,
    designFileCount,
    hasCa,
    hasAbutsCa,
    hasPendingLabCa,
    needsMoreAbutmentDesigns,
    needsAbutmentDesigns,
    pendingAbutmentCount,
    needsProstheticUploads,
    designStlUploadMode,
    hasPartialProsthetic,
    pendingProstheticCount,
    prostheticSlotLabels,
    productionStarted,
    showWorkActions,
    showAbutmentProductionCancel,
    showCompletedStageHeaderCancel,
    showDesignConfirm,
  };
}
