// 제공하지 않는 커넥션 의뢰를 R&D 보관 샘플로 복사한다.
// 원본은 pendingCancel로 제조 준비 큐에서 빠지고, 의뢰자 확인 후 그 건만 취소된다.
//
// related files:
// - web/backend/controllers/requests/common.requests.controller.js (cloneAsSample)
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import {
  ensureLotNumberForMachining,
  formatUnsupportedConnectionLabel,
} from "../controllers/requests/utils.js";
import { pickFilledStlFileForClone } from "../utils/filledStlFile.js";
import { emitAppEventToRoles } from "../socket.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "./requestSnapshotTriggers.service.js";

export { formatUnsupportedConnectionLabel };

export function unsupportedConnectionHistoryNote(caseInfos) {
  const label = formatUnsupportedConnectionLabel(caseInfos);
  return label ? `제공하지 않는 커넥션: ${label}` : "제공하지 않는 커넥션";
}

/**
 * 원본 의뢰를 R&D 탭 보관 샘플로 복사한다.
 * 내역 note는 `제공하지 않는 커넥션: 제조사 / 브랜드 / 패밀리 / 타입`.
 */
export async function cloneUnsupportedConnectionToRnd(source, actorUserId) {
  if (!source) throw new Error("R&D로 복사할 의뢰가 없습니다.");
  const note = unsupportedConnectionHistoryNote(source.caseInfos);
  const actor =
    actorUserId && Types.ObjectId.isValid(String(actorUserId))
      ? new Types.ObjectId(String(actorUserId))
      : null;
  const stage = String(source.manufacturerStage || "").trim() || "준비";
  const originalLotValue = source.lotNumber?.value || null;
  const lotMaterial = source.lotNumber?.material || null;
  const sourceCase = source.caseInfos || {};
  const caseInfos = {
    ...sourceCase,
    reviewByStage: {
      request: { status: "PENDING", updatedAt: new Date() },
      cam: { status: "PENDING", updatedAt: null },
      machining: { status: "PENDING", updatedAt: null },
      packing: { status: "PENDING", updatedAt: null },
      shipping: { status: "PENDING", updatedAt: null },
      tracking: { status: "PENDING", updatedAt: null },
    },
    rollbackCounts: {
      request: 0,
      cam: 0,
      machining: 0,
      packing: 0,
      shipping: 0,
      tracking: 0,
    },
    file: sourceCase.file || null,
    ...pickFilledStlFileForClone(sourceCase),
    ncFile: null,
    finishLine: sourceCase.finishLine || null,
  };
  delete caseInfos.unsupportedConnection;

  const newRequest = new Request({
    caseInfos,
    requestor: source.requestor,
    businessAnchorId: source.businessAnchorId,
    caManufacturer: actor || source.caManufacturer || source.requestor,
    manufacturerStage: stage,
    source: "manufacturer_sample",
    requestCategory: "rnd_sample",
    rnd: {
      doneAt: new Date(),
      doneBy: actor,
      doneFromStage: stage,
    },
    price: {
      amount: 0,
      baseAmount: 0,
      discountAmount: 0,
      currency: "KRW",
      rule: "manufacturer_sample",
      paidAmount: 0,
      bonusAmount: 0,
    },
    originalShipping: { mode: "normal", requestedAt: new Date() },
    finalShipping: { mode: "normal", updatedAt: new Date() },
    mailboxAddress: null,
    shippingLabelPrinted: {
      printed: false,
      printedAt: null,
      mailboxAddress: null,
      snapshotFingerprint: null,
    },
    shippingWorkflow: { code: "none", label: "미처리" },
    lotNumber: {
      material: String(lotMaterial || "").trim() || null,
      value: null,
    },
    productionSchedule: {
      assignedMachine: null,
      queuePosition: null,
      machiningQty: 1,
      diameter: source.productionSchedule?.diameter || null,
      diameterGroup: source.productionSchedule?.diameterGroup || null,
    },
    timeline: {
      originalEstimatedShipYmd: null,
      nextEstimatedShipYmd: null,
      estimatedShipYmd: null,
      forceTodayShipment: false,
      actualCompletion: null,
    },
    shippingPackageId: null,
    deliveryInfoRef: null,
    paymentStatus: "결제전",
    paymentDetails: null,
    selfInspection: {
      confirmed: false,
      confirmedAt: null,
      confirmedBy: null,
      overallJudgment: null,
      rows: [],
    },
    statusHistory: [
      {
        status: note,
        note: `${note}${source.requestId ? ` (원본 ${source.requestId})` : ""}${
          originalLotValue ? `, 원본 로트번호: ${originalLotValue}` : ""
        }`,
        updatedBy: actor,
        updatedAt: new Date(),
      },
    ],
  });

  await ensureLotNumberForMachining(newRequest);
  await newRequest.save();

  const anchorId = String(source.businessAnchorId || "").trim();
  if (anchorId) {
    triggerDashboardSummaryRefreshForAnchorId(
      anchorId,
      `unsupported-connection-rnd:${newRequest.requestId}`,
    ).catch(() => {});
  }

  try {
    emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
      stage: "rnd",
      delta: 1,
      requestId: newRequest.requestId,
      source: "manufacturer_sample",
      requestCategory: "rnd_sample",
      originalRequestId: source.requestId,
    });
  } catch {
    // best-effort
  }

  return {
    requestId: newRequest.requestId,
    requestMongoId: String(newRequest._id),
    note,
  };
}
