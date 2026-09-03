// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - bg/pc2/lot-server/src/index.js
// - web/backend/controllers/requests/mailbox.utils.js
// change-log:
// - 2026-09-04: 미매칭 시 packing:capture-unmatched 발행 + previewUrl. requestMongoId 수동 바인딩.
// - 2026-08-20: 샘플도 각인 후 포장.발송·우편함 유지(일반 의뢰와 동일).
// - 2026-08-17: 포장.발송 진입 시 세척.패킹 우편함을 유지(없으면 1회 보정).
import Request from "../../models/request.model.js";
import s3Utils, { getObjectBufferFromS3, getSignedUrl } from "../../utils/s3.utils.js";
import { shouldBlockExternalCall } from "../../utils/rateGuard.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { emitAppEventGlobal } from "../../socket.js";
import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";
import {
  ensureFinishedLotNumberForPacking,
  normalizeRequestForResponse,
} from "../../controllers/requests/utils.js";
import {
  normalizeBusinessAnchorId,
} from "../requests/mailbox.utils.js";
import { enterManufacturerShippingStage } from "../requests/common.review.helpers.js";
import sharp from "sharp";
import mongoose from "mongoose";

let _apiKey = null;
let _genAI = null;
let _initialized = false;

function toBool(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function getGenAI() {
  if (!_initialized) {
    _initialized = true;
    _apiKey = process.env.GOOGLE_API_KEY;
    if (_apiKey) {
      try {
        _genAI = new GoogleGenerativeAI(_apiKey);
      } catch {
        _genAI = null;
      }
    }
  }
  return _genAI;
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

  const caseRaw = String(requestDoc?.caseInfos?.manufacturerHexRotation || "").trim();
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

async function findPackingRequestBySuffix(recognizedSuffix) {
  const suffix = extractLotSuffix3(recognizedSuffix);
  if (!suffix) return null;

  const candidates = await Request.find({
    status: { $ne: "취소" },
    manufacturerStage: { $in: ["세척.패킹"] },
  })
    .populate("businessAnchorId", "name metadata")
    .populate("requestor", "businessAnchorId")
    .sort({ createdAt: 1 });

  return (
    candidates.find(
      (candidate) =>
        extractLotSuffix3(String(candidate?.lotNumber?.value || "")) === suffix,
    ) || null
  );
}

async function recognizeLotNumberFromS3({ s3Key, originalName }) {
  const genAI = getGenAI();
  if (!genAI) {
    return { lotNumber: "", confidence: "low", provider: "none" };
  }

  const buffer = await getObjectBufferFromS3(s3Key);
  if (!buffer || buffer.length === 0) {
    throw new ApiError(404, "S3에서 파일을 찾을 수 없습니다.");
  }

  const originalSizeKB = (buffer.length / 1024).toFixed(2);
  console.log("[lot-capture] original image size", {
    s3Key,
    sizeKB: originalSizeKB,
    sizeBytes: buffer.length,
  });

  // 이미지 리사이징으로 Gemini API 비용 절감 (800px 너비로 축소)
  let processedBuffer = buffer;
  try {
    const metadata = await sharp(buffer).metadata();
    console.log("[lot-capture] original image dimensions", {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    });

    if (metadata.width && metadata.width > 800) {
      processedBuffer = await sharp(buffer)
        .resize(800, null, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      const resizedSizeKB = (processedBuffer.length / 1024).toFixed(2);
      const reduction = (
        ((buffer.length - processedBuffer.length) / buffer.length) *
        100
      ).toFixed(1);

      console.log("[lot-capture] image resized for cost optimization", {
        originalSizeKB,
        resizedSizeKB,
        reduction: `${reduction}%`,
      });
    }
  } catch (resizeError) {
    console.warn("[lot-capture] image resize failed, using original", {
      error: resizeError?.message || String(resizeError),
    });
    processedBuffer = buffer;
  }

  const guardKey = `gemini-recognizeLotNumber:bg`;
  const guard = shouldBlockExternalCall(guardKey);
  if (guard?.blocked) {
    throw new ApiError(
      429,
      "AI 외부 API가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const imageBase64 = processedBuffer.toString("base64");
  const mimeType = String(originalName || "")
    .toLowerCase()
    .endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  const prompt =
    "너는 치과 임플란트 어벗먼트(또는 유사한 금속 부품) 생산 이미지에서 각인된 시리얼 코드를 읽어 JSON으로 추출하는 도우미야.\n" +
    "이 시리얼 코드는 보통 영문 대문자 3글자로 구성된 코드이며,\n" +
    "앞뒤에 다른 문자나 숫자가 섞여 있을 수도 있고, 오직 3글자만 보일 수도 있어.\n" +
    "이미지 안에서 금속 표면에 가장 뚜렷하게 각인된 3글자 영문 대문자 코드를 그대로 lotNumber 로 반환해줘.\n" +
    "흐리거나 저해상도여도 추측/예시 코드로 채우지 말고, 글자 형태를 읽어라.\n" +
    "읽기 어렵거나 확신이 없으면 confidence 를 low 로 두고, 도저히 읽을 수 없으면 lotNumber 는 빈 문자열로 둬.\n" +
    "만약 여러 개가 보이면 가장 중요한(가장 크게, 중앙에, 선명하게 보이는) 코드를 1개만 선택해.\n" +
    "반드시 JSON만 반환하고 다른 설명은 하지 마.\n\n" +
    "스키마:\n" +
    "{\n" +
    '  "lotNumber": string,\n' +
    '  "confidence": "high" | "medium" | "low"\n' +
    "}";

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        data: imageBase64,
        mimeType,
      },
    },
  ]);

  const text = result?.response?.text?.() || "";

  let cleaned = String(text || "").trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    const lastFence = cleaned.lastIndexOf("```");
    if (firstNewline !== -1 && lastFence !== -1 && lastFence > firstNewline) {
      cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
    }
  }

  const tryParseJsonObject = (input) => {
    if (!input) return null;
    const s = String(input).trim();
    try {
      return JSON.parse(s);
    } catch {}

    const firstBrace = s.indexOf("{");
    const lastBrace = s.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    const slice = s.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  };

  const parsed = tryParseJsonObject(cleaned);
  const parseOk =
    !!parsed && typeof parsed === "object" && !Array.isArray(parsed);

  if (!parseOk) {
    return { lotNumber: "", confidence: "low", provider: "gemini" };
  }

  return {
    lotNumber: String(parsed.lotNumber || "").trim(),
    confidence: String(parsed.confidence || "low").trim(),
    provider: "gemini",
  };
}

async function resolvePackingPreviewUrl({ s3Key, s3Url }) {
  const fallback = String(s3Url || "").trim();
  try {
    const signed = await getSignedUrl(s3Key, 60 * 30);
    return String(signed || "").trim() || fallback;
  } catch (err) {
    console.warn("[lot-capture] preview signed URL failed", {
      s3Key,
      error: err?.message || String(err),
    });
    return fallback;
  }
}

async function findPackingRequestForManualBind({
  requestMongoId,
  requestId,
}) {
  const mongoId = String(requestMongoId || "").trim();
  const businessId = String(requestId || "").trim();
  if (!mongoId && !businessId) return null;

  const query = {
    status: { $ne: "취소" },
    manufacturerStage: "세척.패킹",
  };
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
  } = req.body || {};

  const key = String(s3Key || "").trim();
  if (!key) {
    throw new ApiError(400, "s3Key가 필요합니다.");
  }

  const name = String(originalName || "").trim() || "capture.jpg";
  const manualRequestMongoId = String(requestMongoId || "").trim();
  const manualRequestId = String(bodyRequestId || "").trim();
  const isManualBind = Boolean(manualRequestMongoId || manualRequestId);

  const providedLotNumber = String(lotNumber || "").trim();
  const providedSuffix = extractLotSuffix3(
    String(recognizedSuffix || "").trim() || providedLotNumber,
  );
  let recognized = {
    lotNumber: providedLotNumber || providedSuffix,
    confidence: providedSuffix ? "provided" : "missing",
    provider: providedSuffix
      ? isManualBind
        ? "manual"
        : "lot-server"
      : "none",
  };

  const packAiRecogEnabled = toBool(process.env.PACK_AI_RECOG);
  if (!isManualBind && !providedSuffix && packAiRecogEnabled) {
    recognized = await recognizeLotNumberFromS3({
      s3Key: key,
      originalName: name,
    });
  }

  const finalRecognizedSuffix = extractLotSuffix3(
    String(recognized?.lotNumber || ""),
  );
  console.log("[lot-capture] recognition result", {
    originalName: name,
    s3Key: key,
    recognizedLotNumber: String(recognized?.lotNumber || "").trim(),
    recognizedSuffix: finalRecognizedSuffix,
    confidence: String(recognized?.confidence || "").trim() || "unknown",
    provider: String(recognized?.provider || "").trim() || "unknown",
    packAiRecogEnabled,
    manualBind: isManualBind,
  });

  let request = null;
  let reason = "";
  let matchedSuffix = finalRecognizedSuffix;

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
        recognized = {
          lotNumber: requestSuffix,
          confidence: "manual",
          provider: "manual",
        };
      }
    }
  } else if (finalRecognizedSuffix) {
    request = await findPackingRequestBySuffix(finalRecognizedSuffix);
    if (!request) {
      reason = "no_suffix_match";
    }
  } else if (!packAiRecogEnabled) {
    request = await Request.findOne({
      status: { $ne: "취소" },
      manufacturerStage: "세척.패킹",
    })
      .populate("businessAnchorId", "name metadata")
      .sort({ createdAt: 1 });
    reason = request ? "" : "no_packing_request";

    console.warn("[lot-capture] temporary fallback applied", {
      recognizedSuffix: finalRecognizedSuffix || null,
      matched: !!request,
      matchedRequestId: request?.requestId || null,
      matchedMongoId: request?._id ? String(request._id) : null,
      matchedLotPart: String(request?.lotNumber?.value || "").trim() || null,
    });
  } else {
    reason = "no_recognized_suffix";
  }

  if (!request) {
    console.warn("[lot-capture] no matching request found", {
      recognizedSuffix: matchedSuffix || null,
      originalName: name,
      s3Key: key,
      temporaryFallback: !packAiRecogEnabled,
      reason,
      manualBind: isManualBind,
    });

    const previewUrl = await resolvePackingPreviewUrl({
      s3Key: key,
      s3Url,
    });
    const unmatchedPayload = {
      ok: true,
      recognized: recognized || null,
      matched: false,
      suffix: matchedSuffix || null,
      reason: reason || "no_packing_request",
      s3Key: key,
      s3Url: String(s3Url || "").trim() || "",
      previewUrl,
      originalName: name,
      fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : null,
      source: String(source || "").trim() || "worker",
    };

    emitAppEventGlobal("packing:capture-unmatched", {
      source: "bg-lot-capture",
      capturedBy:
        String(source || "").trim() === "manual" ? "frontend" : "worker",
      ...unmatchedPayload,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        unmatchedPayload,
        "일치하는 세척.패킹 의뢰를 찾지 못했습니다. 화면에서 수동 매칭하세요.",
      ),
    );
  }

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};

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
    source: String(source || "").trim() || "worker",
    uploadedBy: null,
    uploadedAt: new Date(),
  };

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
    stage: String(request?.manufacturerStage || "").trim() || null,
    imageName: name,
    manualBind: isManualBind,
  });

  await ensureFinishedLotNumberForPacking(request);

  // populate된 businessAnchorId를 String()하면 "[object Object]"가 되어
  // 동일 업체 우편함 재사용이 깨진다. _id까지 정규화한 값만 사용한다.
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

  // 세척.패킹 각인 후 포장.발송 전환. SSOT: enterManufacturerShippingStage.
  await enterManufacturerShippingStage({
    request,
    requestorOrgId: effectiveAnchorIdStr,
    source: "lot_capture",
  });

  const legacyHexRotationNormalized =
    normalizeLegacyManufacturerHexRotationOnRequest(request);
  if (legacyHexRotationNormalized) {
    console.warn("[lot-capture] normalized legacy manufacturerHexRotation", {
      requestId: request.requestId,
      requestMongoId: String(request._id || ""),
      caseInfosManufacturerHexRotation:
        String(request?.caseInfos?.manufacturerHexRotation || "").trim() || null,
      rndManufacturerHexRotation:
        String(request?.rnd?.manufacturerHexRotation || "").trim() || null,
    });
  }

  console.log("[lot-capture] before save - businessAnchorId state", {
    requestId: request.requestId,
    hasName: !!request?.businessAnchorId?.name,
    nameValue: request?.businessAnchorId?.name || null,
    mailboxAddress: request?.mailboxAddress || null,
  });

  await request.save();

  console.log("[lot-capture] after save - businessAnchorId state", {
    requestId: request.requestId,
    hasName: !!request?.businessAnchorId?.name,
    nameValue: request?.businessAnchorId?.name || null,
  });

  const normalizedRequest = await normalizeRequestForResponse(request);

  const capturedByFrontend = String(source || "").trim() === "manual";

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
      temporaryFallback: !packAiRecogEnabled && !matchedSuffix,
      manualBind: isManualBind,
    },
  });

  const movedToStage = String(normalizedRequest?.manufacturerStage || "").trim() || "포장.발송";

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
      s3Key: request.caseInfos?.stageFiles?.packing?.s3Key || key,
      s3Url:
        request.caseInfos?.stageFiles?.packing?.s3Url ||
        String(s3Url || "").trim() ||
        "",
      source: request.caseInfos?.stageFiles?.packing?.source || "worker",
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
        manualBind: isManualBind,
      },
      isManualBind ? "수동 매칭 포장 캡쳐 처리 완료" : "포장 캡쳐 처리 완료",
    ),
  );
});

export default { handlePackingCapture };
