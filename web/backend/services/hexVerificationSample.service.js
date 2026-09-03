// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/services/practiceTransferProduction.service.js (PTX 준비 등록 시에도 미확정 제조사 샘플 생성)
// - web/backend/controllers/requests/common.review.controller.js
// change-log:
// - 2026-09-03: PTX/배치 취소용 원본→활성 헥스 샘플 ObjectId 조회 헬퍼.
// - 2026-09-03: 제조사별 샘플 생성 실패가 다른 제조사 생성을 막지 않게 try/catch. 준비 목록 누락분 백필.
// - 2026-09-03: PTX 원본 클론은 designCompletedAt 전이라도 ensureLotNumberForMachining으로 로트 강제 발급(null unique 충돌 방지).
// - 2026-09-03: 임플란트 제조사별 미확정이면 배치 내 제조사당 샘플 1건. PTX 준비 등록도 동일.
// - 2026-08-21: 워크시트 준비 목록에서 헥스 샘플 filled STL 누락을 원본에서 보정.
// - 2026-08-21: 클론 저장 후 빈 stlFile/camFile 스텁 $unset. 생성 직후 원본 filled 있으면 즉시 복사.
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
  normalizeImplantManufacturerKey,
  resolveOppositeHexRotation,
} from "../utils/designSoftwareHex.js";
import {
  applyFilledStlFileToCaseInfos,
  pickFilledStlFileForClone,
  resolveFilledStlFile,
} from "../utils/filledStlFile.js";
import { ensureLotNumberForMachining } from "../controllers/requests/utils.js";

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

/**
 * 원본 Request _id 목록 → 참조하는 활성 헥스 확인용 샘플 _id.
 * PTX 작업취소 시 relatedRequestIds에 없는 샘플도 함께 취소하기 위함.
 * @param {import("mongoose").Types.ObjectId[]|string[]} sourceObjectIds
 * @returns {Promise<import("mongoose").Types.ObjectId[]>}
 */
export async function findActiveHexVerificationSampleObjectIdsForSources(
  sourceObjectIds,
) {
  const oids = (Array.isArray(sourceObjectIds) ? sourceObjectIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (!oids.length) return [];

  const sources = await Request.find({ _id: { $in: oids } })
    .select({ requestId: 1 })
    .lean();
  const requestIds = [
    ...new Set(
      sources
        .map((row) => String(row?.requestId || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!requestIds.length) return [];

  const samples = await Request.find({
    "caseInfos.hexVerificationSample": true,
    referenceIds: { $in: requestIds },
    manufacturerStage: { $nin: ["취소"] },
  })
    .select({ _id: 1 })
    .lean();

  return (samples || [])
    .map((row) => String(row?._id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
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

const buildActiveHexSampleFilter = ({ uid, bid, implantManufacturer }) => {
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
  if (!filter.$or.length) return null;

  const mfr = normalizeImplantManufacturerKey(implantManufacturer);
  if (mfr) {
    filter.$and = [
      {
        $or: [
          { "caseInfos.hexVerificationSampleManufacturer": mfr },
          { "caseInfos.implantManufacturer": mfr },
          // 한글/별칭 원문도 허용
          {
            "caseInfos.hexVerificationSampleManufacturer": String(
              implantManufacturer || "",
            ).trim(),
          },
          {
            "caseInfos.implantManufacturer": String(
              implantManufacturer || "",
            ).trim(),
          },
        ],
      },
    ];
  }
  return filter;
};

/**
 * 확인용 샘플 생성 자격.
 * SSOT: ExoCAD 3.0 이하 + 해당 임플란트 제조사 verifiedHex 미확정 + 활성 샘플 없음.
 * @returns {Promise<boolean>}
 */
export async function isHexVerificationSamplePendingEligible({
  userId,
  businessAnchorId,
  session = null,
  designSoftware = null,
  exoCadVersion = null,
  implantManufacturer = null,
}) {
  const { uid, bid } = resolveOwnerIds({ userId, businessAnchorId });
  const swHint = String(designSoftware || "").trim();
  const mfr = String(implantManufacturer || "").trim();
  if (!mfr) return false;

  let userRs = null;
  if (uid && Types.ObjectId.isValid(uid)) {
    const user = await User.findById(uid)
      .select({
        "requestSettings.designSoftware": 1,
        "requestSettings.exoCadVersion": 1,
        "requestSettings.hexVerificationResultHex": 1,
        "requestSettings.hexByImplantManufacturer": 1,
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
        "requestSettings.exoCadVersion": 1,
        "requestSettings.hexVerificationResultHex": 1,
        "requestSettings.hexByImplantManufacturer": 1,
      })
      .session(session)
      .lean();
    anchorRs = anchor?.requestSettings || null;
  }

  const effectiveDesign =
    swHint ||
    String(userRs?.designSoftware || "").trim() ||
    String(anchorRs?.designSoftware || "").trim();
  const effectiveExo =
    normalizeExoCadVersion(exoCadVersion) ||
    normalizeExoCadVersion(userRs?.exoCadVersion) ||
    normalizeExoCadVersion(anchorRs?.exoCadVersion);

  if (
    !isHexVerificationPending({
      designSoftware: effectiveDesign,
      exoCadVersion: effectiveExo,
      implantManufacturer: mfr,
      userRequestSettings: userRs,
      anchorRequestSettings: anchorRs,
    })
  ) {
    return false;
  }

  const activeFilter = buildActiveHexSampleFilter({
    uid,
    bid,
    implantManufacturer: mfr,
  });
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
    hexVerificationSampleManufacturer:
      normalizeImplantManufacturerKey(
        sourceRequest?.caseInfos?.implantManufacturer,
      ) ||
      String(sourceRequest?.caseInfos?.implantManufacturer || "").trim() ||
      undefined,
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
      // value는 ensureLotNumberForMachining에서 발급. null을 넣으면 sparse unique에 걸려 저장 실패한다.
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
  // 수동 샘플 복사와 동일: PTX 디자인 대기(shouldAssignLotNumberOnReady=false)여도 로트를 즉시 발급한다.
  await ensureLotNumberForMachining(clonedRequest);
  await clonedRequest.save(session ? { session } : undefined);

  // mongoose subdoc default/스프레드로 `{ uploadedAt }`만 남으면
  // resolveFilledStlFile·BG 복사가 스텁에 가려질 수 있어 비어 있으면 제거한다.
  const savedFilled = resolveFilledStlFile(clonedRequest.caseInfos);
  if (!String(savedFilled?.s3Key || "").trim()) {
    await Request.updateOne(
      { _id: clonedRequest._id },
      { $unset: { "caseInfos.stlFile": 1, "caseInfos.camFile": 1 } },
      session ? { session } : undefined,
    );
    if (clonedRequest.caseInfos) {
      clonedRequest.caseInfos.stlFile = undefined;
      clonedRequest.caseInfos.camFile = undefined;
    }
  }

  return clonedRequest;
}

/**
 * ExoCAD 헥스 미확정 제조사마다 확인용 복사샘플 1건 생성.
 * 배치에 제조사가 여러 개면 제조사당 첫 원본만 복제. 이미 활성 샘플이 있으면 스킵.
 * @returns {Promise<object[]>} 생성된 샘플 Request 목록
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
  if (list.length === 0) return [];

  /** @type {Map<string, object>} */
  const firstByManufacturer = new Map();
  for (const req of list) {
    if (req?.caseInfos?.hexVerificationSample === true) continue;
    if (String(req?.manufacturerStage || "").trim() === "취소") continue;
    const mfrKey = normalizeImplantManufacturerKey(
      req?.caseInfos?.implantManufacturer,
    );
    if (!mfrKey || firstByManufacturer.has(mfrKey)) continue;
    firstByManufacturer.set(mfrKey, req);
  }
  if (firstByManufacturer.size === 0) return [];

  const createdSamples = [];
  for (const [mfrKey, sourceReq] of firstByManufacturer) {
    try {
      const designSoftware = String(
        sourceReq?.caseInfos?.designSoftware || "",
      ).trim();
      const exoCadVersion = sourceReq?.caseInfos?.exoCadVersion || null;
      const implantManufacturer = String(
        sourceReq?.caseInfos?.implantManufacturer || mfrKey,
      ).trim();

      const pending = await isHexVerificationSamplePendingEligible({
        userId,
        businessAnchorId,
        session,
        designSoftware,
        exoCadVersion,
        implantManufacturer,
      });
      if (!pending) continue;

      const created = await createHexVerificationSampleClone({
        sourceRequest: sourceReq,
        actorUserId: actorUserId || userId,
        session,
      });
      if (!created) continue;

      // 원본 Rhino가 샘플보다 먼저 끝났으면 생성 직후 filled STL을 바로 복사한다.
      try {
        const sourceId = sourceReq?._id || sourceReq?.id;
        const freshSource = sourceId
          ? await Request.findById(sourceId).session(session || null)
          : null;
        if (freshSource) {
          await copyFilledStlToHexVerificationSamples(freshSource);
          const refreshed = await Request.findById(created._id).session(
            session || null,
          );
          createdSamples.push(refreshed || created);
          continue;
        }
      } catch (copyErr) {
        console.warn(
          "[maybeCreateHexVerificationSampleForFirstOrder] copy filled STL failed",
          {
            manufacturer: mfrKey,
            message: copyErr?.message || copyErr,
          },
        );
      }
      createdSamples.push(created);
    } catch (createErr) {
      // 한 제조사 실패(로트 unique 등)가 배치 내 다른 미확정 제조사 생성을 막지 않게 한다.
      console.warn(
        "[maybeCreateHexVerificationSampleForFirstOrder] create failed",
        {
          manufacturer: mfrKey,
          sourceRequestId: sourceReq?.requestId || null,
          message: createErr?.message || createErr,
        },
      );
    }
  }

  return createdSamples;
}

/**
 * 준비 목록용: 미확정 제조사인데 확인용 샘플이 없으면 생성한다.
 * (PTX lot 버그·이미 생성된 relatedRequestIds 등으로 누락된 건 보정)
 * 호출측은 fire-and-forget + 소켓 갱신을 권장(목록 응답을 막지 않음).
 * @param {object[]} requests lean request list (준비 단계)
 * @returns {Promise<object[]>} 새로 생성된 샘플
 */
export async function ensureMissingHexVerificationSamplesInReadyList(
  requests,
) {
  if (!Array.isArray(requests) || requests.length === 0) return [];

  /** @type {Map<string, { userId: string, businessAnchorId: string, sources: object[] }>} */
  const byOwner = new Map();
  for (const req of requests) {
    if (!req) continue;
    if (req?.caseInfos?.hexVerificationSample === true) continue;
    if (String(req?.manufacturerStage || "").trim() === "취소") continue;
    if (String(req?.caseInfos?.designSoftware || "").trim() !== "ExoCAD") {
      continue;
    }
    const mfr = normalizeImplantManufacturerKey(
      req?.caseInfos?.implantManufacturer,
    );
    if (!mfr) continue;

    const uid = String(
      req?.requestor?._id || req?.requestor || "",
    ).trim();
    const bid = String(
      req?.businessAnchorId?._id ||
        req?.businessAnchorId ||
        req?.requestor?.businessAnchorId ||
        "",
    ).trim();
    const ownerKey = `${uid}|${bid}`;
    if (!byOwner.has(ownerKey)) {
      byOwner.set(ownerKey, {
        userId: uid,
        businessAnchorId: bid,
        sources: [],
      });
    }
    byOwner.get(ownerKey).sources.push(req);
  }
  if (byOwner.size === 0) return [];

  const createdAll = [];
  for (const group of byOwner.values()) {
    try {
      const created = await maybeCreateHexVerificationSampleForFirstOrder({
        sourceRequests: group.sources,
        userId: group.userId || null,
        businessAnchorId: group.businessAnchorId || null,
        actorUserId: group.userId || null,
      });
      if (Array.isArray(created) && created.length > 0) {
        createdAll.push(...created);
      }
    } catch (err) {
      console.warn(
        "[ensureMissingHexVerificationSamplesInReadyList] failed",
        {
          userId: group.userId || null,
          businessAnchorId: group.businessAnchorId || null,
          message: err?.message || String(err || ""),
        },
      );
    }
  }
  return createdAll;
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

  // 원본이 camFile만 채워진 레거시 콜백이면 stlFile SSOT도 맞춘다.
  if (
    sourceRequest?.caseInfos &&
    typeof sourceRequest.save === "function" &&
    !String(sourceRequest.caseInfos?.stlFile?.s3Key || "").trim()
  ) {
    applyFilledStlFileToCaseInfos(sourceRequest.caseInfos, cloneJson(filledStl));
    sourceRequest.markModified("caseInfos");
    try {
      await sourceRequest.save();
    } catch (healErr) {
      console.warn(
        "[copyFilledStlToHexVerificationSamples] source dual-write heal failed",
        healErr?.message || healErr,
      );
    }
  }

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

/**
 * 워크시트 준비 목록용: 헥스 확인 샘플에 filled STL이 없으면 원본에서 복사한다.
 * Rhino 콜백이 다른 백엔드 인스턴스로 가 filled 복사만 빠진 경우를 보정한다.
 * @param {object[]} requests lean request list
 * @returns {Promise<object[]>}
 */
export async function backfillMissingFilledStlOnHexSamplesInList(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return requests;

  const needy = requests.filter((r) => {
    if (r?.caseInfos?.hexVerificationSample !== true) return false;
    if (String(r?.manufacturerStage || "").trim() === "취소") return false;
    return !String(resolveFilledStlFile(r?.caseInfos)?.s3Key || "").trim();
  });
  if (!needy.length) return requests;

  const sourceIds = new Set();
  for (const sample of needy) {
    for (const ref of Array.isArray(sample.referenceIds)
      ? sample.referenceIds
      : []) {
      const id = String(ref || "").trim();
      if (id) sourceIds.add(id);
    }
  }
  if (!sourceIds.size) return requests;

  const sources = await Request.find({
    requestId: { $in: Array.from(sourceIds) },
    manufacturerStage: { $nin: ["취소"] },
  });
  if (!sources.length) return requests;

  const updatedByRequestId = new Map();
  for (const source of sources) {
    try {
      const copied = await copyFilledStlToHexVerificationSamples(source);
      for (const sample of copied) {
        const rid = String(sample?.requestId || "").trim();
        if (!rid) continue;
        updatedByRequestId.set(
          rid,
          typeof sample.toObject === "function" ? sample.toObject() : sample,
        );
      }
    } catch (err) {
      console.warn(
        "[backfillMissingFilledStlOnHexSamplesInList] failed",
        {
          sourceRequestId: source?.requestId || null,
          message: err?.message || String(err || ""),
        },
      );
    }
  }

  if (!updatedByRequestId.size) return requests;

  return requests.map((row) => {
    const rid = String(row?.requestId || "").trim();
    const patched = updatedByRequestId.get(rid);
    if (!patched) return row;
    return {
      ...row,
      caseInfos: patched.caseInfos || row.caseInfos,
    };
  });
}
