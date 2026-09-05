// related files:
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// change-log:
// - 2026-09-05: 투어 pause·수료 시 FE 주입 중단(RequestorPracticePage에서 상세도 삭제).
// - 2026-09-05: 샘플=16 크라운+CA(네오 IS2 Regular Hex · 지오메디 4.5×7), 환자=테스트환자, 도착=+7일.
// - 2026-09-05: 기공소 수신 가이드투어용 데모 PTX(FE 주입·실 API 차단).

import type { ChatMessage } from "@/shared/hooks/useChatRooms";
import type { PracticeTransferLabReceiveItem } from "@/shared/practice/practiceTransferLabReceive";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import {
  buildPracticeTransferMemo,
  serializeToothWorks,
} from "@/shared/practice/transferMemo";
import {
  GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS,
  GUIDE_TOUR_DEMO_MEMO,
  GUIDE_TOUR_DEMO_PATIENT_NAME,
} from "@/shared/guideTour/guideTourOralPrefill";
import { kstAddCivilDays, toKstYmd } from "@/shared/date/kst";

export const GUIDE_TOUR_DEMO_TRANSFER_ID = "GUIDE-TOUR-DEMO-PTX";
export const GUIDE_TOUR_DEMO_TRANSFER_OID = "guide-tour-demo-ptx-oid";

/** 기공소 투어 샘플 — 16 크라운+커스텀어벗(네오 IS2 Regular Hex · 지오메디 4.5×7) */
export const GUIDE_TOUR_DEMO_LAB_RECEIVE_TOOTH_WORKS: ToothWorkSelection[] = [
  {
    toothNumber: "16",
    prosthesisType: "크라운",
    customAbutment: true,
    bridgeLinkedTeeth: [],
    implantManufacturer: "NEOBIOTECH",
    implantBrand: "IS2",
    implantFamily: "Regular",
    implantType: "Hex",
    abutmentManufacturer: "지오메디",
    abutmentDiameter: "4.5",
    abutmentHeight: "7",
  },
];

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

/** 데모 수신 건 — accepted면 수락 후 디자인 드롭존 노출 */
export const buildGuideTourDemoReceiveTransfer = (opts?: {
  accepted?: boolean;
}): PracticeTransferLabReceiveItem => {
  const accepted = Boolean(opts?.accepted);
  const today = toKstYmd(new Date()) || "2026-09-05";
  const arrival =
    kstAddCivilDays(today, GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS) || today;
  const nowIso = new Date().toISOString();
  const toothWorks = GUIDE_TOUR_DEMO_LAB_RECEIVE_TOOTH_WORKS;
  const toothWorksSummary = serializeToothWorks(toothWorks);
  const rawMemo = buildPracticeTransferMemo({
    memo: GUIDE_TOUR_DEMO_MEMO,
    orderDate: today,
    arrivalDate: arrival,
    arrivalDefaultDays: GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS,
    prosthesisTypes: ["크라운"],
    toothWorks,
    patientName: GUIDE_TOUR_DEMO_PATIENT_NAME,
    skipDesignConfirm: true,
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
      businessName: "테스트치과",
      userName: "가이드투어",
    },
    practiceBusinessAnchorId: null,
    fileCount: 3,
    files: [
      {
        id: "guide-tour-demo-file-upper",
        patientName: GUIDE_TOUR_DEMO_PATIENT_NAME,
        tooth: "",
        originalName: "UpperJaw.ply",
        mimetype: "application/octet-stream",
        size: 10 * 1024 * 1024,
        s3Key: "guide-tour/demo/UpperJaw.ply",
      },
      {
        id: "guide-tour-demo-file-lower",
        patientName: GUIDE_TOUR_DEMO_PATIENT_NAME,
        tooth: "",
        originalName: "LowerJaw.ply",
        mimetype: "application/octet-stream",
        size: 10 * 1024 * 1024,
        s3Key: "guide-tour/demo/LowerJaw.ply",
      },
      {
        id: "guide-tour-demo-file-bite",
        patientName: GUIDE_TOUR_DEMO_PATIENT_NAME,
        tooth: "",
        originalName: "Bitescan.ply",
        mimetype: "application/octet-stream",
        size: 4 * 1024 * 1024,
        s3Key: "guide-tour/demo/Bitescan.ply",
      },
    ],
    resultFileCount: 0,
    resultFiles: [],
    feeQuote: null,
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
        name: "테스트치과",
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
