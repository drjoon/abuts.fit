/**
 * 치과 발신 의뢰상세 좌측 패널 모델 SSOT.
 * 최근의뢰·전체보기에서 같은 PracticeRecentTransferItem으로 연다.
 * 2026-08-16: 작업 파일(어벗 디자인·보철물) 표시를 한곳에서 구성.
 * 2026-08-21: 커스텀어벗 한진 배송현황 요약 행.
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

const toDialogFiles = (
  files: PracticeRecentTransferFileItem[] | undefined,
  keyPrefix: string,
): PracticeTransferDialogFileItem[] =>
  (files || []).map((file, idx) => ({
    id: `${file.s3Key}:${keyPrefix}:${idx}`,
    fileName: file.fileName,
    size: Number(file.size || 0),
    s3Key: String(file.s3Key || "").trim(),
  }));

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
  const workPeriodSummary = buildPracticeWorkPeriodSummaryItem(
    transfer.orderDate,
    transfer.arrivalDate,
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

  const showProductionConfirm =
    (String(transfer.status || "").trim() === "작업완료" &&
      !transfer.productionConfirmedAt &&
      resultCount > 0) ||
    Boolean(
      transfer.hasCustomAbutment &&
        transfer.skipDesignConfirm === false &&
        (transfer.designReadyAt || designCount > 0) &&
        !transfer.practiceDesignConfirmedAt &&
        String(transfer.status || "").trim() !== "작업완료" &&
        String(transfer.status || "").trim() !== "생산진행" &&
        String(transfer.status || "").trim() !== "포장.발송",
    );

  const isDesignConfirm =
    Boolean(transfer.hasCustomAbutment) &&
    transfer.skipDesignConfirm === false &&
    !transfer.practiceDesignConfirmedAt &&
    String(transfer.status || "").trim() !== "작업완료";

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
      { label: "주문일", value: transfer.orderDate || "-" },
      { label: "치과도착일", value: transfer.arrivalDate || "-" },
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
      ? "어벗츠 디자인을 확인한 뒤 컨펌하세요. 기공소 확인과 함께 생산이 시작됩니다."
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
