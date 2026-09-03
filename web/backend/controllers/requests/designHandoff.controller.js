// - 2026-09-03: handoff — 기존 designSourceFiles(구강스캔) 보존·비STL 거부. 완료 후 헥스 샘플 생성.
// - 2026-09-03: handoff/cancel — relatedRequestIds에 없는 헥스 확인용 복사샘플도 원본과 함께 취소.
// - 2026-09-03: PTX handoff critical path — holdFast 재견적(리드타임 스케줄 생략) + labMeta/풀스케줄/미러는 응답 후.
// - 2026-09-03: PTX handoff — hold+lot+save만 응답 전. Transfer 미러·lab confirm·Rhino·emit은 응답 후.
//   labMeta.labOrg를 reprice에 재사용. phase timing 로그.
// - 2026-09-03: PTX 핸드오프 헥스 스탬프 — case implantManufacturer로 기공소 hexByImplantManufacturer 시드(from-draft 동일).
// - 2026-09-02: PTX handoff — Rhino 필드·재견적을 병렬(응답 전 대기 단축). S3 재업로드 없음.
// - 2026-09-02: handoff/cancel — Transfer 1회 조회·형제 취소 병렬·디자인비 grant/revoke 응답 후 처리.
// - 2026-08-31: PTX CA 생산·배송 크레딧 hold를 design-handoff로 이동(수락 시 보류 제거). 취소 시 hold 해제.
// - 2026-08-26: PTX 디자인 핸드오프 → 제조사 준비 진입 시 관리자 의뢰 배지 +1.
// - 2026-08-22: 구강스캔 없는 PTX — designSourceFiles 없어도 취소·재업로드(어벗 STL 클리어).
// - 2026-08-22: design_custom_abutment 레거시. 핸드오프는 PTX(labDesigned)·레거시 mode. 취소 복원은 custom_abutment.
// - 2026-08-21: 디자인 미러 성공 시에만 컨펌 채팅·practice:transfer-updated(치과 상세 작업파일/컨펌 CTA).
// - 2026-08-21: 구강스캔으로(PTX) 핸드오프 시 skipDesignConfirm 강제 true 제거 — 치과 설정 존중·컨펌 채팅.
// - 2026-08-21: 치과 디자인 컨펌이 필요할 때만 채팅 시스템 메시지(awaiting_design_confirm).
// - 2026-08-18: 제조사 준비 큐 진입(생산 승격) 시 로트번호(3글자)를 발급한다.
// - 2026-08-16: 다치아 생산 취소 시 연동 Request 전원 구강스캔 복원.
// - 2026-08-16: 생산 취소 가드 — stage뿐 아니라 actualCamStart(가공 진입 중)도 차단.
// - 2026-08-16: PTX 핸드오프 시 기공소 designSoftware·아노다이징·헥스·유지홈을 Request에 스탬프.
// - 2026-08-16: 어벗디자인 취소·재업로드 시 requestor 대시보드 스냅샷 갱신(준비 카운트 stale 방지).
// - 2026-08-16: 핸드오프 시 retentionGroove·환자/임플란트 caseInfos 패치 허용(기공소 3D 확인).
// - 2026-08-16: 생산 취소 시 PTX Request manufacturerStage→취소(관리자 준비 잔존 방지). 재업로드 시 준비 복원.
// - 2026-08-16: 디자인 없이 완료 플래그만 남은 건도 cancel로 스테이지 재오픈.
// - 2026-08-16: 생산 취소 시 PTX 작업완료/결과파일도 열어 의뢰수락 UI 복원(에스크로·정산은 유지).
// - 2026-08-16: PTX 핸드오프 — hex/PRC 시드 + Rhino filled STL 트리거(request-meta 파라미터 누락 보완).
// - 2026-08-15: PTX 핸드오프 — productMode를 custom_abutment로 승격(제조사 CNC 준비 큐 노출). 취소 시 복원.
// - 2026-08-15: PTX 핸드오프 — Request 저장 후 Transfer 미러. 취소는 orphan designFiles도 정리.
// - 2026-08-15: 취소·핸드오프 — transfer.targetLabAnchorId로 수락 lab 판정(소유 어긋남 보정).
// - 2026-08-15: PTX — 업로드 시 생산만 재견적·출고재계산, 준비 유지. 취소·재업로드(준비만).
// - 2026-08-15: PTX 수락 기공소는 design-claim 없이 핸드오프(카드 업로드). internalLab 허용.
// - 2026-08-15: PTX 연동은 수락 기공소 디자인 → 업로드 즉시 제조 착수 + 어벗디자인비 지급.
// - 2026-08-15: PTX 연동 의뢰는 디자인 STL만 저장·미러하고 가공 진입은 기공소/치과 컨펌 후.
// - 2026-08-10: 디자인 완료 어벗 STL 업로드 → 동일 Request 제조사 가공 핸드오프.
// related files:
// - web/backend/utils/designClaim.js
// - web/backend/utils/designAccess.js
// - web/backend/models/request.model.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/utils.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/services/practiceTransferBilling.service.js
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import User from "../../models/user.model.js";
import { clearFilledStlFileOnCaseInfos, applyStlPreloadCancelledOnRequest } from "../../utils/filledStlFile.js";
import {
  canClaimOrHandoffDesignRequest,
  isAcceptingLabForPtxDesignRequest,
} from "../../utils/designAccess.js";
import { isDesignClaimActive } from "../../utils/designClaim.js";
import { updateReviewStatusByStage } from "./common.review.controller.js";
import {
  isAbutmentRequestPastReadyForCancel,
  loadLabRequestMetaForProduction,
  mirrorDesignFileToPracticeTransfer,
  repriceAndReschedulePtxAbutmentRequest,
  resolveHexRotationByDesignSoftware,
  resolveLabManufacturerHexForImplant,
} from "../../services/practiceTransferProduction.service.js";
import {
  findActiveHexVerificationSampleObjectIdsForSources,
  maybeCreateHexVerificationSampleForFirstOrder,
} from "../../services/hexVerificationSample.service.js";
import { isPtxLabDesignedAbutmentRequest } from "./common.review.helpers.js";
import { postPracticeTransferSystemChatMessage } from "../../services/chatSystemMessage.service.js";
import {
  grantAbutmentDesignLabFee,
  revokeAbutmentDesignLabFee,
} from "../../services/practiceTransferBilling.service.js";
import {
  holdRequestCreditsOnSubmit,
  releaseRequestCreditHoldsOnCancel,
} from "../../services/requestCreditHold.service.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";
import { resolvePrcFileNames } from "./prcMapping.utils.js";
import { triggerRhinoProcessFileForRequest } from "../rhino/rhino.controller.js";
import { ensureLotNumberOnReadyEnter } from "./utils.js";

/** PTX CA(어벗 생산) — 기공소 실크레딧 부족 (수락→디자인 업로드 시점) */
const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";
const PTX_CA_INSUFFICIENT_CREDIT_MESSAGE =
  "커스텀어벗 생산은 유료/무료 크레딧으로 결제됩니다. 데모 크레딧은 사용할 수 없습니다. 충전 후 디자인을 다시 업로드해 주세요.";

function isPtxCaInsufficientCreditError(err) {
  const reason = String(err?.payload?.reason || err?.code || "").trim();
  const status = Number(err?.statusCode || 0);
  return (
    status === 402 ||
    reason === "insufficient_credit_for_hold" ||
    reason === PTX_CA_INSUFFICIENT_CREDIT_REASON ||
    reason === "insufficient_lab_credit_for_abuts_shipping"
  );
}

function rejectPtxCaInsufficientCredit(res, err) {
  const status = Number(err?.statusCode || 402);
  const reason = String(err?.payload?.reason || err?.code || "").trim();
  const rawMsg = String(err?.message || "").trim();
  const useCanonical =
    !rawMsg ||
    reason === "insufficient_credit_for_hold" ||
    reason === PTX_CA_INSUFFICIENT_CREDIT_REASON ||
    rawMsg.includes("크레딧이 부족");
  return res.status(status >= 400 && status < 600 ? status : 402).json({
    success: false,
    message: useCanonical ? PTX_CA_INSUFFICIENT_CREDIT_MESSAGE : rawMsg,
    reason: PTX_CA_INSUFFICIENT_CREDIT_REASON,
    ...(err?.payload && typeof err.payload === "object" ? err.payload : {}),
  });
}
/** 치과 발신 FE — 디자인 미러 후 의뢰상세 작업파일·컨펌 CTA 갱신 */
const emitAbutmentDesignReadyToPractice = async (transferDoc) => {
  try {
    if (!transferDoc?._id) return;
    const practiceAnchorId = String(
      transferDoc.practiceBusinessAnchorId || "",
    ).trim();
    const practiceUserId = String(transferDoc.practiceUserId || "").trim();
    const userIdSet = new Set();
    if (practiceUserId && Types.ObjectId.isValid(practiceUserId)) {
      userIdSet.add(practiceUserId);
    }
    if (practiceAnchorId && Types.ObjectId.isValid(practiceAnchorId)) {
      const peers = await User.find({
        businessAnchorId: new Types.ObjectId(practiceAnchorId),
        role: { $in: ["practice", "requestor"] },
        active: true,
      })
        .select({ _id: 1 })
        .lean();
      for (const peer of peers) {
        const id = String(peer?._id || "").trim();
        if (id) userIdSet.add(id);
      }
    }
    if (!userIdSet.size) return;

    const payload = {
      action: "abutment-design-ready",
      transferId: String(transferDoc.transferId || "").trim(),
      transferMongoId: String(transferDoc._id || "").trim(),
      updatedAt: new Date(),
    };
    userIdSet.forEach((id) => {
      emitAppEventToUser(id, "practice:transfer-updated", payload);
    });
  } catch (err) {
    console.warn(
      "[DESIGN_HANDOFF] abutment-design-ready emit failed",
      err?.message || err,
    );
  }
};

const PRODUCT_MODE_DESIGN = "design_custom_abutment"; // 레거시 문서 읽기 전용
const PRODUCT_MODE_PRODUCTION = "custom_abutment";

/** 핸드오프 가능: 레거시 디자인+생산 mode 또는 PTX 수주 기공소 디자인 */
function canDesignHandoffRequest(request) {
  const productMode = String(request?.caseInfos?.productMode || "").trim();
  if (productMode === PRODUCT_MODE_DESIGN) return true;
  return isPtxLabDesignedAbutmentRequest(request);
}
const DEFAULT_HEX_ROTATION = "STL모델대로";

/** 기공소 대시보드「어벗 > 준비」스냅샷 — 취소/재업로드 직후 stale 방지 */
const refreshLabDashboardAfterPtxDesignChange = (anchorId, reason) => {
  const id = String(anchorId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return;
  triggerDashboardSummaryRefreshForAnchorId(id, reason).catch((err) => {
    console.error(
      `[DESIGN_HANDOFF] dashboard refresh failed (${reason})`,
      err,
    );
  });
};

const normalizeRetentionGrooveOrNull = (value) => {
  const rg = String(value || "")
    .trim()
    .toLowerCase();
  if (rg === "deep") return "deep";
  if (rg === "none" || rg === "shallow") return "none";
  return null;
};

const pickTrimmed = (value, maxLen = 120) => {
  const v = String(value || "").trim();
  if (!v) return "";
  return v.slice(0, maxLen);
};

const buildRhinoInputFileName = (request) => {
  const requestId = String(request?.requestId || "").trim();
  const ci = request?.caseInfos || {};
  const original = String(
    ci?.file?.filePath || ci?.file?.originalName || "",
  ).trim();
  const ext = original.includes(".")
    ? `.${original.split(".").pop()?.toLowerCase() || "stl"}`
    : ".stl";
  if (!requestId) return original || "";
  return `${requestId}-${String(ci.clinicName || "").trim()}-${String(ci.patientName || "").trim()}-${String(ci.tooth || "").trim()}${ext}`;
};

const ensurePtxProductionRhinoReadyFields = async (
  request,
  { resolvePrc = true } = {},
) => {
  if (!request.caseInfos) request.caseInfos = {};
  if (!request.rnd) request.rnd = {};

  // 이미 case별 시드된 헥스를 우선. designSoftware 폴백으로 덮어쓰지 않음.
  const existingHex =
    String(request.caseInfos?.hexRotation?.mode || "").trim() ||
    String(request.rnd.manufacturerHexRotation || "").trim() ||
    String(request.caseInfos.manufacturerHexRotation || "").trim() ||
    String(request.caseInfos.finalHexRotation || "").trim() ||
    String(request.caseInfos.requestorHexRotation || "").trim();

  const designSoftware = String(request.caseInfos.designSoftware || "").trim();
  const designSoftwareHex = designSoftware
    ? resolveHexRotationByDesignSoftware(
        designSoftware,
        request.caseInfos?.exoCadVersion,
      )
    : "";

  const hex =
    existingHex || designSoftwareHex || DEFAULT_HEX_ROTATION;
  request.rnd.manufacturerHexRotation = hex;
  request.caseInfos.manufacturerHexRotation = hex;
  request.caseInfos.finalHexRotation = hex;
  request.caseInfos.requestorHexRotation = hex;
  const prevHexRotation =
    request.caseInfos.hexRotation &&
    typeof request.caseInfos.hexRotation === "object"
      ? request.caseInfos.hexRotation
      : {};
  request.caseInfos.hexRotation = {
    ...prevHexRotation,
    mode: hex,
  };

  if (
    resolvePrc &&
    (!String(request.caseInfos.faceHolePrcFileName || "").trim() ||
      !String(request.caseInfos.connectionPrcFileName || "").trim())
  ) {
    try {
      const prc = await resolvePrcFileNames(request.caseInfos);
      if (prc.faceHolePrcFileName) {
        request.caseInfos.faceHolePrcFileName = prc.faceHolePrcFileName;
      }
      if (prc.connectionPrcFileName) {
        request.caseInfos.connectionPrcFileName = prc.connectionPrcFileName;
      }
    } catch (e) {
      console.warn(
        "[DESIGN_HANDOFF] PRC resolve failed",
        e?.message || e,
      );
    }
  }

  const standardName = buildRhinoInputFileName(request);
  if (standardName && request.caseInfos.file) {
    request.caseInfos.file.filePath = standardName;
  }
  return standardName;
};

/** 응답 후 PRC 시드 + Request patch (제조사/Rhino용). */
const seedPrcFieldsAfterHandoff = async (request) => {
  if (!request?.caseInfos) return false;
  if (
    String(request.caseInfos.faceHolePrcFileName || "").trim() &&
    String(request.caseInfos.connectionPrcFileName || "").trim()
  ) {
    return false;
  }
  try {
    const prc = await resolvePrcFileNames(request.caseInfos);
    const $set = {};
    if (prc.faceHolePrcFileName) {
      request.caseInfos.faceHolePrcFileName = prc.faceHolePrcFileName;
      $set["caseInfos.faceHolePrcFileName"] = prc.faceHolePrcFileName;
    }
    if (prc.connectionPrcFileName) {
      request.caseInfos.connectionPrcFileName = prc.connectionPrcFileName;
      $set["caseInfos.connectionPrcFileName"] = prc.connectionPrcFileName;
    }
    if (Object.keys($set).length && request._id) {
      await Request.updateOne({ _id: request._id }, { $set });
      return true;
    }
  } catch (e) {
    console.warn("[DESIGN_HANDOFF] PRC resolve(after) failed", e?.message || e);
  }
  return false;
};

const healRequestOwnershipToAcceptingLab = (request, transferTargetLabAnchorId) => {
  const transferLab = String(transferTargetLabAnchorId || "").trim();
  if (!transferLab || !Types.ObjectId.isValid(transferLab)) return false;
  const current = String(request?.businessAnchorId || "").trim();
  if (current === transferLab) return false;
  request.businessAnchorId = new Types.ObjectId(transferLab);
  return true;
};

const toStoredFileMeta = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const s3Key = String(raw.s3Key || "").trim();
  if (!s3Key) return null;
  return {
    originalName:
      String(raw.originalName || raw.fileName || "").trim() || "file.stl",
    fileType: String(raw.mimetype || raw.fileType || "application/octet-stream").trim(),
    fileSize: Number(raw.size ?? raw.fileSize ?? 0) || 0,
    filePath: undefined,
    s3Key,
    s3Url: String(raw.s3Url || raw.location || "").trim() || undefined,
    uploadedAt: raw.uploadedAt ? new Date(raw.uploadedAt) : new Date(),
  };
};

/**
 * PTX 디자인 미러 + (제조 준비 중이면) 작업완료 스테이지를 다시 연다.
 * - 디자인 파일·컨펌·생산시작 플래그 비움
 * - resultFiles / autoMatch.completed* / production.confirmed* 비움 → UI 뱃지「의뢰수락」
 * - billing.settledAt·에스크로 원장은 건드리지 않음(이미 지급된 기공비는 유지; 재완료 시 별도 경로)
 */
const clearPtxDesignMirror = async (transferId) => {
  if (!transferId || !Types.ObjectId.isValid(String(transferId))) return;
  await PracticeTransfer.updateOne(
    { _id: transferId },
    {
      $set: {
        "production.designFiles": [],
        resultFiles: [],
      },
      $unset: {
        "production.designReadyAt": "",
        "production.labDesignConfirmedAt": "",
        "production.labDesignConfirmedBy": "",
        "production.abutmentProductionStartedAt": "",
        "production.confirmedAt": "",
        "production.confirmedBy": "",
        "autoMatch.completedAt": "",
        "autoMatch.completedBy": "",
      },
    },
  );
};

/**
 * PTX 생산 취소: 연동 CA Request들을 관리자·제조사 큐에서 「취소」로 내린다.
 * 다치아: 각 Request의 구강스캔(designSourceFiles)도 복원해 재업로드 가능하게 한다.
 * 헥스 확인용 복사샘플은 relatedRequestIds에 없으므로 referenceIds로 별도 수집해 함께 취소한다.
 * @param {object} [options]
 * @param {string[]} [options.relatedRequestIds] — 이미 조회한 id(재조회 생략)
 * @param {Set<string>|string[]} [options.skipRequestIds] — 이미 처리한 Request(중복 save 방지)
 */
const applyPtxDesignCancelFields = (request) => {
  const sourceRows = Array.isArray(request.caseInfos?.designSourceFiles)
    ? request.caseInfos.designSourceFiles.map(toStoredFileMeta).filter(Boolean)
    : [];
  const restorePrimary = sourceRows[0] || null;
  if (!request.caseInfos) request.caseInfos = {};
  if (restorePrimary?.s3Key) {
    request.caseInfos.file = restorePrimary;
    request.caseInfos.files = sourceRows.slice(1);
    request.caseInfos.designSourceFiles = [];
    clearFilledStlFileOnCaseInfos(request.caseInfos); // stlFile + legacy camFile
    request.caseInfos.ncFile = undefined;
  } else if (request.designCompletedAt) {
    // 구강스캔 없이 디자인만 올린 CA — primary(어벗 STL) 클리어 후 재업로드
    request.caseInfos.file = undefined;
    request.caseInfos.files = [];
    request.caseInfos.designSourceFiles = [];
    clearFilledStlFileOnCaseInfos(request.caseInfos);
    request.caseInfos.ncFile = undefined;
  }
  request.caseInfos.productMode = PRODUCT_MODE_PRODUCTION;
  request.designCompletedAt = undefined;
  request.designCompletedBy = undefined;
  request.manufacturerStage = "취소";
  applyStlPreloadCancelledOnRequest(request, "request_cancelled");
};

const markPtxRelatedRequestsCancelled = async (transferId, options = {}) => {
  if (!transferId || !Types.ObjectId.isValid(String(transferId))) {
    return { modifiedCount: 0 };
  }
  const skipSet = new Set(
    (Array.isArray(options.skipRequestIds)
      ? options.skipRequestIds
      : options.skipRequestIds
        ? Array.from(options.skipRequestIds)
        : []
    )
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  let idStrings = Array.isArray(options.relatedRequestIds)
    ? options.relatedRequestIds
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : null;
  if (!idStrings) {
    const transferDoc = await PracticeTransfer.findById(transferId)
      .select({ "production.relatedRequestIds": 1 })
      .lean();
    idStrings = (
      Array.isArray(transferDoc?.production?.relatedRequestIds)
        ? transferDoc.production.relatedRequestIds
        : []
    )
      .map((id) => String(id || "").trim())
      .filter((id) => Types.ObjectId.isValid(id));
  }

  // 헥스 샘플은 relatedRequestIds에 없음 → 원본(+이미 취소한 primary) requestId로 조회.
  const sourceIdsForHex = [
    ...new Set([...idStrings, ...skipSet].filter((id) => Types.ObjectId.isValid(id))),
  ];
  let hexSampleIdStrings = [];
  if (sourceIdsForHex.length > 0) {
    try {
      const sampleOids =
        await findActiveHexVerificationSampleObjectIdsForSources(sourceIdsForHex);
      hexSampleIdStrings = (sampleOids || [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id) && !skipSet.has(id));
    } catch (sampleLookupErr) {
      console.warn(
        "[DESIGN_HANDOFF_CANCEL] hex sample lookup failed",
        sampleLookupErr?.message || sampleLookupErr,
      );
    }
  }

  const cancelIdStrings = [
    ...new Set([
      ...idStrings.filter((id) => !skipSet.has(id)),
      ...hexSampleIdStrings,
    ]),
  ];
  const ids = cancelIdStrings.map((id) => new Types.ObjectId(id));
  if (!ids.length) return { modifiedCount: 0 };

  const requests = await Request.find({ _id: { $in: ids } });
  const excludeSiblingIds = [
    ...new Set([...idStrings, ...skipSet, ...hexSampleIdStrings]),
  ];
  await Promise.all(
    requests.map(async (request) => {
      applyPtxDesignCancelFields(request);
      await request.save();
      // hold 해제는 UI 응답을 막지 않음
      void releaseRequestCreditHoldsOnCancel({
        request,
        excludeSiblingIds,
      }).catch((holdErr) => {
        console.warn(
          "[DESIGN_HANDOFF_CANCEL] credit hold release failed",
          String(request?._id || ""),
          holdErr?.message || holdErr,
        );
      });
    }),
  );
  return { modifiedCount: requests.length };
};

/**
 * POST /api/requests/:id/design-handoff
 * 완성 어벗 STL을 primary로 교체.
 * PTX 연동(수락 기공소): 미러 + lab confirm 자동 + 어벗디자인비 + 준비 큐 등록(가공은 제조사/CAM).
 * 비PTX: 기존처럼 제조사 가공 핸드오프.
 */
export async function handoffDesignToProduction(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin" && role !== "internalLab") {
      return res.status(403).json({
        success: false,
        message: "디자인 핸드오프는 지정 디자이너만 할 수 있습니다.",
      });
    }

    const userId = req.user?._id ? String(req.user._id) : "";
    if (!userId) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const bodyFile =
      req.body?.file && typeof req.body.file === "object"
        ? req.body.file
        : req.body;
    const nextPrimary = toStoredFileMeta(bodyFile);
    if (!nextPrimary) {
      return res.status(400).json({
        success: false,
        message: "완성 어벗 STL 파일(s3Key)이 필요합니다.",
      });
    }
    const nextNameLower = String(nextPrimary.originalName || "")
      .trim()
      .toLowerCase();
    const nextDot = nextNameLower.lastIndexOf(".");
    const nextExt = nextDot >= 0 ? nextNameLower.slice(nextDot) : "";
    if (nextExt !== ".stl") {
      return res.status(400).json({
        success: false,
        message:
          "어벗 디자인은 STL만 올릴 수 있습니다. PLY·OBJ 등 구강 스캔은 사용할 수 없습니다.",
      });
    }

    const caseInfosPatchRaw =
      req.body?.caseInfos && typeof req.body.caseInfos === "object"
        ? req.body.caseInfos
        : null;
    const hasCaseInfosPatch = Boolean(caseInfosPatchRaw);
    const retentionGrooveFromBody = normalizeRetentionGrooveOrNull(
      req.body?.retentionGroove ?? caseInfosPatchRaw?.retentionGroove,
    );

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const relatedTransferIdEarly = request?.partnerBilling?.relatedPracticeTransferId
      ? String(request.partnerBilling.relatedPracticeTransferId).trim()
      : "";
    let transferDocEarly = null;
    let transferTargetLabAnchorId = "";
    if (
      relatedTransferIdEarly &&
      Types.ObjectId.isValid(relatedTransferIdEarly)
    ) {
      transferDocEarly = await PracticeTransfer.findById(relatedTransferIdEarly);
      transferTargetLabAnchorId = String(
        transferDocEarly?.targetLabAnchorId || "",
      ).trim();
    }

    const allowed = await canClaimOrHandoffDesignRequest(
      req.user,
      request,
      relatedTransferIdEarly && Types.ObjectId.isValid(relatedTransferIdEarly)
        ? { transferTargetLabAnchorId }
        : {},
    );
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: request?.partnerBilling?.relatedPracticeTransferId
          ? "기공의뢰 커스텀어벗 디자인은 수락한 기공소만 할 수 있습니다."
          : "디자인 큐 접근 권한이 없습니다.",
      });
    }

    const productMode = String(request?.caseInfos?.productMode || "").trim();
    if (!canDesignHandoffRequest(request)) {
      return res.status(400).json({
        success: false,
        message:
          productMode === PRODUCT_MODE_PRODUCTION &&
          !isPtxLabDesignedAbutmentRequest(request)
            ? "생산만 의뢰는 디자인 핸드오프 대상이 아닙니다."
            : "디자인 핸드오프할 수 있는 의뢰가 아닙니다.",
      });
    }

    const handoffStage = String(request.manufacturerStage || "").trim();
    // 생산 취소(취소) 후 재업로드 허용 — 핸드오프 시 준비로 복원
    if (handoffStage !== "준비" && handoffStage !== "취소") {
      return res.status(400).json({
        success: false,
        message: "준비 단계 의뢰만 핸드오프할 수 있습니다.",
      });
    }
    if (handoffStage === "취소") {
      request.manufacturerStage = "준비";
    }

    // 수락 기공소(PTX)는 카드에서 바로 업로드 — 디자인 파트너 클레임 불필요.
    const acceptingLabPtx = isAcceptingLabForPtxDesignRequest(
      req.user,
      request,
      transferTargetLabAnchorId,
    );
    if (acceptingLabPtx) {
      healRequestOwnershipToAcceptingLab(request, transferTargetLabAnchorId);
    }
    const claimerId = request?.designClaim?.claimedBy
      ? String(request.designClaim.claimedBy)
      : "";
    if (
      role !== "admin" &&
      !acceptingLabPtx &&
      (!isDesignClaimActive(request.designClaim) ||
        !claimerId ||
        claimerId !== userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "수락한 디자이너만 승인할 수 있습니다. 먼저 「수락」으로 잡아 주세요.",
      });
    }

    if (!request.caseInfos) request.caseInfos = {};

    // 기공소 3D 확인 모달에서 caseInfos/유지홈을 넘긴 경우만 갱신·검증.
    // 디자인 파트너 등 기존 파일-only 핸드오프는 의뢰에 저장된 값을 유지한다.
    if (hasCaseInfosPatch || retentionGrooveFromBody) {
      const clinicName = pickTrimmed(
        caseInfosPatchRaw?.clinicName ?? request.caseInfos.clinicName,
      );
      const patientName = pickTrimmed(
        caseInfosPatchRaw?.patientName ?? request.caseInfos.patientName,
      );
      const tooth = pickTrimmed(
        caseInfosPatchRaw?.tooth ?? request.caseInfos.tooth,
        16,
      );
      const implantManufacturer = pickTrimmed(
        caseInfosPatchRaw?.implantManufacturer ??
          request.caseInfos.implantManufacturer,
      );
      const implantBrand = pickTrimmed(
        caseInfosPatchRaw?.implantBrand ?? request.caseInfos.implantBrand,
      );
      const implantFamily = pickTrimmed(
        caseInfosPatchRaw?.implantFamily ?? request.caseInfos.implantFamily,
      );
      const implantType = pickTrimmed(
        caseInfosPatchRaw?.implantType ?? request.caseInfos.implantType,
      );
      const retentionGroove =
        retentionGrooveFromBody ||
        normalizeRetentionGrooveOrNull(request.caseInfos.retentionGroove);

      if (
        !clinicName ||
        !patientName ||
        !tooth ||
        !implantManufacturer ||
        !implantBrand ||
        !implantFamily ||
        !implantType
      ) {
        return res.status(400).json({
          success: false,
          message:
            "치과명·환자명·치아번호·임플란트(Manufacturer/Brand/Family/Type)가 필요합니다.",
        });
      }
      if (!retentionGroove) {
        return res.status(400).json({
          success: false,
          message: "유지홈(없음/있음)을 선택해주세요.",
        });
      }

      request.caseInfos.clinicName = clinicName;
      request.caseInfos.patientName = patientName;
      request.caseInfos.tooth = tooth;
      request.caseInfos.implantManufacturer = implantManufacturer;
      request.caseInfos.implantBrand = implantBrand;
      request.caseInfos.implantFamily = implantFamily;
      request.caseInfos.implantType = implantType;
      request.caseInfos.retentionGroove = retentionGroove;
    }

    // 헥스·디자인SW 스탬프는 hold에 불필요 — 응답 후 labMeta로 처리(critical path ~1s 절감).
    const stampLabAnchorIdForLater =
      acceptingLabPtx
        ? String(transferTargetLabAnchorId || "").trim() ||
          String(request.businessAnchorId || "").trim()
        : "";

    const prevPrimary = toStoredFileMeta(request.caseInfos.file);
    const prevExtras = Array.isArray(request.caseInfos.files)
      ? request.caseInfos.files
      : [];
    const existingSources = Array.isArray(request.caseInfos.designSourceFiles)
      ? request.caseInfos.designSourceFiles
      : [];
    const sourceRows = [];
    const seen = new Set();
    for (const row of [
      ...existingSources.map(toStoredFileMeta),
      prevPrimary,
      ...prevExtras.map(toStoredFileMeta),
    ]) {
      if (!row?.s3Key || seen.has(row.s3Key)) continue;
      if (row.s3Key === nextPrimary.s3Key) continue;
      seen.add(row.s3Key);
      sourceRows.push(row);
    }

    request.caseInfos.designSourceFiles = sourceRows;
    request.caseInfos.files = sourceRows;
    request.caseInfos.file = nextPrimary;
    // 구강스캔 기준 filled STL(stlFile)/NC는 무효 — 완성 어벗으로 재생성
    clearFilledStlFileOnCaseInfos(request.caseInfos);
    request.caseInfos.ncFile = undefined;

    const labAnchorId = String(req.user?.businessAnchorId || "").trim();
    if (labAnchorId && Types.ObjectId.isValid(labAnchorId)) {
      request.designLabBusinessAnchorId = new Types.ObjectId(labAnchorId);
    }
    request.designCompletedBy = new Types.ObjectId(userId);
    request.designCompletedAt = new Date();

    const relatedTransferId = relatedTransferIdEarly;

    // PTX: Request(designCompletedAt) 먼저 저장 → Transfer 미러는 응답 후.
    // 미러를 먼저 쓰면 save 실패 시 UI만 디자인 있음·취소는 없음으로 갈라진다.
    if (relatedTransferId && Types.ObjectId.isValid(relatedTransferId)) {
      const handoffT0 = Date.now();
      const handoffTiming = {
        labMetaMs: 0,
        rhinoRepriceMs: 0,
        holdMs: 0,
        lotSaveMs: 0,
      };

      let transferDoc = transferDocEarly;
      const isAcceptingLab = isAcceptingLabForPtxDesignRequest(
        req.user,
        request,
        transferDoc?.targetLabAnchorId || transferTargetLabAnchorId,
      );
      const now = new Date();

      // 수락 기공소가 완성 STL을 올리면 디자인 큐가 아니라 제조사 CNC 준비 큐로 간다.
      // (WorksheetPage productModeNe=design_custom_abutment / 디자인 파트너 큐는 PTX 제외)
      if (!request.caseInfos) request.caseInfos = {};
      request.caseInfos.productMode = PRODUCT_MODE_PRODUCTION;
      // 헥스/파일명 시드(동기) + hold용 빠른 재견적(리드타임 스케줄 생략).
      const rhinoRepriceT0 = Date.now();
      const [rhinoFileName] = await Promise.all([
        ensurePtxProductionRhinoReadyFields(request, { resolvePrc: false }),
        transferDoc && isAcceptingLab
          ? repriceAndReschedulePtxAbutmentRequest({
              requestDoc: request,
              transferDoc,
              requestedAt: now,
              scheduleMode: "holdFast",
            })
          : Promise.resolve(null),
      ]);
      handoffTiming.rhinoRepriceMs = Date.now() - rhinoRepriceT0;

      // 생산·배송 보류: 디자인 업로드 시점(수락 시에는 잡지 않음). 이미 hold면 skip.
      const holdT0 = Date.now();
      try {
        await holdRequestCreditsOnSubmit({
          requests: [request],
          actorUserId: userId,
        });
      } catch (holdErr) {
        console.error(
          "[DESIGN_HANDOFF] PTX CA credit hold failed",
          holdErr?.message || holdErr,
        );
        // 아직 save 전 — designCompletedAt 등 in-memory만 되돌림
        request.designCompletedAt = undefined;
        request.designCompletedBy = undefined;
        if (isPtxCaInsufficientCreditError(holdErr)) {
          return rejectPtxCaInsufficientCredit(res, holdErr);
        }
        throw holdErr;
      }
      handoffTiming.holdMs = Date.now() - holdT0;

      const lotSaveT0 = Date.now();
      await ensureLotNumberOnReadyEnter(request);
      await request.save();
      handoffTiming.lotSaveMs = Date.now() - lotSaveT0;

      if (process.env.NODE_ENV !== "production") {
        console.log("[DESIGN_HANDOFF] timing", {
          dt: Date.now() - handoffT0,
          requestId: String(request._id),
          ...handoffTiming,
        });
      }

      // Critical path 끝 — FE 「처리 중」 해제. 미러·디자인비·Rhino·emit은 응답 후.
      res.status(200).json({
        success: true,
        message:
          "디자인 파일이 저장되었습니다. 제조사 준비 큐에 등록되었습니다.",
        data: {
          requestId: String(request._id),
          relatedPracticeTransferId: relatedTransferId,
          awaitingDesignConfirm: false,
          // 준비 유지 — 취소·재업로드 가능. 가공은 제조사/CAM.
          productionStarted: false,
          manufacturerStage: "준비",
          productMode: PRODUCT_MODE_PRODUCTION,
          shippingMode: request.shippingMode || null,
          price: request.price || null,
          abutmentDesignFee: null,
        },
      });

      // 어벗 STL 핸드오프 후에만 헥스 확인 샘플 생성(구강스캔 준비 건으로는 만들지 않음)
      void maybeCreateHexVerificationSampleForFirstOrder({
        sourceRequests: [request],
        userId:
          String(request.requestor || req.user?._id || "").trim() || userId,
        businessAnchorId: String(
          request.businessAnchorId || stampLabAnchorIdForLater || "",
        ).trim(),
        actorUserId: userId,
      }).catch((hexErr) => {
        console.warn(
          "[DESIGN_HANDOFF] hex verification sample ensure failed",
          hexErr?.message || hexErr,
        );
      });

      const priorDesignCount = Array.isArray(transferDoc?.production?.designFiles)
        ? transferDoc.production.designFiles.length
        : 0;
      const labConfirmPayload =
        transferDoc && isAcceptingLab
          ? {
              at: transferDoc.production?.labDesignConfirmedAt || now,
              by:
                transferDoc.production?.labDesignConfirmedBy ||
                req.user?._id ||
                null,
            }
          : null;
      // hold 박스 키와 맞추기 위해 estimatedShipYmd는 holdFast 값을 유지
      const heldEstimatedShipYmd = String(
        request?.timeline?.estimatedShipYmd || "",
      ).trim();

      void (async () => {
        try {
          // 헥스/디자인SW 스탬프 + 풀 생산 스케줄(리드타임) — hold 이후 보정
          if (stampLabAnchorIdForLater) {
            try {
              const labMeta = await loadLabRequestMetaForProduction({
                labAnchorId: stampLabAnchorIdForLater,
                labUserId: userId,
              });
              const $set = {};
              if (labMeta.designSoftware) {
                const implantManufacturerForHex = String(
                  request.caseInfos?.implantManufacturer || "",
                ).trim();
                const manufacturerHexRotation = resolveLabManufacturerHexForImplant(
                  labMeta,
                  implantManufacturerForHex || null,
                );
                $set["caseInfos.designSoftware"] = labMeta.designSoftware;
                if (labMeta.exoCadVersion) {
                  $set["caseInfos.exoCadVersion"] = labMeta.exoCadVersion;
                }
                $set["caseInfos.requestorHexRotation"] = manufacturerHexRotation;
                $set["caseInfos.manufacturerHexRotation"] = manufacturerHexRotation;
                $set["caseInfos.finalHexRotation"] = manufacturerHexRotation;
                $set["caseInfos.hexRotation.mode"] = manufacturerHexRotation;
                $set["rnd.manufacturerHexRotation"] = manufacturerHexRotation;
                request.caseInfos.designSoftware = labMeta.designSoftware;
                if (labMeta.exoCadVersion) {
                  request.caseInfos.exoCadVersion = labMeta.exoCadVersion;
                }
                request.caseInfos.requestorHexRotation = manufacturerHexRotation;
                request.caseInfos.manufacturerHexRotation = manufacturerHexRotation;
                request.caseInfos.finalHexRotation = manufacturerHexRotation;
                if (!request.rnd) request.rnd = {};
                request.rnd.manufacturerHexRotation = manufacturerHexRotation;
              }
              if (typeof labMeta.anodizingEnabled === "boolean") {
                $set["caseInfos.anodizingEnabled"] = labMeta.anodizingEnabled;
                request.caseInfos.anodizingEnabled = labMeta.anodizingEnabled;
              }
              if (
                !normalizeRetentionGrooveOrNull(request.caseInfos.retentionGroove) &&
                labMeta.retentionGroove
              ) {
                $set["caseInfos.retentionGroove"] = labMeta.retentionGroove;
                request.caseInfos.retentionGroove = labMeta.retentionGroove;
              }

              if (transferDoc && isAcceptingLab) {
                await repriceAndReschedulePtxAbutmentRequest({
                  requestDoc: request,
                  transferDoc,
                  requestedAt: now,
                  labOrg: labMeta.labOrg,
                  scheduleMode: "full",
                });
                // hold에 쓴 출고일을 덮어쓰지 않음(배송 hold 박스 키 정합)
                if (heldEstimatedShipYmd) {
                  if (!request.timeline) request.timeline = {};
                  request.timeline.estimatedShipYmd = heldEstimatedShipYmd;
                  request.timeline.nextEstimatedShipYmd = heldEstimatedShipYmd;
                }
                if (request.productionSchedule) {
                  $set.productionSchedule = request.productionSchedule;
                }
                if (request.price) $set.price = request.price;
                if (request.shippingMode) $set.shippingMode = request.shippingMode;
                if (request.originalShipping) {
                  $set.originalShipping = request.originalShipping;
                }
                if (request.finalShipping) $set.finalShipping = request.finalShipping;
                if (request.timeline) $set.timeline = request.timeline;
              }

              if (Object.keys($set).length) {
                await Request.updateOne({ _id: request._id }, { $set });
              }
            } catch (metaErr) {
              console.warn(
                "[DESIGN_HANDOFF] post labMeta/schedule failed",
                metaErr?.message || metaErr,
              );
            }
          }

          const mirroredDoc = await mirrorDesignFileToPracticeTransfer({
            transferId: relatedTransferId,
            file: {
              originalName: nextPrimary.originalName,
              mimetype: nextPrimary.fileType,
              size: nextPrimary.fileSize,
              s3Key: nextPrimary.s3Key,
            },
            tooth: String(request?.caseInfos?.tooth || "").trim(),
            patientName: String(request?.caseInfos?.patientName || "").trim(),
            labDesignConfirm: labConfirmPayload,
          });
          const mirroredDesignCount = Array.isArray(
            mirroredDoc?.production?.designFiles,
          )
            ? mirroredDoc.production.designFiles.length
            : 0;
          if (!mirroredDoc || mirroredDesignCount <= priorDesignCount) {
            throw new Error(
              "PracticeTransfer design mirror failed (designFiles not updated).",
            );
          }

          if (transferDoc && isAcceptingLab) {
            void grantAbutmentDesignLabFee({
              requestDoc: request,
              transferId: relatedTransferId,
              labAnchorId:
                labAnchorId || String(transferDoc.targetLabAnchorId || "").trim(),
              actorUserId: userId,
            }).catch((grantErr) => {
              console.error(
                "[DESIGN_HANDOFF] abutment design fee grant failed",
                grantErr,
              );
            });
          }

          // 디자인컨펌생략 OFF + 첫 디자인 미러 성공 → 치과 「어벗 디자인 컨펌」 채팅·목록 갱신
          if (
            transferDoc &&
            priorDesignCount === 0 &&
            transferDoc.production?.skipDesignConfirm === false &&
            !transferDoc.production?.practiceDesignConfirmedAt
          ) {
            void postPracticeTransferSystemChatMessage({
              transferMongoId: transferDoc._id,
              senderUserId: userId,
              content:
                "어벗 디자인이 준비되었습니다. 확인한 뒤 「어벗 디자인 컨펌」해 주세요.",
              systemEvent: "awaiting_design_confirm",
            });
            void emitAbutmentDesignReadyToPractice(transferDoc);
          }
        } catch (mirrorErr) {
          console.error(
            "[DESIGN_HANDOFF] PTX mirror failed after request save",
            mirrorErr,
          );
          try {
            await clearPtxDesignMirror(relatedTransferId);
          } catch (rollbackErr) {
            console.error(
              "[DESIGN_HANDOFF] PTX mirror rollback failed",
              rollbackErr,
            );
          }
        }

        try {
          if (rhinoFileName) {
            await seedPrcFieldsAfterHandoff(request);
            triggerRhinoProcessFileForRequest({
              requestId: request.requestId,
              filePath: rhinoFileName,
              fileName: rhinoFileName,
            });
          }
        } catch (rhinoErr) {
          console.warn(
            "[DESIGN_HANDOFF] rhino trigger failed",
            rhinoErr?.message || rhinoErr,
          );
        }

        try {
          emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
            reason: "ptx-design-handoff",
            requestId: String(request._id),
          });
          emitAppEventToRoles(["admin"], "comm:badge-update", {
            key: "request",
            delta: 1,
          });
        } catch (emitErr) {
          console.error("[DESIGN_HANDOFF] worksheet count emit failed", emitErr);
        }

        refreshLabDashboardAfterPtxDesignChange(
          labAnchorId ||
            transferTargetLabAnchorId ||
            request.businessAnchorId ||
            req.user?.businessAnchorId,
          "ptx-design-handoff",
        );
      })();

      return;
    }

    await request.save();

    // 제조사 준비→가공 진입 SSOT 재사용 (비PTX)
    req.body = {
      ...(req.body && typeof req.body === "object" ? req.body : {}),
      status: "APPROVED",
      stage: "machining",
      nextUpCamRunGuard: true,
      forceReprocess: false,
      approvalTriggerSource: "design-handoff",
    };
    req.__designPartner = true;

    return updateReviewStatusByStage(req, res);
  } catch (error) {
    console.error("[DESIGN_HANDOFF_ERROR]", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "디자인 핸드오프 중 오류가 발생했습니다.",
    });
  }
}

/**
 * POST /api/requests/:id/design-handoff/cancel
 * PTX: 준비 단계에서만 디자인 업로드 취소(구강스캔 복원) + 어벗디자인비 회수.
 * Transfer 작업완료/생산진행(resultFiles·completed·confirmedAt)도 열어 의뢰수락 UI 복원.
 * billing.settledAt·에스크로 원장은 유지(정산 되돌림 없음).
 */
export async function cancelDesignHandoff(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin" && role !== "internalLab") {
      return res.status(403).json({
        success: false,
        message: "디자인 취소는 수락 기공소만 할 수 있습니다.",
      });
    }

    const userId = req.user?._id ? String(req.user._id) : "";
    if (!userId) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const relatedTransferId = request?.partnerBilling?.relatedPracticeTransferId
      ? String(request.partnerBilling.relatedPracticeTransferId)
      : "";
    if (!relatedTransferId || !Types.ObjectId.isValid(relatedTransferId)) {
      return res.status(400).json({
        success: false,
        message: "기공의뢰 연동 건만 디자인 업로드를 취소할 수 있습니다.",
      });
    }

    // Transfer 1회 조회(수락 lab · 미러 · relatedRequestIds)
    const transferDoc = await PracticeTransfer.findById(relatedTransferId)
      .select({
        targetLabAnchorId: 1,
        "production.designFiles": 1,
        "production.designReadyAt": 1,
        "production.confirmedAt": 1,
        "production.relatedRequestIds": 1,
        "autoMatch.completedAt": 1,
        resultFiles: 1,
      })
      .lean();
    const transferTargetLabAnchorId = String(
      transferDoc?.targetLabAnchorId || "",
    ).trim();
    const relatedRequestIds = (
      Array.isArray(transferDoc?.production?.relatedRequestIds)
        ? transferDoc.production.relatedRequestIds
        : []
    )
      .map((raw) => String(raw || "").trim())
      .filter((raw) => Types.ObjectId.isValid(raw));

    if (
      !isAcceptingLabForPtxDesignRequest(
        req.user,
        request,
        transferTargetLabAnchorId,
      ) &&
      role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "수락한 기공소만 디자인을 취소할 수 있습니다.",
      });
    }
    healRequestOwnershipToAcceptingLab(request, transferTargetLabAnchorId);

    if (isAbutmentRequestPastReadyForCancel(request)) {
      return res.status(409).json({
        success: false,
        message:
          "제조사가 준비 단계일 때만 어벗디자인을 취소·재업로드할 수 있습니다.",
        code: "manufacturer_not_ready",
      });
    }

    const mirroredDesignCount = Array.isArray(transferDoc?.production?.designFiles)
      ? transferDoc.production.designFiles.length
      : 0;
    const hasMirroredDesign =
      mirroredDesignCount > 0 || Boolean(transferDoc?.production?.designReadyAt);
    const hasRequestDesign = Boolean(request.designCompletedAt);
    const transferNeedsReopen =
      Boolean(transferDoc?.production?.confirmedAt) ||
      Boolean(transferDoc?.autoMatch?.completedAt) ||
      (Array.isArray(transferDoc?.resultFiles) && transferDoc.resultFiles.length > 0);

    const now = new Date();
    const primaryRequestId = String(request._id);
    const labAnchorForRevoke = String(
      req.user?.businessAnchorId || request.businessAnchorId || "",
    ).trim();

    const finishCancelResponse = ({
      message,
      extraData = {},
      feeRevokePending = false,
    }) => {
      try {
        emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
          reason: String(extraData.cancelReason || "ptx-design-handoff-cancel"),
          requestId: primaryRequestId,
        });
      } catch {
        // best-effort
      }
      refreshLabDashboardAfterPtxDesignChange(
        req.user?.businessAnchorId ||
          request.businessAnchorId ||
          transferTargetLabAnchorId,
        String(extraData.cancelReason || "ptx-design-handoff-cancel"),
      );

      if (feeRevokePending) {
        const uniqueRevokeIds = Array.from(
          new Set([primaryRequestId, ...relatedRequestIds]),
        );
        void (async () => {
          try {
            await Promise.all(
              uniqueRevokeIds.map(async (revokeId) => {
                const revokeDoc =
                  String(revokeId) === primaryRequestId
                    ? request
                    : await Request.findById(revokeId);
                if (!revokeDoc) return;
                await revokeAbutmentDesignLabFee({
                  requestDoc: revokeDoc,
                  transferId: relatedTransferId,
                  labAnchorId: labAnchorForRevoke,
                  actorUserId: userId,
                });
              }),
            );
          } catch (revokeErr) {
            console.error("[DESIGN_HANDOFF_CANCEL] fee revoke failed", revokeErr);
          }
        })();
      }

      const { cancelReason: _omit, ...restExtra } = extraData;
      return res.status(200).json({
        success: true,
        message,
        data: {
          requestId: primaryRequestId,
          relatedPracticeTransferId: relatedTransferId,
          manufacturerStage: "취소",
          revokedAt: now.toISOString(),
          ...restExtra,
        },
      });
    };

    const clearMirrorAndCancelRelated = async (skipPrimary = false) => {
      await Promise.all([
        clearPtxDesignMirror(relatedTransferId),
        markPtxRelatedRequestsCancelled(relatedTransferId, {
          relatedRequestIds,
          skipRequestIds: skipPrimary ? [primaryRequestId] : [],
        }),
      ]);
    };

    // 디자인 이미 비었는데 작업완료/생산진행 플래그만 남은 경우 → 스테이지만 재오픈
    if (!hasRequestDesign && !hasMirroredDesign) {
      if (!transferNeedsReopen) {
        return res.status(400).json({
          success: false,
          message: "업로드된 어벗디자인이 없습니다.",
        });
      }
      await clearMirrorAndCancelRelated(false);
      return finishCancelResponse({
        message:
          "생산 단계를 다시 열었습니다. 어벗디자인·보철을 다시 업로드할 수 있습니다.",
        extraData: {
          cancelReason: "ptx-design-handoff-cancel-reopen",
          abutmentDesignFeeRevoked: false,
          stageReopened: true,
        },
      });
    }

    // Request에 designCompletedAt이 없고 Transfer에만 미러가 남은 orphan:
    // 구강스캔은 이미 primary — 미러만 비우면 재업로드 가능.
    if (!hasRequestDesign && hasMirroredDesign) {
      await clearMirrorAndCancelRelated(false);
      return finishCancelResponse({
        message:
          "어벗디자인 업로드가 취소되었습니다. 다시 업로드할 수 있습니다.",
        extraData: {
          cancelReason: "ptx-design-handoff-cancel-orphan",
          abutmentDesignFeeRevoked: false,
          orphanMirrorCleared: true,
        },
      });
    }

    applyPtxDesignCancelFields(request);
    // primary save + 미러 클리어 + sibling 취소(primary skip) 병렬 — hold/디자인비는 응답 후
    const excludeSiblingIds = relatedRequestIds.length
      ? relatedRequestIds
      : [primaryRequestId];
    await Promise.all([
      request.save(),
      clearPtxDesignMirror(relatedTransferId),
      markPtxRelatedRequestsCancelled(relatedTransferId, {
        relatedRequestIds,
        skipRequestIds: [primaryRequestId],
      }),
    ]);

    void releaseRequestCreditHoldsOnCancel({
      request,
      excludeSiblingIds,
    }).catch((holdErr) => {
      console.warn(
        "[DESIGN_HANDOFF_CANCEL] credit hold release failed",
        primaryRequestId,
        holdErr?.message || holdErr,
      );
    });

    return finishCancelResponse({
      message: "어벗디자인 업로드가 취소되었습니다. 다시 업로드할 수 있습니다.",
      extraData: {
        cancelReason: "ptx-design-handoff-cancel",
        // 응답 후 비동기 revoke — UI는 즉시 복귀
        abutmentDesignFeeRevoked: true,
      },
      feeRevokePending: true,
    });
  } catch (error) {
    console.error("[DESIGN_HANDOFF_CANCEL_ERROR]", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "디자인 취소 중 오류가 발생했습니다.",
    });
  }
}
