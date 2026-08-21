// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/controllers/requests/common.review.controller.js
// change-log:
// - 2026-08-21: 클론 시 source stlFile/camFile 스텁 제거. 생성 직후 원본 filled 있으면 즉시 복사.
// - 2026-08-21: pending SSOT = 관리자 hexVerificationResultHex 없음(+활성 샘플 없으면 생성)
// - 2026-08-21: 헥스 확인용 샘플 취소 시(관리자 미완료) pending 재활성화
// - 2026-08-21: 샘플 생성 성공 후에만 pending 소진(생성 실패 시 pending 유지)
// - 2026-08-21: 의뢰 취소 시 헥스 확인용 샘플↔원본 쌍을 함께 찾도록 findHexVerificationCancelSiblings 추가
// - 2026-08-21: pending 미기록 레거시 ExoCAD도 첫 주문에서 확인용 샘플 생성
// - 2026-08-21: ExoCAD 첫 설정 후 첫 제조의뢰에 반대 헥스 확인용 복사샘플 자동 생성

import { Types } from "mongoose";
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  HEX_VERIFICATION_SAMPLE_LABEL,
  isHexVerificationPending,
  normalizeExoCadVersion,
  resolveAdminVerifiedHexFromSettings,
  resolveOppositeHexRotation,
} from "../utils/designSoftwareHex.js";
import {
  applyFilledStlFileToCaseInfos,
  pickFilledStlFileForClone,
  resolveFilledStlFile,
} from "../utils/filledStlFile.js";
import { ensureLotNumbersOnReadyEnter } from "../controllers/requests/utils.js";

export const isHexVerificationSampleRequest = (request) =>
  request?.caseInfos?.hexVerificationSample === true;

/**
 * 취소 시 함께 처리할 헥스 확인용 쌍(원본↔샘플).
 * - 원본 취소 → referenceIds에 원본 requestId가 있는 미취소 샘플
 * - 샘플 취소 → 샘플 referenceIds의 미취소 원본
 * self는 포함하지 않는다.
 * @param {object} request
 * @returns {Promise<object[]>}
 */
export async function findHexVerificationCancelSiblings(request) {
  if (!request) return [];

  const selfMongoId = String(request._id || "").trim();
  const selfRequestId = String(request.requestId || "").trim();
  const notCanceled = { manufacturerStage: { $nin: ["취소"] } };

  let siblings = [];
  if (isHexVerificationSampleRequest(request)) {
    const refs = (
      Array.isArray(request.referenceIds) ? request.referenceIds : []
    )
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (!refs.length) return [];
    siblings = await Request.find({
      requestId: { $in: refs },
      ...notCanceled,
      "caseInfos.hexVerificationSample": { $ne: true },
    }).populate("requestor", "businessAnchorId");
  } else if (selfRequestId) {
    siblings = await Request.find({
      "caseInfos.hexVerificationSample": true,
      referenceIds: selfRequestId,
      ...notCanceled,
    }).populate("requestor", "businessAnchorId");
  }

  return (siblings || []).filter(
    (doc) => String(doc?._id || "").trim() !== selfMongoId,
  );
}

const ensureReviewByStageDefaults = (request) => {
  if (!request.caseInfos) request.caseInfos = {};
  if (!request.caseInfos.reviewByStage) {
    request.caseInfos.reviewByStage = {};
  }
  const stages = [
    "request",
    "cam",
    "machining",
    "packing",
    "shipping",
    "tracking",
  ];
  for (const stage of stages) {
    if (!request.caseInfos.reviewByStage[stage]) {
      request.caseInfos.reviewByStage[stage] = {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      };
    }
  }
};

const resolveOwnerIds = ({ userId, businessAnchorId }) => ({
  uid: String(userId || "").trim(),
  bid: String(businessAnchorId || "").trim(),
});

const buildActiveHexSampleFilter = ({ uid, bid }) => {
  const filter = {
    "caseInfos.hexVerificationSample": true,
    manufacturerStage: { $nin: ["취소"] },
    $or: [],
  };
  if (uid && Types.ObjectId.isValid(uid)) {
    filter.$or.push({ requestor: uid });
  }
  if (bid && Types.ObjectId.isValid(bid)) {
    filter.$or.push({ businessAnchorId: bid });
  }
  return filter.$or.length ? filter : null;
};

/**
 * 확인용 샘플 생성 자격.
 * SSOT: ExoCAD + 관리자 hexVerificationResultHex 미확정 + 활성(미취소) 샘플 없음.
 * @returns {Promise<boolean>}
 */
export async function isHexVerificationSamplePendingEligible({
  userId,
  businessAnchorId,
  session = null,
  designSoftware = null,
}) {
  const { uid, bid } = resolveOwnerIds({ userId, businessAnchorId });
  const swHint = String(designSoftware || "").trim();

  let userRs = null;
  if (uid && Types.ObjectId.isValid(uid)) {
    const user = await User.findById(uid)
      .select({
        "requestSettings.designSoftware": 1,
        "requestSettings.hexVerificationResultHex": 1,
      })
      .session(session)
      .lean();
    userRs = user?.requestSettings || null;
  }

  let anchorRs = null;
  if (bid && Types.ObjectId.isValid(bid)) {
    const anchor = await BusinessAnchor.findById(bid)
      .select({
        "requestSettings.designSoftware": 1,
        "requestSettings.hexVerificationResultHex": 1,
      })
      .session(session)
      .lean();
    anchorRs = anchor?.requestSettings || null;
  }

  const effectiveDesign =
    swHint ||
    String(userRs?.designSoftware || "").trim() ||
    String(anchorRs?.designSoftware || "").trim();
  const adminVerifiedHex = resolveAdminVerifiedHexFromSettings(
    userRs,
    anchorRs,
  );

  if (
    !isHexVerificationPending({
      designSoftware: effectiveDesign,
      adminVerifiedHex,
    })
  ) {
    return false;
  }

  const activeFilter = buildActiveHexSampleFilter({ uid, bid });
  if (!activeFilter) return false;
  const activeSample = await Request.exists(activeFilter).session(
    session || undefined,
  );
  return !activeSample;
}

/**
 * @deprecated 호환용 — 관리자 헥스 SSOT 기반 자격 판정.
 */
export async function consumeHexVerificationSamplePending(args) {
  return isHexVerificationSamplePendingEligible(args);
}

/**
 * @deprecated pending은 관리자 hexVerificationResultHex SSOT.
 * 취소 후 별도 플래그 재활성화는 필요 없다(활성 샘플 유무로 생성 여부를 판정).
 */
export async function rearmHexVerificationSamplePendingAfterCancel() {
  return { rearmed: false, owners: [] };
}

/**
 * 원본 Request 문서를 기준으로 반대 헥스 확인용 복사샘플을 생성한다.
 * @param {object} sourceRequest - 저장된 Request(lean 또는 doc)
 * @returns {Promise<object|null>} 생성된 Request doc
 */
export async function createHexVerificationSampleClone({
  sourceRequest,
  actorUserId = null,
  session = null,
}) {
  if (!sourceRequest) return null;

  const designSoftware = String(
    sourceRequest?.caseInfos?.designSoftware || "",
  ).trim();
  if (designSoftware !== "ExoCAD") return null;

  const originalHex =
    String(sourceRequest?.caseInfos?.hexRotation?.mode || "").trim() ||
    String(sourceRequest?.caseInfos?.finalHexRotation || "").trim() ||
    String(sourceRequest?.rnd?.manufacturerHexRotation || "").trim() ||
    String(sourceRequest?.caseInfos?.requestorHexRotation || "").trim();
  if (!originalHex) return null;

  const oppositeHex = resolveOppositeHexRotation(originalHex);
  const now = new Date();
  const exoCadVersion = normalizeExoCadVersion(
    sourceRequest?.caseInfos?.exoCadVersion,
  );

  const sourceCaseInfos =
    sourceRequest.caseInfos && typeof sourceRequest.caseInfos === "object"
      ? JSON.parse(JSON.stringify(sourceRequest.caseInfos))
      : {};
  // source 스프레드의 빈 stlFile/camFile({uploadedAt} 스텁)이 남으면
  // BG가 camFile만 채운 뒤 resolveFilledStlFile이 스텁을 우선해 샘플 복사가 실패한다.
  delete sourceCaseInfos.stlFile;
  delete sourceCaseInfos.camFile;

  const cloneCaseInfos = {
    ...sourceCaseInfos,
    exoCadVersion: exoCadVersion || undefined,
    hexVerificationSample: true,
    requestorHexRotation: oppositeHex,
    finalHexRotation: oppositeHex,
    manufacturerHexRotation: oppositeHex,
    hexRotation: {
      ...(sourceCaseInfos.hexRotation &&
      typeof sourceCaseInfos.hexRotation === "object"
        ? sourceCaseInfos.hexRotation
        : {}),
      mode: oppositeHex,
    },
    // filled STL: stlFile SSOT (+ legacy camFile mirror). 첫 클론 시엔 보통 없음.
    ...pickFilledStlFileForClone(sourceRequest.caseInfos),
    ncFile: null,
    reviewByStage: {
      request: {
        status: "PENDING",
        updatedAt: now,
        updatedBy: actorUserId || null,
        reason: "",
      },
      cam: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      machining: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      packing: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      shipping: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
      tracking: {
        status: "PENDING",
        updatedAt: null,
        updatedBy: null,
        reason: "",
      },
    },
  };

  const requestorId =
    sourceRequest?.requestor?._id || sourceRequest?.requestor || null;
  const cloneBusinessAnchorId =
    sourceRequest.businessAnchorId ||
    sourceRequest?.requestor?.businessAnchorId ||
    null;

  const clonedRequest = new Request({
    title: sourceRequest.title || "",
    description: sourceRequest.description || "",
    referenceIds: Array.isArray(sourceRequest.referenceIds)
      ? [...sourceRequest.referenceIds, String(sourceRequest.requestId || "")]
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i)
      : sourceRequest.requestId
        ? [String(sourceRequest.requestId)]
        : [],
    caseInfos: cloneCaseInfos,
    requestor: requestorId,
    businessAnchorId: cloneBusinessAnchorId,
    caManufacturer: sourceRequest.caManufacturer || null,
    manufacturerStage: "준비",
    source: "manufacturer_sample",
    requestCategory: "copied_sample",
    shippingMode: sourceRequest.shippingMode || "normal",
    originalShipping: sourceRequest.originalShipping || undefined,
    finalShipping: sourceRequest.finalShipping || undefined,
    productionSchedule: {
      ...(sourceRequest.productionSchedule &&
      typeof sourceRequest.productionSchedule === "object"
        ? JSON.parse(JSON.stringify(sourceRequest.productionSchedule))
        : {}),
      assignedMachine: null,
      queuePosition: null,
      machiningQty: 1,
      actualCamStart: null,
    },
    timeline: sourceRequest.timeline
      ? JSON.parse(JSON.stringify(sourceRequest.timeline))
      : undefined,
    partnerBilling: sourceRequest.partnerBilling
      ? JSON.parse(JSON.stringify(sourceRequest.partnerBilling))
      : undefined,
    lotNumber: {
      material: String(sourceRequest?.lotNumber?.material || "").trim() || null,
      value: null,
    },
    assignedMachine: null,
    rnd: {
      doneAt: null,
      doneBy: null,
      doneFromStage: null,
      memo: HEX_VERIFICATION_SAMPLE_LABEL,
      memoUpdatedAt: now,
      memoUpdatedBy: actorUserId || null,
      manufacturerHexRotation: oppositeHex,
      manufacturerHexRotationUpdatedAt: now,
      manufacturerHexRotationUpdatedBy: actorUserId || null,
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
    statusHistory: [
      {
        status: HEX_VERIFICATION_SAMPLE_LABEL,
        note: `원본 의뢰 ${sourceRequest.requestId || "-"} 첫의뢰 확인용(반대 헥스 ${oppositeHex})`,
        updatedBy: actorUserId || null,
        updatedAt: now,
      },
    ],
  });

  ensureReviewByStageDefaults(clonedRequest);
  // 트랜잭션 밖 호출 전제. LotCounter는 세션 없이 발급.
  await ensureLotNumbersOnReadyEnter([clonedRequest], null);
  await clonedRequest.save(session ? { session } : undefined);
  return clonedRequest;
}

/**
 * ExoCAD 첫 확인용 샘플이 필요하면 첫 원본에 대해 복사샘플 1건 생성.
 * 다중 케이스 첫 주문이면 첫 번째 원본만 복제한다.
 * 자격 SSOT: 관리자 hexVerificationResultHex 미확정 + 활성 샘플 없음.
 */
export async function maybeCreateHexVerificationSampleForFirstOrder({
  sourceRequests,
  userId,
  businessAnchorId,
  actorUserId = null,
  session = null,
}) {
  const list = Array.isArray(sourceRequests)
    ? sourceRequests.filter(Boolean)
    : sourceRequests
      ? [sourceRequests]
      : [];
  if (list.length === 0) return null;

  const designSoftware = String(
    list[0]?.caseInfos?.designSoftware || "",
  ).trim();

  const pending = await isHexVerificationSamplePendingEligible({
    userId,
    businessAnchorId,
    session,
    designSoftware,
  });
  if (!pending) return null;

  const created = await createHexVerificationSampleClone({
    sourceRequest: list[0],
    actorUserId: actorUserId || userId,
    session,
  });
  if (!created) return null;

  // 원본 Rhino가 샘플보다 먼저 끝났으면 생성 직후 filled STL을 바로 복사한다.
  try {
    const sourceId = list[0]?._id || list[0]?.id;
    const freshSource = sourceId
      ? await Request.findById(sourceId).session(session || null)
      : null;
    if (freshSource) {
      await copyFilledStlToHexVerificationSamples(freshSource);
      const refreshed = await Request.findById(created._id).session(
        session || null,
      );
      if (refreshed) return refreshed;
    }
  } catch (copyErr) {
    console.warn(
      "[maybeCreateHexVerificationSampleForFirstOrder] copy filled STL failed",
      copyErr?.message || copyErr,
    );
  }

  return created;
}

const cloneJson = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

/**
 * 원본 Rhino 2-filled(stlFile / legacy camFile) 결과를 헥스 확인용 복사샘플에 복사한다.
 * hexRotation.mode(반대 헥스)는 유지하고, filled STL·치수 메타만 공유한다.
 * Esprit NC(ncFile)는 샘플 의뢰의 반대 헥스로 별도 생성한다.
 */
export async function copyFilledStlToHexVerificationSamples(sourceRequest) {
  const sourceRequestId = String(sourceRequest?.requestId || "").trim();
  if (!sourceRequestId) return [];
  if (sourceRequest?.caseInfos?.hexVerificationSample === true) return [];

  const filledStl = resolveFilledStlFile(sourceRequest?.caseInfos);
  if (!filledStl || !String(filledStl.s3Key || "").trim()) return [];

  const samples = await Request.find({
    "caseInfos.hexVerificationSample": true,
    referenceIds: sourceRequestId,
    manufacturerStage: { $nin: ["취소"] },
  });
  if (!samples.length) return [];

  const geometryKeys = [
    "maxDiameter",
    "connectionDiameter",
    "totalLength",
    "l1",
    "taperAngle",
    "tiltAxisVector",
    "frontPoint",
    "taperGuide",
    "finishLine",
    "stlMetadataUpdatedAt",
  ];

  const updated = [];
  for (const sample of samples) {
    if (!sample.caseInfos) sample.caseInfos = {};
    // stlFile SSOT + legacy camFile mirror
    applyFilledStlFileToCaseInfos(sample.caseInfos, cloneJson(filledStl));

    for (const key of geometryKeys) {
      const v = sourceRequest?.caseInfos?.[key];
      if (v !== undefined) {
        sample.caseInfos[key] = cloneJson(v);
      }
    }

    const preservedMode = String(
      sample.caseInfos?.hexRotation?.mode ||
        sample.caseInfos?.finalHexRotation ||
        sample.rnd?.manufacturerHexRotation ||
        "",
    ).trim();
    const sourceHex = sourceRequest?.caseInfos?.hexRotation;
    if (sourceHex && typeof sourceHex === "object") {
      sample.caseInfos.hexRotation = {
        ...cloneJson(sourceHex),
        ...(preservedMode ? { mode: preservedMode } : {}),
      };
    }

    sample.markModified("caseInfos");
    await sample.save();
    updated.push(sample);
  }

  return updated;
}
