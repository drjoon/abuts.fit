import Request from "../../models/request.model.js";
import s3Utils, { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { shouldBlockExternalCall } from "../../utils/rateGuard.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { emitAppEventGlobal } from "../../socket.js";
import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";
import {
  applyStatusMapping,
  ensureFinishedLotNumberForPacking,
  normalizeRequestForResponse,
} from "../../controllers/requests/utils.js";
import { allocateVirtualMailboxAddress } from "../requests/mailbox.utils.js";
import {
  printPackingLabelViaBgServer,
  resolveManufacturingDateForPrint,
  resolveScrewTypeForPrint,
} from "../../utils/packPrint.utils.js";

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

async function findPackingRequestBySuffix(recognizedSuffix) {
  const suffix = extractLotSuffix3(recognizedSuffix);
  if (!suffix) return null;

  const candidates = await Request.find({
    status: { $ne: "취소" },
    manufacturerStage: "세척.패킹",
  }).sort({ createdAt: 1 });

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

  const imageBase64 = buffer.toString("base64");
  const mimeType = String(originalName || "")
    .toLowerCase()
    .endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  const prompt =
    "너는 치과 임플란트 어벗먼트(또는 유사한 금속 부품) 생산 이미지에서 각인된 시리얼 코드를 읽어 JSON으로 추출하는 도우미야.\n" +
    "이 시리얼 코드는 보통 영문 대문자 3글자로 구성된 코드(예: ACZ, BDF, QJK 등)이며,\n" +
    "앞뒤에 다른 문자나 숫자가 섞여 있을 수도 있고, 오직 3글자만 보일 수도 있어.\n" +
    "이미지 안에서 금속 표면에 가장 뚜렷하게 각인된 3글자 영문 대문자 코드를 찾아서 그대로 lotNumber 로 반환해줘.\n" +
    "만약 여러 개가 보이면 가장 중요한(가장 크게, 중앙에, 선명하게 보이는) 코드를 1개만 선택해.\n" +
    "적절한 3글자 영문 대문자 코드가 전혀 없으면 lotNumber 는 빈 문자열로 둬.\n" +
    "반드시 JSON만 반환하고 다른 설명은 하지 마.\n\n" +
    "스키마:\n" +
    "{\n" +
    '  "lotNumber": string,\n' +
    '  "confidence": string\n' +
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

export const handlePackingCapture = asyncHandler(async (req, res) => {
  const {
    s3Key,
    s3Url,
    originalName,
    fileSize,
    recognizedSuffix,
    lotNumber,
    source,
  } = req.body || {};

  const key = String(s3Key || "").trim();
  if (!key) {
    throw new ApiError(400, "s3Key가 필요합니다.");
  }

  const name = String(originalName || "").trim() || "capture.jpg";

  const providedLotNumber = String(lotNumber || "").trim();
  const providedSuffix = extractLotSuffix3(
    String(recognizedSuffix || "").trim() || providedLotNumber,
  );
  let recognized = {
    lotNumber: providedLotNumber || providedSuffix,
    confidence: providedSuffix ? "provided" : "missing",
    provider: providedSuffix ? "lot-server" : "none",
  };

  const packAiRecogEnabled = toBool(process.env.PACK_AI_RECOG);
  if (!providedSuffix && packAiRecogEnabled) {
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
  });

  let request = null;
  let reason = "";

  if (finalRecognizedSuffix) {
    request = await findPackingRequestBySuffix(finalRecognizedSuffix);
    if (!request) {
      reason = "no_suffix_match";
    }
  } else if (!packAiRecogEnabled) {
    request = await Request.findOne({
      status: { $ne: "취소" },
      manufacturerStage: "세척.패킹",
    }).sort({ createdAt: 1 });
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
      recognizedSuffix: finalRecognizedSuffix || null,
      originalName: name,
      s3Key: key,
      temporaryFallback: !packAiRecogEnabled,
      reason,
    });
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ok: true,
          recognized: recognized || null,
          matched: false,
          suffix: finalRecognizedSuffix || null,
          reason: reason || "no_packing_request",
        },
        "일치하는 세척.패킹 의뢰를 찾지 못했습니다.",
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
    recognizedSuffix: finalRecognizedSuffix || null,
    requestId: request.requestId,
    requestMongoId: String(request._id || ""),
    lotPart: String(request?.lotNumber?.value || "").trim() || null,
    stage: String(request?.manufacturerStage || "").trim() || null,
    imageName: name,
  });

  await ensureFinishedLotNumberForPacking(request);
  if (!request.mailboxAddress) {
    try {
      const requestorOrgId =
        request.businessAnchorId || request.requestor?.businessAnchorId;
      request.mailboxAddress =
        await allocateVirtualMailboxAddress(requestorOrgId);
    } catch (err) {
      console.error("[lot-capture] mailbox allocation failed", {
        requestId: request.requestId,
        requestMongoId: String(request._id || ""),
        message: err?.message || String(err),
      });
    }
  }
  applyStatusMapping(request, "발송");

  await request.save();
  const normalizedRequest = await normalizeRequestForResponse(request);

  // 백엔드에서 pack-server로 자동 프린트 요청
  let printResult = {
    success: null,
    message: "backend_auto_print_pending",
  };

  try {
    const manufacturingDate = resolveManufacturingDateForPrint(request);
    if (!manufacturingDate) {
      console.warn("[lot-capture] manufacturing date missing for auto print", {
        requestId: request.requestId,
        requestMongoId: String(request._id || ""),
      });
      throw new Error("제조일자를 확인할 수 없어 라벨을 생성할 수 없습니다.");
    }

    const fullLotNumber = String(request?.lotNumber?.value || "").trim();
    const labName = String(
      request?.requestorBusinessAnchor?.name ||
        request?.requestorBusiness?.name ||
        "",
    ).trim();
    const implantManufacturer = String(
      request?.caseInfos?.implantManufacturer || "",
    ).trim();
    const clinicName = String(request?.caseInfos?.clinicName || "").trim();
    const implantBrand = String(request?.caseInfos?.implantBrand || "").trim();
    const implantFamily = String(
      request?.caseInfos?.implantFamily || "",
    ).trim();
    const implantType = String(request?.caseInfos?.implantType || "").trim();
    const patientName = String(request?.caseInfos?.patientName || "").trim();
    const toothNumber = String(request?.caseInfos?.tooth || "").trim();
    const material = String(
      request?.caseInfos?.material ||
        request?.material ||
        request?.lotNumber?.material ||
        "",
    ).trim();
    const mailboxCode = String(request?.mailboxAddress || "").trim();
    const screwType = resolveScrewTypeForPrint(request);
    const createdAtIso = request.createdAt ? String(request.createdAt) : "";

    if (
      !fullLotNumber ||
      !labName ||
      !implantManufacturer ||
      !clinicName ||
      !implantBrand ||
      !implantFamily ||
      !implantType ||
      !patientName ||
      !toothNumber ||
      !mailboxCode
    ) {
      const missing = [];
      if (!fullLotNumber) missing.push("lotNumber");
      if (!labName) missing.push("labName");
      if (!implantManufacturer) missing.push("implantManufacturer");
      if (!clinicName) missing.push("clinicName");
      if (!implantBrand) missing.push("implantBrand");
      if (!implantFamily) missing.push("implantFamily");
      if (!implantType) missing.push("implantType");
      if (!patientName) missing.push("patientName");
      if (!toothNumber) missing.push("toothNumber");
      if (!mailboxCode) missing.push("mailboxCode");

      console.warn("[lot-capture] missing required fields for auto print", {
        requestId: request.requestId,
        missing,
      });
      throw new Error(
        `필수 필드 누락: ${missing.join(", ")}. 라벨을 생성할 수 없습니다.`,
      );
    }

    const packPrintResult = await printPackingLabelViaBgServer({
      requestId: request.requestId,
      lotNumber: fullLotNumber,
      mailboxCode,
      screwType,
      clinicName,
      labName,
      requestDate: createdAtIso,
      manufacturingDate,
      implantManufacturer,
      implantBrand,
      implantFamily,
      implantType,
      patientName,
      toothNumber,
      material,
      paperProfile: "PACK_80x65",
      copies: 1,
    });

    printResult = {
      success: true,
      message: "backend_auto_print_success",
      generated: packPrintResult?.generated || null,
    };

    console.log("[lot-capture] auto print success", {
      requestId: request.requestId,
      lotNumber: fullLotNumber,
    });
  } catch (printError) {
    console.error("[lot-capture] auto print failed", {
      requestId: request.requestId,
      requestMongoId: String(request._id || ""),
      message: printError?.message || String(printError),
    });

    printResult = {
      success: false,
      message:
        printError?.message || "패킹 라벨 자동 프린트 실패 (백엔드 오류)",
    };
  }

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
      recognizedSuffix: finalRecognizedSuffix || null,
      temporaryFallback: !packAiRecogEnabled && !finalRecognizedSuffix,
      autoPrintHandledBy: "backend",
      autoPrintSuccess: printResult?.success,
      autoPrintMessage: printResult?.message,
    },
  });

  emitAppEventGlobal("packing:capture-processed", {
    source: "bg-lot-capture",
    requestId: request.requestId,
    requestMongoId: String(request._id || ""),
    recognizedSuffix: finalRecognizedSuffix || null,
    recognized: recognized || null,
    movedToStage: "포장.발송",
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
    print: printResult,
  });

  emitAppEventGlobal("request:stage-changed", {
    source: "bg-lot-capture",
    requestId: request.requestId,
    requestMongoId: String(request._id || ""),
    fromStage: "세척.패킹",
    toStage: String(normalizedRequest?.manufacturerStage || "포장.발송").trim(),
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
        suffix: finalRecognizedSuffix || null,
        recognized: recognized || null,
        print: printResult,
      },
      "포장 캡쳐 처리 완료",
    ),
  );
});

export default { handlePackingCapture };
