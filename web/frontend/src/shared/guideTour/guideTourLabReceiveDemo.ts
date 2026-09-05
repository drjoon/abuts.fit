// related files:
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// - web/frontend/src/shared/guideTour/samples/labReceiveHyanggiTooth6Ca.json
// - web/frontend/public/guide-tour/lab-receive-sample/
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// change-log:
// - 2026-09-05: 향기로운치과 실샘플 복사본(PLY·기공비·치식) 표시. publicPath fetch.
// - 2026-09-05: 향기로운치과 6번대 CA 샘플 기반 기공비·파일 메타(익명). 데모 S3키=guide-tour/.
// - 2026-09-05: 투어 pause·수료 시 FE 주입 중단(RequestorPracticePage에서 상세도 삭제).
// - 2026-09-05: 샘플=16 크라운+CA(네오 IS2 Regular Hex · 지오메디 4.5×7), 환자=테스트환자, 도착=+7일.
// - 2026-09-05: 기공소 수신 가이드투어용 데모 PTX(FE 주입·실 API 차단).

import type { ChatMessage } from "@/shared/hooks/useChatRooms";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import type { PracticeTransferLabReceiveItem } from "@/shared/practice/practiceTransferLabReceive";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import {
  buildPracticeTransferMemo,
  serializeToothWorks,
} from "@/shared/practice/transferMemo";
import {
  GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS,
  GUIDE_TOUR_DEMO_MEMO,
} from "@/shared/guideTour/guideTourOralPrefill";
import { kstAddCivilDays, toKstYmd } from "@/shared/date/kst";
import labReceiveSample from "@/shared/guideTour/samples/labReceiveHyanggiTooth6Ca.json";

export const GUIDE_TOUR_DEMO_TRANSFER_ID = "GUIDE-TOUR-DEMO-PTX";
export const GUIDE_TOUR_DEMO_TRANSFER_OID = "guide-tour-demo-ptx-oid";
/** public/ 아래 정적 샘플·데모 키 공통 prefix */
export const GUIDE_TOUR_DEMO_S3_PREFIX = "guide-tour/";
export const GUIDE_TOUR_LAB_RECEIVE_SAMPLE_DIR =
  "guide-tour/lab-receive-sample";

const samplePatientName = String(labReceiveSample.patientName || "환자");
const sampleClinicName = String(
  labReceiveSample.practice?.businessName || "향기로운치과",
);

/** 기공소 투어 — 향기로운치과 실샘플(46 크라운+CA) */
export const GUIDE_TOUR_DEMO_LAB_RECEIVE_TOOTH_WORKS: ToothWorkSelection[] = (
  Array.isArray(labReceiveSample.toothWorks) ? labReceiveSample.toothWorks : []
).map((row) => ({
  toothNumber: String(row.toothNumber || ""),
  prosthesisType: String(row.prosthesisType || ""),
  customAbutment: Boolean(row.customAbutment),
  bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth)
    ? row.bridgeLinkedTeeth.map((t) => String(t))
    : [],
  implantManufacturer: String(row.implantManufacturer || ""),
  implantBrand: String(row.implantBrand || ""),
  implantFamily: String(row.implantFamily || ""),
  implantType: String(row.implantType || ""),
  abutmentManufacturer: String(row.abutmentManufacturer || ""),
  abutmentDiameter: String(row.abutmentDiameter || ""),
  abutmentHeight: String(row.abutmentHeight || ""),
}));

/** 샘플 billing — 보철 7만 + 어벗디자인 4만 = 11만 */
export const GUIDE_TOUR_DEMO_FEE_QUOTE: PracticeTransferFeeQuote = {
  labFeeTotal: Number(labReceiveSample.billing.labFeeTotal),
  labAbutmentTotal: Number(labReceiveSample.billing.labAbutmentTotal),
  labAbutmentPending: false,
  abutmentQuotePending: false,
  abutmentRetailTotal: Number(labReceiveSample.billing.abutmentRetailTotal),
  total: Number(labReceiveSample.billing.total),
  lines: (labReceiveSample.feeLines || []).map((line) => ({
    toothNumber: String(line.toothNumber),
    prosthesisType: String(line.prosthesisType),
    labFee: Number(line.labFee),
    labAbutmentFee: Number(line.labAbutmentFee),
    abutmentRetail: Number(line.abutmentRetail || 0),
  })),
  relationshipKind:
    labReceiveSample.billing.relationshipKind === "active" ||
    labReceiveSample.billing.relationshipKind === "referred"
      ? labReceiveSample.billing.relationshipKind
      : "none",
  feeRateApplied: Number(labReceiveSample.billing.feeRateApplied || 0),
  labSettlementAmount: Number(labReceiveSample.billing.labSettlementAmount),
  abutsRevenueAmount: Number(labReceiveSample.billing.abutsRevenueAmount),
  labFeeMultiplier: Number(labReceiveSample.billing.labFeeMultiplier || 1),
  rushFeeMultiplier: 1,
  billed: false,
  usedDefaultSchedule: false,
  labFeeConfigured: true,
  missingFeeNames: [],
  autoMatchBudget: null,
};

export const isGuideTourDemoTransferId = (
  transferId: string | null | undefined,
): boolean => String(transferId || "").trim() === GUIDE_TOUR_DEMO_TRANSFER_ID;

export const isGuideTourDemoTransfer = (
  transfer: Pick<PracticeTransferLabReceiveItem, "transferId" | "_id"> | null | undefined,
): boolean =>
  Boolean(
    transfer &&
      (isGuideTourDemoTransferId(transfer.transferId) ||
        String(transfer._id || "").trim() === GUIDE_TOUR_DEMO_TRANSFER_OID),
  );

export const isGuideTourDemoS3Key = (
  s3Key: string | null | undefined,
): boolean => String(s3Key || "").trim().startsWith(GUIDE_TOUR_DEMO_S3_PREFIX);

/** 정적 샘플 파일 URL (`public/` 기준) */
export const guideTourDemoPublicUrl = (s3Key: string): string => {
  const key = String(s3Key || "").trim().replace(/^\/+/, "");
  const parts = key.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  return `/${parts.map((p) => encodeURIComponent(p)).join("/")}`;
};

/** @deprecated placeholder — 실샘플 publicPath fetch로 대체 */
export const GUIDE_TOUR_DEMO_PLACEHOLDER_PLY = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
0 1 0
3 0 1 2
`;

export const buildGuideTourDemoPlaceholderBlob = (): Blob =>
  new Blob([GUIDE_TOUR_DEMO_PLACEHOLDER_PLY], {
    type: "application/octet-stream",
  });

/** 데모 수신 건 — accepted면 수락 후 디자인 드롭존 노출 */
export const buildGuideTourDemoReceiveTransfer = (opts?: {
  accepted?: boolean;
}): PracticeTransferLabReceiveItem => {
  const accepted = Boolean(opts?.accepted);
  // 캘린더「오늘」칸에 보이도록 주문일만 투어 당일로(원본 치식·파일·기공비는 유지)
  const today = toKstYmd(new Date()) || "2026-09-05";
  const arrival =
    kstAddCivilDays(today, GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS) || today;
  const nowIso = new Date().toISOString();
  const toothWorks =
    GUIDE_TOUR_DEMO_LAB_RECEIVE_TOOTH_WORKS.length > 0
      ? GUIDE_TOUR_DEMO_LAB_RECEIVE_TOOTH_WORKS
      : [
          {
            toothNumber: "46",
            prosthesisType: "크라운",
            customAbutment: true,
            bridgeLinkedTeeth: [],
            implantManufacturer: "NEOBIOTECH",
            implantBrand: "IS2",
            implantFamily: "Regular",
            implantType: "Hex",
            abutmentManufacturer: "지오메디",
            abutmentDiameter: "4.5",
            abutmentHeight: "7.0",
          },
        ];
  const toothWorksSummary = serializeToothWorks(toothWorks);
  const rawMemo = buildPracticeTransferMemo({
    memo: GUIDE_TOUR_DEMO_MEMO,
    orderDate: today,
    arrivalDate: arrival,
    arrivalDefaultDays: GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS,
    prosthesisTypes: ["크라운"],
    toothWorks,
    patientName: samplePatientName,
    skipDesignConfirm: true,
  });

  const files = (labReceiveSample.files || []).map((row, idx) => {
    const localName = String(row.localName || row.originalName || `file-${idx}.ply`);
    const originalName = String(row.originalName || localName);
    return {
      id: `guide-tour-demo-file-${idx}`,
      patientName: String(row.patientName || samplePatientName),
      tooth: String(row.tooth || toothWorks[0]?.toothNumber || ""),
      originalName,
      mimetype: String(row.mimetype || "application/octet-stream"),
      size: Math.max(0, Number(row.size || 0)),
      // public/guide-tour/lab-receive-sample/... → s3BlobCache가 정적 fetch
      s3Key: `${GUIDE_TOUR_LAB_RECEIVE_SAMPLE_DIR}/${localName}`,
    };
  });

  return {
    _id: GUIDE_TOUR_DEMO_TRANSFER_OID,
    transferId: GUIDE_TOUR_DEMO_TRANSFER_ID,
    targetLabName: "테스트기공소",
    transferMemo: rawMemo,
    rawTransferMemo: rawMemo,
    orderDate: today,
    arrivalDate: arrival,
    orderDates: [today],
    arrivalDates: [arrival],
    prosthesisTypes: ["크라운"],
    toothWorksSummary,
    toothWorks,
    status: accepted ? "의뢰수락" : "발송완료",
    manufacturerStage: accepted ? "의뢰수락" : "발송완료",
    createdAt: nowIso,
    updatedAt: nowIso,
    isRead: true,
    requestorReadAt: nowIso,
    isDownloaded: accepted,
    isAccepted: accepted,
    requestorDownloadedAt: accepted ? nowIso : null,
    requestorAcceptedAt: accepted ? nowIso : null,
    matchingMode: "direct",
    autoMatch: null,
    hasCustomAbutment: true,
    production: {
      shippingMode: "normal",
      skipDesignConfirm: true,
      skipJig: false,
      rushProcessing: false,
      designReadyAt: null,
      designFileCount: 0,
      designFiles: [],
      labDesignConfirmedAt: null,
      practiceDesignConfirmedAt: null,
      abutmentProductionStartedAt: null,
      abutmentPastReady: false,
      confirmedAt: null,
      relatedRequestIds: accepted ? ["guide-tour-demo-request"] : [],
    },
    practice: {
      businessName: sampleClinicName,
      userName: String(labReceiveSample.practice?.userName || "가이드투어"),
    },
    practiceBusinessAnchorId: null,
    fileCount: files.length,
    files,
    resultFileCount: 0,
    resultFiles: [],
    feeQuote: GUIDE_TOUR_DEMO_FEE_QUOTE,
  };
};

export const buildGuideTourDemoChatMessages = (): ChatMessage[] => {
  const now = Date.now();
  return [
    {
      _id: "guide-tour-demo-msg-1",
      roomId: "guide-tour-demo-room",
      sender: {
        _id: "guide-tour-demo-practice-user",
        name: sampleClinicName,
        role: "requestor",
      },
      content: "쉐이드 포토도 올렸습니다. 확인 부탁드려요.",
      createdAt: new Date(now - 60_000).toISOString(),
      updatedAt: new Date(now - 60_000).toISOString(),
    },
    {
      _id: "guide-tour-demo-msg-2",
      roomId: "guide-tour-demo-room",
      sender: {
        _id: "guide-tour-demo-lab-user",
        name: "테스트기공소",
        role: "requestor",
      },
      content: "네, 수락 후 디자인 진행하겠습니다.",
      createdAt: new Date(now - 30_000).toISOString(),
      updatedAt: new Date(now - 30_000).toISOString(),
    },
  ];
};
