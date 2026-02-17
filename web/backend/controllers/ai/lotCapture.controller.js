import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import s3Utils, { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { shouldBlockExternalCall } from "../../utils/rateGuard.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { applyStatusMapping, ensureFinishedLotNumberForPackaging, getTodayYmdInKst } from "./request/utils.js";

let _apiKey = null;
let _genAI = null;
let _initialized = false;

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

function toKstYmd(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function ensureShippingPackageAndChargeFee({ request, session }) {
  if (!request) return;

  const organizationIdRaw =
    request.requestorOrganizationId || request.requestor?.organizationId;
  const organizationId =
    organizationIdRaw && Types.ObjectId.isValid(String(organizationIdRaw))
      ? new Types.ObjectId(String(organizationIdRaw))
      : null;

  if (!organizationId) {
    throw new ApiError(400, "조직 정보가 없어 발송 박스를 생성할 수 없습니다.");
  }

  const pickup = request?.productionSchedule?.scheduledShipPickup;
  const shipDateYmd = toKstYmd(pickup) || getTodayYmdInKst();

  let pkg;
  try {
    pkg = await ShippingPackage.findOneAndUpdate(
      { organizationId, shipDateYmd },
      {
        $setOnInsert: {
          organizationId,
          shipDateYmd,
          createdBy: null,
        },
        $addToSet: { requestIds: request._id },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session: session || null,
      },
    );
  } catch (e) {
    const msg = String(e?.message || "");
    const code = e?.code;
    if (code === 11000 || msg.includes("E11000")) {
      pkg = await ShippingPackage.findOne({ organizationId, shipDateYmd })
        .session(session || null)
        .lean();
      if (pkg?._id) {
        await ShippingPackage.updateOne(
          { _id: pkg._id },
          { $addToSet: { requestIds: request._id } },
          { session: session || null },
        );
      }
    } else {
      throw e;
    }
  }

  if (pkg?._id) {
    request.shippingPackageId = pkg._id;
  }

  const fee = Number(pkg?.shippingFeeSupply || 0);
  if (fee > 0) {
    const uniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee`;
    await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          organizationId,
          userId: null,
          type: "SPEND",
          amount: -fee,
          refType: "SHIPPING_PACKAGE",
          refId: pkg._id,
          uniqueKey,
        },
      },
      { upsert: true, session: session || null },
    );
  }
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
  const parseOk = !!parsed && typeof parsed === "object" && !Array.isArray(parsed);

  if (!parseOk) {
    return { lotNumber: "", confidence: "low", provider: "gemini" };
  }

  return {
    lotNumber: String(parsed.lotNumber || "").trim(),
    confidence: String(parsed.confidence || "low").trim(),
    provider: "gemini",
  };
}

export const handlePackagingCapture = asyncHandler(async (req, res) => {
  const { s3Key, s3Url, originalName, fileSize } = req.body || {};

  const key = String(s3Key || "").trim();
  if (!key) {
    throw new ApiError(400, "s3Key가 필요합니다.");
  }

  const name = String(originalName || "").trim() || "capture.jpg";

  const recognized = await recognizeLotNumberFromS3({
    s3Key: key,
    originalName: name,
  });

  const recognizedSuffix = extractLotSuffix3(recognized?.lotNumber || "");
  if (!recognizedSuffix) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            ok: false,
            recognized: recognized || null,
            matched: false,
            reason: "no_lot_suffix",
          },
          "LOT 코드를 인식하지 못했습니다.",
        ),
      );
  }

  const regex = new RegExp(`${recognizedSuffix}$`, "i");
  const request = await Request.findOne({
    status: { $ne: "취소" },
    "lotNumber.part": { $regex: regex },
  });

  if (!request) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            ok: true,
            recognized: recognized || null,
            matched: false,
            suffix: recognizedSuffix,
          },
          "일치하는 의뢰가 없습니다.",
        ),
      );
  }

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};

  request.caseInfos.stageFiles.packaging = {
    fileName: name,
    fileType: s3Utils.getFileType(name) === "image" ? "image/jpeg" : "application/octet-stream",
    fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : undefined,
    filePath: name,
    s3Key: key,
    s3Url: String(s3Url || "").trim() || "",
    source: "worker",
    uploadedBy: null,
    uploadedAt: new Date(),
  };

  request.caseInfos.reviewByStage.packaging = {
    status: "APPROVED",
    updatedAt: new Date(),
    updatedBy: null,
    reason: "",
  };

  await ensureFinishedLotNumberForPackaging(request);
  await ensureShippingPackageAndChargeFee({ request, session: null });
  applyStatusMapping(request, "발송");

  await request.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          ok: true,
          matched: true,
          requestId: request.requestId,
          suffix: recognizedSuffix,
          recognized: recognized || null,
        },
        "포장 캡쳐 처리 완료",
      ),
    );
});

export default { handlePackagingCapture };
