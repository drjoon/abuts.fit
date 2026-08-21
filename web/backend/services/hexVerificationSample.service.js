// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/controllers/requests/common.review.controller.js
    // change-log:
// - 2026-08-21: pending 미기록 레거시 ExoCAD도 첫 주문에서 확인용 샘플 생성
// - 2026-08-21: ExoCAD 첫 설정 후 첫 제조의뢰에 반대 헥스 확인용 복사샘플 자동 생성

import { Types } from "mongoose";
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  HEX_VERIFICATION_SAMPLE_LABEL,
  normalizeExoCadVersion,
  resolveOppositeHexRotation,
} from "../utils/designSoftwareHex.js";
import {
  applyFilledStlFileToCaseInfos,
  pickFilledStlFileForClone,
  resolveFilledStlFile,
} from "../utils/filledStlFile.js";
import { ensureLotNumbersOnReadyEnter } from "../controllers/requests/utils.js";

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

/**
 * pending이 false(이미 소진)가 아니면 ExoCAD 확인용 샘플을 만들 자격이 있다.
 * - true: 명시적 pending
 * - undefined/null: 레거시(ExoCAD만 있고 pending 미기록) → 첫 주문에서 생성
 */
const isHexVerificationEligiblePending = (pendingRaw) => pendingRaw !== false;

/**
 * User → BusinessAnchor 순으로 확인용 샘플 생성 여부를 판정하고 소진한다.
 * pending===true 이거나(또는 미기록) ExoCAD인데 아직 확인용 샘플이 없으면 true.
 */
export async function consumeHexVerificationSamplePending({
  userId,
  businessAnchorId,
  session = null,
  designSoftware = null,
}) {
  const uid = String(userId || "").trim();
  const bid = String(businessAnchorId || "").trim();
  const sw = String(designSoftware || "").trim();

  let userPending = null;
  let userDesign = "";
  if (uid && Types.ObjectId.isValid(uid)) {
    const user = await User.findById(uid)
      .select({
        "requestSettings.hexVerificationSamplePending": 1,
        "requestSettings.designSoftware": 1,
      })
      .session(session)
      .lean();
    userPending = user?.requestSettings?.hexVerificationSamplePending;
    userDesign = String(user?.requestSettings?.designSoftware || "").trim();
  }

  let anchorPending = null;
  let anchorDesign = "";
  if (bid && Types.ObjectId.isValid(bid)) {
    const anchor = await BusinessAnchor.findById(bid)
      .select({
        "requestSettings.hexVerificationSamplePending": 1,
        "requestSettings.designSoftware": 1,
      })
      .session(session)
      .lean();
    anchorPending = anchor?.requestSettings?.hexVerificationSamplePending;
    anchorDesign = String(anchor?.requestSettings?.designSoftware || "").trim();
  }

  const effectiveDesign = sw || userDesign || anchorDesign;
  if (effectiveDesign !== "ExoCAD") return false;

  const explicitPending =
    userPending === true || anchorPending === true;
  const legacyEligible =
    isHexVerificationEligiblePending(userPending) &&
    isHexVerificationEligiblePending(anchorPending);

  if (!explicitPending && !legacyEligible) return false;

  if (!explicitPending) {
    // 레거시: 이미 확인용 샘플을 만든 적 있으면 스킵
    const priorFilter = {
      "caseInfos.hexVerificationSample": true,
      $or: [],
    };
    if (uid && Types.ObjectId.isValid(uid)) {
      priorFilter.$or.push({ requestor: uid });
    }
    if (bid && Types.ObjectId.isValid(bid)) {
      priorFilter.$or.push({ businessAnchorId: bid });
    }
    if (priorFilter.$or.length === 0) return false;
    const prior = await Request.exists(priorFilter).session(
      session || undefined,
    );
    if (prior) {
      // 소진 상태로 정리
      await markHexVerificationSampleConsumed({ uid, bid, session });
      return false;
    }
  }

  await markHexVerificationSampleConsumed({ uid, bid, session });
  return true;
}

async function markHexVerificationSampleConsumed({ uid, bid, session }) {
  const now = new Date();
  if (uid && Types.ObjectId.isValid(uid)) {
    await User.updateOne(
      { _id: uid },
      {
        $set: {
          "requestSettings.hexVerificationSamplePending": false,
          "requestSettings.updatedAt": now,
        },
      },
      session ? { session } : undefined,
    );
  }
  if (bid && Types.ObjectId.isValid(bid)) {
    await BusinessAnchor.updateOne(
      { _id: bid },
      {
        $set: {
          "requestSettings.hexVerificationSamplePending": false,
          "requestSettings.updatedAt": now,
        },
      },
      session ? { session } : undefined,
    );
  }
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
    // filled STL: stlFile SSOT (+ legacy camFile mirror). 첫 클론 시엔 보통 null.
    ...pickFilledStlFileForClone(sourceCaseInfos),
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
 * ExoCAD 첫 확인용 샘플이 필요하면 첫 원본에 대해 복사샘플 1건 생성 후 pending 소진.
 * 다중 케이스 첫 주문이면 첫 번째 원본만 복제한다.
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

  const pending = await consumeHexVerificationSamplePending({
    userId,
    businessAnchorId,
    session,
    designSoftware,
  });
  if (!pending) return null;

  return createHexVerificationSampleClone({
    sourceRequest: list[0],
    actorUserId: actorUserId || userId,
    session,
  });
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
