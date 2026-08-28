/**
 * 치과 발신 의뢰상세 좌측 패널 모델 SSOT.
 * 최근의뢰·전체보기에서 같은 PracticeRecentTransferItem으로 연다.
 * 2026-08-16: 작업 파일(어벗 디자인·보철물) 표시를 한곳에서 구성.
 * 2026-08-27: 재도착 이력 — 주문일→도착일 / 재주문일→재도착일 쌍 표시.
 * 2026-08-21: 커스텀어벗 한진 배송현황 요약 행.
 * 2026-08-21: 작업취소·휴지통 상태에서는 디자인 컨펌 CTA 숨김.
 */
import type {
  PracticeRecentTransferFileItem,
  PracticeRecentTransferItem,
} from "@/shared/practice/practiceRecentTransferList";
import {
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type {
  PracticeTransferDialogFileItem,
  PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { buildPracticeWorkPeriodSummaryItem } from "@/shared/practice/practiceWorkPeriod";
import { getPracticeAbutmentDeliveryLabel } from "@/shared/shipping/hanjinTrackingLabel";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const normalizeYmdList = (values: unknown, fallback?: string | null): string[] => {
  const fromArr = Array.isArray(values)
    ? values
        .map((d) => String(d || "").trim())
        .filter((d) => YMD_RE.test(d))
    : [];
  const fb = String(fallback || "").trim();
  if (fromArr.length > 0) {
    if (fb && !fromArr.includes(fb)) return [...fromArr, fb];
    return fromArr;
  }
  return fb && YMD_RE.test(fb) ? [fb] : [];
};

/**
 * 의뢰상세 날짜 행.
 * 단건: 주문일 / 치과도착일
 * 재도착 이력: 주문일→도착일 + 재주문일→재도착일
 */
export function buildPracticeTransferDateSummaryItems(
  transfer: Pick<
    PracticeRecentTransferItem,
    "orderDate" | "arrivalDate" | "orderDates" | "arrivalDates"
  >,
): PracticeTransferDialogSummaryItem[] {
  const orderDates = normalizeYmdList(transfer.orderDates, transfer.orderDate);
  const arrivalDates = normalizeYmdList(
    transfer.arrivalDates,
    transfer.arrivalDate,
  );
  const hasReorder =
    orderDates.length > 1 || arrivalDates.length > 1;
  if (!hasReorder) {
    return [
      { label: "주문일", value: orderDates[0] || transfer.orderDate || "-" },
      {
        label: "치과도착일",
        value: arrivalDates[0] || transfer.arrivalDate || "-",
      },
    ];
  }

  const originalOrder = orderDates[0] || "-";
  const originalArrival = arrivalDates[0] || "-";
  const reorderYmd =
    orderDates.length > 1 ? orderDates[orderDates.length - 1] : "-";
  const rearrivalYmd =
    arrivalDates.length > 1
      ? arrivalDates[arrivalDates.length - 1]
      : arrivalDates[0] || "-";

  return [
    {
      label: "주문일",
      value: originalOrder,
      tooltip:
        orderDates.length > 1
          ? `연결 주문일: ${orderDates.join(" → ")}`
          : undefined,
    },
    {
      label: "도착일",
      value: originalArrival,
      tooltip:
        arrivalDates.length > 1
          ? `연결 도착일: ${arrivalDates.join(" → ")}`
          : undefined,
    },
    {
      label: "재주문일",
      value: reorderYmd,
      tooltip:
        orderDates.length > 1
          ? `연결 주문일: ${orderDates.join(" → ")}`
          : "재도착 설정 시 오늘이 재주문일로 반영됩니다.",
    },
    {
      label: "재도착일",
      value: rearrivalYmd,
      tooltip:
        arrivalDates.length > 1
          ? `연결 도착일: ${arrivalDates.join(" → ")}`
          : undefined,
    },
  ];
}

const toDialogFiles = (
  files: PracticeRecentTransferFileItem[] | undefined,
  keyPrefix: string,
): PracticeTransferDialogFileItem[] =>
  (files || []).map((file) => {
    const s3Key = String(file.s3Key || "").trim();
    return {
      // idx 제외 — 목록 병합·순서 변경 시 타일 remount/썸네일 플리커 방지
      id: `${keyPrefix}:${s3Key || file.fileName}`,
      fileName: file.fileName,
      size: Number(file.size || 0),
      s3Key,
    };
  });

export type PracticeSenderTransferDetailModel = {
  summaryItems: PracticeTransferDialogSummaryItem[];
  memo: string;
  toothWorks: ToothWorkSelection[];
  toothWorksKey: string;
  files: PracticeTransferDialogFileItem[];
  designFiles: PracticeTransferDialogFileItem[];
  resultFiles: PracticeTransferDialogFileItem[];
  skipJig: boolean;
  labAnchorId: string | null;
  showProductionConfirm: boolean;
  productionConfirmTitle: string;
  productionConfirmButtonLabel: string;
  patientName: string;
  downloadAllFiles: PracticeRecentTransferFileItem[];
};

export function buildPracticeSenderTransferDetailModel(
  transfer: PracticeRecentTransferItem | null,
): PracticeSenderTransferDetailModel | null {
  if (!transfer) return null;

  const rawMemo = String(transfer.rawTransferMemo || transfer.transferMemo || "").trim();
  const parsed = parsePracticeTransferMemoMetaShared(rawMemo);
  const patientName =
    String(parsed.patientName || "").trim() ||
    String(transfer.draftPatientName || "").trim();
  // 상세 좌 메모: 메타 태그 원본에서 자유 입력 메모만 (환자명·보철물 요약 제외)
  const displayMemo = String(parsed.memo || "").trim() || "-";
  const orderDates = normalizeYmdList(transfer.orderDates, transfer.orderDate);
  const arrivalDates = normalizeYmdList(
    transfer.arrivalDates,
    transfer.arrivalDate,
  );
  const hasReorder = orderDates.length > 1 || arrivalDates.length > 1;
  const currentOrderYmd = hasReorder
    ? orderDates.length > 1
      ? orderDates[orderDates.length - 1]
      : orderDates[0] || transfer.orderDate
    : transfer.orderDate;
  const currentArrivalYmd = hasReorder
    ? arrivalDates.length > 1
      ? arrivalDates[arrivalDates.length - 1]
      : arrivalDates[0] || transfer.arrivalDate
    : transfer.arrivalDate;
  const workPeriodSummary = buildPracticeWorkPeriodSummaryItem(
    currentOrderYmd,
    currentArrivalYmd,
    "practice",
    transfer.createdAtTs,
  );

  const designCount = Number(
    transfer.designFiles?.length || transfer.designFileCount || 0,
  );
  const resultCount = Number(transfer.resultFiles?.length || 0);
  const transferKey =
    transfer.transferId && transfer.transferId !== "-"
      ? transfer.transferId
      : transfer.id || "practice-transfer";
  const status = String(transfer.status || "").trim();
  const isCanceledLikeStatus = status === "작업취소" || status === "취소";

  const showProductionConfirm =
    !isCanceledLikeStatus &&
    ((status === "작업완료" &&
      !transfer.productionConfirmedAt &&
      resultCount > 0) ||
      Boolean(
        transfer.hasCustomAbutment &&
          transfer.skipDesignConfirm === false &&
          (transfer.designReadyAt || designCount > 0) &&
          !transfer.practiceDesignConfirmedAt &&
          status !== "작업완료" &&
          status !== "생산진행" &&
          status !== "포장.발송",
      ));

  const isDesignConfirm =
    Boolean(transfer.hasCustomAbutment) &&
    transfer.skipDesignConfirm === false &&
    !transfer.practiceDesignConfirmedAt &&
    status !== "작업완료" &&
    !isCanceledLikeStatus;

  const abutmentDeliveryLabel = getPracticeAbutmentDeliveryLabel({
    hasCustomAbutment: Boolean(transfer.hasCustomAbutment),
    abutmentDeliveryInfo: transfer.abutmentDeliveryInfo || null,
  });

  return {
    summaryItems: [
      {
        label: "전송ID",
        value:
          transfer.transferId && transfer.transferId !== "-"
            ? transfer.transferId
            : transfer.id || "-",
      },
      { label: "전송시각", value: transfer.createdAt || "-" },
      { label: "기공소", value: transfer.targetLab || "-" },
      { label: "환자명", value: patientName || "-" },
      ...buildPracticeTransferDateSummaryItems(transfer),
      ...(workPeriodSummary
        ? [workPeriodSummary as PracticeTransferDialogSummaryItem]
        : []),
      { label: "파일 수", value: `${transfer.fileCount || 0}개` },
      { label: "어벗디자인", value: `${designCount}개` },
      { label: "보철물", value: `${resultCount}개` },
      ...(abutmentDeliveryLabel
        ? [
            {
              label: "커스텀어벗 배송",
              value: abutmentDeliveryLabel,
              valueClassName:
                abutmentDeliveryLabel === "배송완료"
                  ? "text-emerald-700"
                  : abutmentDeliveryLabel === "생산 전" ||
                      abutmentDeliveryLabel === "생산 준비" ||
                      abutmentDeliveryLabel === "생산 중" ||
                      abutmentDeliveryLabel === "출고 대기"
                    ? "text-slate-600"
                    : "text-amber-800",
            },
          ]
        : []),
    ],
    memo: displayMemo,
    toothWorks: parsed.toothWorks || [],
    toothWorksKey: transferKey,
    files: toDialogFiles(transfer.files, "request"),
    designFiles: toDialogFiles(transfer.designFiles, "design"),
    resultFiles: toDialogFiles(transfer.resultFiles, "result"),
    skipJig: Boolean(transfer.skipJig),
    labAnchorId: transfer.targetLabAnchorId || null,
    showProductionConfirm,
    productionConfirmTitle: isDesignConfirm
      ? "STL 디자인을 확인한 뒤 컨펌하세요. 컨펌시 커스텀 어벗 생산이 시작됩니다."
      : "작업 결과를 확인한 뒤 생산을 진행하세요.",
    productionConfirmButtonLabel: isDesignConfirm ? "어벗 디자인 컨펌" : "생산 진행",
    patientName,
    downloadAllFiles: [
      ...(Array.isArray(transfer.files) ? transfer.files : []),
      ...(Array.isArray(transfer.designFiles) ? transfer.designFiles : []),
      ...(Array.isArray(transfer.resultFiles) ? transfer.resultFiles : []),
    ],
  };
}
