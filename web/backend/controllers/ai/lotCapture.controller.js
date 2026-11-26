// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - bg/pc2/lot-server/src/index.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/usePackingCapture.ts
// change-log:
// - 2026-11-26: 매칭 후보에서 R&D 보관 샘플·더미를 빼 워크시트와 맞춘다.
// - 2026-11-26: 이미지→Gemini AI 제거. lot-server/수동 3글자 코드만 매칭·포장.발송. s3Key 선택.
// - 2026-11-11: confirmBySuffix 로 세척.패킹 유일 매칭 시 바로 포장.발송.
import Request from "../../models/request.model.js";
import s3Utils from "../../utils/s3.utils.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { emitAppEventGlobal } from "../../socket.js";
import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";
import {
  ensureFinishedLotNumberForPacking,
  normalizeRequestForResponse,
} from "../../controllers/requests/utils.js";
import { normalizeBusinessAnchorId } from "../requests/mailbox.utils.js";
import { enterManufacturerShippingStage } from "../requests/common.review.helpers.js";
import { buildActivePackingMatchFilter } from "./packingStation.controller.js";
import mongoose from "mongoose";

function toBool(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function extractLotSuffix3(value) {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
}

function parseManufacturerHexRotationModeOrNull(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (v === "STL모델대로") return "STL모델대로";
  if (v === "헥스30도회전") return "헥스30도회전";
  if (v === "STL모델+") return "STL모델+";
  if (v === "헥스30+") return "헥스30+";
  if (v === "헥스40도회전" || v === "헥스10도회전") return "STL모델+";

  const matched = v.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (matched) {
    const parsedX = Number(matched[1]);
    if (Number.isFinite(parsedX)) {
      if (parsedX === 30) return "헥스30도회전";
      return "STL모델+";
    }
  }

  if (v === "0") return "STL모델대로";
  if (v === "30") return "헥스30도회전";
  return null;
}

function normalizeLegacyManufacturerHexRotationOnRequest(requestDoc) {
  if (!requestDoc) return false;

  const caseRaw = String(
    requestDoc?.caseInfos?.manufacturerHexRotation || "",
  ).trim();
  const rndRaw = String(requestDoc?.rnd?.manufacturerHexRotation || "").trim();
  const caseParsed = parseManufacturerHexRotationModeOrNull(caseRaw);
  const rndParsed = parseManufacturerHexRotationModeOrNull(rndRaw);

  if ((!caseRaw || caseParsed) && (!rndRaw || rndParsed)) {
    return false;
  }

  const fallback = caseParsed || rndParsed || "STL모델대로";

  requestDoc.caseInfos = requestDoc.caseInfos || {};
  requestDoc.rnd = requestDoc.rnd || {};

  if (caseRaw && !caseParsed) {
    requestDoc.caseInfos.manufacturerHexRotation = fallback;
  }
  if (rndRaw && !rndParsed) {
    requestDoc.rnd.manufacturerHexRotation = fallback;
  }

  return true;
}

async function listPackingRequestsBySuffix(recognizedSuffix) {
  const suffix = extractLotSuffix3(recognizedSuffix);
  if (!suffix) return [];

  const candidates = await Request.find(buildActivePackingMatchFilter())
    .populate("businessAnchorId", "name metadata")
    .populate("requestor", "businessAnchorId")
    .sort({ createdAt: 1 });

  return candidates.filter(
    (candidate) =>
      extractLotSuffix3(String(candidate?.lotNumber?.value || "")) === suffix,
  );
}

async function findPackingRequestForManualBind({
  requestMongoId,
  requestId,
}) {
  const mongoId = String(requestMongoId || "").trim();
  const businessId = String(requestId || "").trim();
  if (!mongoId && !businessId) return null;

  const query = { ...buildActivePackingMatchFilter() };
  if (mongoId) {
    if (!mongoose.Types.ObjectId.isValid(mongoId)) return null;
    query._id = mongoId;
  } else {
    query.requestId = businessId;
  }

  return Request.findOne(query)
    .populate("businessAnchorId", "name metadata")
    .populate("requestor", "businessAnchorId");
}

/**
 * 세척.패킹 각인 매칭.
 * - recognizedSuffix(3글자) + confirmBySuffix → 유일 건이면 포장.발송
 * - requestMongoId 수동 지정 → 그 건으로 포장.발송
 * - s3Key는 선택(이미지 기록용). 코드만으로도 진행한다.
 * - 서버 Gemini 이미지 OCR은 쓰지 않는다(lot-server 로컬 OCR / 수동 입력).
 */
export const handlePackingCapture = asyncHandler(async (req, res) => {
  const {
    s3Key,
    s3Url,
    originalName,
    fileSize,
    recognizedSuffix,
    lotNumber,
    source,
    requestMongoId,
    requestId: bodyRequestId,
    confirmBySuffix: confirmBySuffixRaw,
  } = req.body || {};

  const key = String(s3Key || "").trim();
  const name = String(originalName || "").trim() || "lot-code.txt";
  const manualRequestMongoId = String(requestMongoId || "").trim();
  const manualRequestId = String(bodyRequestId || "").trim();
  const isManualBind = Boolean(manualRequestMongoId || manualRequestId);
  const confirmBySuffix = toBool(confirmBySuffixRaw) || !isManualBind;

  const providedLotNumber = String(lotNumber || "").trim();
  let matchedSuffix = extractLotSuffix3(
    String(recognizedSuffix || "").trim() || providedLotNumber,
  );

  if (!isManualBind && !matchedSuffix) {
    throw new ApiError(400, "각인 코드 3글자가 필요합니다.");
  }

  let request = null;
  let reason = "";

  if (isManualBind) {
    request = await findPackingRequestForManualBind({
      requestMongoId: manualRequestMongoId,
      requestId: manualRequestId,
    });
    if (!request) {
      reason = "manual_request_not_found";
    } else {
      const requestSuffix = extractLotSuffix3(
        String(request?.lotNumber?.value || ""),
      );
      if (!matchedSuffix && requestSuffix) {
        matchedSuffix = requestSuffix;
      }
    }
  } else {
    const matches = await listPackingRequestsBySuffix(matchedSuffix);
    if (matches.length === 1) {
      request = matches[0];
    } else {
      reason = matches.length > 1 ? "ambiguous_suffix" : "no_suffix_match";
    }
  }

  const recognized = {
    lotNumber: matchedSuffix || providedLotNumber,
    confidence: "provided",
    provider:
      String(source || "").trim() === "manual" || isManualBind
        ? "manual"
        : "lot-server",
  };

  if (!request) {
    console.warn("[lot-capture] no matching request", {
      recognizedSuffix: matchedSuffix || null,
      reason,
      manualBind: isManualBind,
    });
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ok: true,
          matched: false,
          needsConfirm: false,
          candidateMatched: false,
          suffix: matchedSuffix || null,
          reason: reason || "no_suffix_match",
        },
        reason === "ambiguous_suffix"
          ? "같은 각인 코드가 여러 건입니다."
          : reason === "manual_request_not_found"
            ? "지정한 세척.패킹 의뢰를 찾지 못했습니다."
            : "일치하는 세척.패킹 의뢰를 찾지 못했습니다.",
      ),
    );
  }

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};

  if (key) {
    request.caseInfos.stageFiles.packing = {
      fileName: name,
      fileType:
        s3Utils.getFileType(name) === "image"
          ? "image/jpeg"
          : "application/octet-stream",
      fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : undefined,
      filePath: name,
      s3Key: key,
      s3Url: String(s3Url || "").trim() || "",
      source: String(source || "").trim() || "lot-server",
      uploadedBy: null,
      uploadedAt: new Date(),
    };
  } else {
    const prev = request.caseInfos.stageFiles.packing || {};
    request.caseInfos.stageFiles.packing = {
      ...prev,
      source: String(source || "").trim() || "lot-server",
      lotSuffix: matchedSuffix || "",
      codeOnly: true,
      uploadedAt: new Date(),
    };
  }

  request.caseInfos.reviewByStage.packing = {
    status: "APPROVED",
    updatedAt: new Date(),
    updatedBy: null,
    reason: "",
  };

  console.log("[lot-capture] applying packing capture to request", {
    recognizedSuffix: matchedSuffix || null,
    requestId: request.requestId,
    requestMongoId: String(request._id || ""),
    lotPart: String(request?.lotNumber?.value || "").trim() || null,
    hasImage: Boolean(key),
    manualBind: isManualBind,
    confirmBySuffix,
  });

  await ensureFinishedLotNumberForPacking(request);

  const requestAnchorIdStr = normalizeBusinessAnchorId(
    request.businessAnchorId,
  );
  const requestorAnchorIdStr = normalizeBusinessAnchorId(
    request.requestor?.businessAnchorId,
  );
  const effectiveAnchorIdStr = requestAnchorIdStr || requestorAnchorIdStr;

  if (!requestAnchorIdStr && requestorAnchorIdStr) {
    request.businessAnchorId = request.requestor.businessAnchorId;
  }

  await enterManufacturerShippingStage({
    request,
    requestorOrgId: effectiveAnchorIdStr,
    source: "lot_capture",
  });

  normalizeLegacyManufacturerHexRotationOnRequest(request);

  await request.save();

  const normalizedRequest = await normalizeRequestForResponse(request);
  const capturedByFrontend = String(source || "").trim() === "manual";
  const movedToStage =
    String(normalizedRequest?.manufacturerStage || "").trim() || "포장.발송";

  emitBgRuntimeStatus({
    requestId: request.requestId,
    requestMongoId: String(request._id || "").trim(),
    source: "lot-server",
    stage: "packing",
    status: "completed",
    label: "각인 인식 완료",
    tone: "slate",
    clear: true,
    metadata: {
      recognizedSuffix: matchedSuffix || null,
      manualBind: isManualBind,
    },
  });

  emitAppEventGlobal("packing:capture-processed", {
    source: "bg-lot-capture",
    capturedBy: capturedByFrontend ? "frontend" : "worker",
    requestId: request.requestId,
    requestMongoId: String(request._id || ""),
    recognizedSuffix: matchedSuffix || null,
    recognized: recognized || null,
    movedToStage,
    request: normalizedRequest,
    packingFile: {
      fileName: request.caseInfos?.stageFiles?.packing?.fileName || name,
      fileType: request.caseInfos?.stageFiles?.packing?.fileType || null,
      fileSize: request.caseInfos?.stageFiles?.packing?.fileSize || null,
      filePath: request.caseInfos?.stageFiles?.packing?.filePath || name,
      s3Key: request.caseInfos?.stageFiles?.packing?.s3Key || key || "",
      s3Url:
        request.caseInfos?.stageFiles?.packing?.s3Url ||
        String(s3Url || "").trim() ||
        "",
      source: request.caseInfos?.stageFiles?.packing?.source || "lot-server",
      uploadedAt:
        request.caseInfos?.stageFiles?.packing?.uploadedAt || new Date(),
    },
  });

  emitAppEventGlobal("request:stage-changed", {
    source: "bg-lot-capture",
    requestId: request.requestId,
    requestMongoId: String(request._id || ""),
    fromStage: "세척.패킹",
    toStage: movedToStage,
    reviewStage: "packing",
    reviewStatus: "APPROVED",
    request: normalizedRequest,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ok: true,
        matched: true,
        requestId: request.requestId,
        requestMongoId: String(request._id || ""),
        suffix: matchedSuffix || null,
        recognized: recognized || null,
        manualBind: isManualBind || confirmBySuffix,
        request: normalizedRequest,
      },
      "각인 매칭 포장 처리 완료",
    ),
  );
});

export { extractLotSuffix3 };

export default { handlePackingCapture };
