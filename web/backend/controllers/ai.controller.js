import { GoogleGenerativeAI } from "@google/generative-ai";
import { shouldBlockExternalCall } from "../utils/rateGuard.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import s3Utils, { getObjectBufferFromS3 } from "../utils/s3.utils.js";

// 지연 초기화: dotenv 로드 후 첫 호출 시 초기화
let _apiKey = null;
let _genAI = null;
let _initialized = false;

const getGenAI = () => {
  if (!_initialized) {
    _initialized = true;
    _apiKey = process.env.GOOGLE_API_KEY;
    if (!_apiKey) {
      console.warn(
        "[AI] GOOGLE_API_KEY is not set. Gemini filename parsing will be disabled.",
      );
    } else {
      try {
        _genAI = new GoogleGenerativeAI(_apiKey);
      } catch (e) {
        console.warn(
          "[AI] Failed to initialize GoogleGenerativeAI:",
          e?.message || e,
        );
      }
    }
  }
  return _genAI;
};

export async function parseBusinessLicense(req, res) {
  try {
    const { fileId, s3Key, originalName } = req.body || {};

    if (!fileId && !s3Key) {
      return res.status(400).json({
        success: false,
        message: "fileId 또는 s3Key가 필요합니다.",
      });
    }

    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const hasOrganization = !!req.user.organizationId;
    let org = null;
    if (hasOrganization) {
      org = await RequestorOrganization.findById(req.user.organizationId)
        .select({ owner: 1, owners: 1 })
        .lean();
      const meId = String(req.user._id);
      const canUpload =
        org &&
        (String(org.owner) === meId ||
          (Array.isArray(org.owners) &&
            org.owners.some((c) => String(c) === meId)));
      if (!canUpload) {
        return res.status(403).json({
          success: false,
          message: "대표자 계정만 사업자등록증 업로드가 가능합니다.",
        });
      }
    }

    const key = String(s3Key || "").trim();
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "s3Key가 필요합니다.",
      });
    }

    const isImageName = (() => {
      const name = String(originalName || "").toLowerCase();
      return (
        name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")
      );
    })();
    if (!isImageName) {
      return res.status(400).json({
        success: false,
        message: "사업자등록증은 이미지(JPG/PNG) 파일만 지원합니다.",
      });
    }

    let buffer;
    try {
      buffer = await s3Utils.getObjectBufferFromS3(key);
    } catch (e) {
      const code = String(e?.Code || e?.name || "").trim();
      if (code === "NoSuchKey") {
        return res.status(400).json({
          success: false,
          message:
            "업로드된 파일을 저장소에서 찾을 수 없습니다. 초기화 후 다시 업로드해주세요.",
        });
      }
      throw e;
    }
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: "S3에서 파일을 읽을 수 없습니다.",
      });
    }

    const genAI = getGenAI();
    if (!genAI) {
      const extracted = {};
      const verification = {
        verified: false,
        provider: "none",
        message:
          "GOOGLE_API_KEY가 설정되지 않아 사업자등록증 자동 인식이 비활성화되어 있습니다.",
      };

      if (hasOrganization && org?._id) {
        await RequestorOrganization.findByIdAndUpdate(req.user.organizationId, {
          $set: {
            businessLicense: {
              fileId: fileId || null,
              s3Key: key,
              originalName: originalName || "",
              uploadedAt: new Date(),
            },
            verification: {
              ...verification,
              checkedAt: new Date(),
            },
          },
        });
      }

      return res.json({
        success: true,
        data: {
          input: {
            fileId: fileId || null,
            s3Key: key,
            originalName: originalName || null,
          },
          extracted,
          verification,
        },
      });
    }

    const clientIp =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      (req.connection && req.connection.remoteAddress) ||
      "unknown";
    const guardKey = `gemini-parseBusinessLicense:${clientIp}`;
    const guard = shouldBlockExternalCall(guardKey);
    if (guard?.blocked) {
      return res.status(429).json({
        success: false,
        message:
          "AI 외부 API가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });
    const imageBase64 = buffer.toString("base64");
    const mimeType = String(originalName || "")
      .toLowerCase()
      .endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    const prompt =
      "너는 한국 사업자등록증 이미지를 읽어 필요한 정보를 JSON으로만 추출하는 도우미야.\n" +
      '아래 스키마를 정확히 따르고, 값이 불확실하면 빈 문자열("")로 둬.\n' +
      "반드시 JSON만 반환하고 다른 설명은 하지 마.\n\n" +
      "스키마:\n" +
      "{\n" +
      '  "companyName": string,\n' +
      '  "businessNumber": string,\n' +
      '  "representativeName": string,\n' +
      '  "address": string,\n' +
      '  "phoneNumber": string,\n' +
      '  "email": string,\n' +
      '  "businessType": string,\n' +
      '  "businessItem": string,\n' +
      '  "startDate": string   // 개업연월일, YYYYMMDD 8자리로 반환\n' +
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
      console.error("[AI] parseBusinessLicense: JSON parse failed", {
        originalName,
        s3Key: key,
        sample: cleaned.slice(0, 400),
      });
    }

    const normalizeStartDate = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (digits.length !== 8) return "";
      return digits;
    };

    const extracted = {
      companyName: String((parseOk ? parsed.companyName : "") || "").trim(),
      businessNumber: String(
        (parseOk ? parsed.businessNumber : "") || "",
      ).trim(),
      address: String((parseOk ? parsed.address : "") || "").trim(),
      phoneNumber: String((parseOk ? parsed.phoneNumber : "") || "").trim(),
      email: String((parseOk ? parsed.email : "") || "").trim(),
      representativeName: String(
        (parseOk ? parsed.representativeName : "") || "",
      ).trim(),
      businessType: String((parseOk ? parsed.businessType : "") || "").trim(),
      businessItem: String((parseOk ? parsed.businessItem : "") || "").trim(),
      startDate: normalizeStartDate(parseOk ? parsed.startDate : ""),
    };

    const normalizeBusinessNumber = (input) => {
      const raw = String(input || "").trim();
      if (!raw) return "";
      const digits = raw.replace(/\D/g, "");
      return digits;
    };

    const normalizedBusinessNumber = normalizeBusinessNumber(
      extracted.businessNumber,
    );

    const verification = {
      verified: false,
      provider: "gemini",
      message: parseOk
        ? "자동 인식 결과입니다. 저장 후 필요 시 수동으로 수정해주세요."
        : "자동 인식 결과를 해석하지 못했습니다. 이미지 화질을 높이거나(정면/선명) 다시 업로드 후, 필요 시 수동으로 입력해주세요.",
    };

    const isDuplicateKeyError = (err) => {
      const code = err?.code;
      const name = String(err?.name || "");
      const msg = String(err?.message || "");
      return (
        code === 11000 || name === "MongoServerError" || msg.includes("E11000")
      );
    };

    const baseSet = {
      businessLicense: {
        fileId: fileId || null,
        s3Key: key,
        originalName: originalName || "",
        uploadedAt: new Date(),
      },
      extracted: {
        companyName: extracted.companyName,
        address: extracted.address,
        phoneNumber: extracted.phoneNumber,
        email: extracted.email,
        representativeName: extracted.representativeName,
        businessType: extracted.businessType,
        businessItem: extracted.businessItem,
      },
      verification: {
        ...verification,
        checkedAt: new Date(),
      },
    };

    const setWithBusinessNumber = {
      ...baseSet,
      extracted: {
        ...baseSet.extracted,
        ...(normalizedBusinessNumber
          ? { businessNumber: normalizedBusinessNumber }
          : {}),
      },
    };

    if (hasOrganization && org?._id) {
      try {
        await RequestorOrganization.findByIdAndUpdate(req.user.organizationId, {
          $set: normalizedBusinessNumber ? setWithBusinessNumber : baseSet,
        });
      } catch (e) {
        if (normalizedBusinessNumber && isDuplicateKeyError(e)) {
          const verificationOverride = {
            ...verification,
            reason: "duplicate_business_number",
            message:
              "사업자등록번호가 이미 등록되어 있어 자동 저장을 건너뛰었습니다. 사업자등록번호를 확인하거나, 기존 기공소에 가입 요청을 진행해주세요.",
          };

          await RequestorOrganization.findByIdAndUpdate(
            req.user.organizationId,
            {
              $set: {
                ...baseSet,
                verification: {
                  ...verificationOverride,
                  checkedAt: new Date(),
                },
              },
            },
          );

          return res.json({
            success: true,
            data: {
              input: {
                fileId: fileId || null,
                s3Key: key,
                originalName: originalName || null,
              },
              extracted: {
                ...baseSet.extracted,
                businessNumber: "",
              },
              verification: {
                ...verificationOverride,
              },
            },
          });
        }
        throw e;
      }
    }

    return res.json({
      success: true,
      data: {
        input: {
          fileId: fileId || null,
          s3Key: key,
          originalName: originalName || null,
        },
        extracted: {
          ...extracted,
          businessNumber: normalizedBusinessNumber || "",
        },
        verification,
      },
    });
  } catch (error) {
    console.error("[AI] parseBusinessLicense error", error);
    return res.status(500).json({
      success: false,
      message: "사업자등록증 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// genAI는 이제 getGenAI()를 통해 지연 초기화됨

const buildFallbackFromFilenames = (filenames) =>
  filenames.map((name) => ({
    filename: name,
    clinicName: null,
    patientName: null,
    tooth: "",
  }));

// 파일명 분석 결과 캐시 (동일 filenames에 대한 중복 호출 방지)
// key: JSON.stringify(sorted filenames), value: { data, createdAt }
const parseFilenamesCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

const getCacheKey = (filenames) => {
  const sorted = [...filenames].sort();
  return JSON.stringify(sorted);
};

const getCachedResult = (filenames) => {
  const key = getCacheKey(filenames);
  const cached = parseFilenamesCache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.createdAt > CACHE_TTL_MS) {
    parseFilenamesCache.delete(key);
    return null;
  }

  console.log("[AI] parseFilenames: cache hit", { count: filenames.length });
  return cached.data;
};

const setCachedResult = (filenames, data) => {
  const key = getCacheKey(filenames);
  parseFilenamesCache.set(key, { data, createdAt: Date.now() });
};

export async function parseFilenames(req, res) {
  try {
    const { filenames } = req.body || {};

    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({
        success: false,
        message: "filenames 배열이 필요합니다.",
      });
    }

    // 1. 캐시 확인 (동일 filenames에 대한 중복 호출 방지)
    const cachedResult = getCachedResult(filenames);
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        provider: "cache",
      });
    }

    // 2. Gemini 호출에 대한 백엔드 레벨 rate guard
    const clientIp =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      (req.connection && req.connection.remoteAddress) ||
      "unknown";
    const guardKey = `gemini-parseFilenames:${clientIp}`;
    const { blocked, count } = shouldBlockExternalCall(guardKey);
    if (blocked) {
      console.error("[AI] parseFilenames: rate guard blocked", {
        clientIp,
        count,
      });
      return res.status(429).json({
        success: false,
        message:
          "Gemini 외부 API가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const genAI = getGenAI();
    if (!genAI) {
      // Gemini 미구성 시에도 API는 살아 있으되, 단순히 기본 파싱만 수행
      const fallback = buildFallbackFromFilenames(filenames);
      return res.json({ success: true, data: fallback, provider: "none" });
    }

    try {
      console.log("[AI] parseFilenames: start", { count: filenames.length });

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });
      console.log("[AI] parseFilenames: model created");

      const example =
        "예시 파일명: 20251119고운치과_김혜영_32-42_4.stl\n" +
        "이 예시의 해석:\n" +
        "- clinicName: 고운치과\n" +
        "- patientName: 김혜영\n" +
        "- tooth: '32-42' (FDI 방식 치식 번호들을 사람이 읽기 쉬운 문자열로 표현)";

      const prompt =
        "너는 치과 기공소에서 사용하는 STL 파일명을 해석하는 도우미야.\n" +
        "입력으로 STL 파일명 목록을 줄 테니, 각 파일명에 대해 다음 정보를 JSON으로만 반환해줘.\n" +
        "\n" +
        "반환 형식(JSON 배열):\n" +
        "[\n" +
        "  {\n" +
        '    "filename": string,               // 원본 파일명 그대로\n' +
        '    "clinicName": string | null,     // 치과/의원 이름(추정). 없으면 null\n' +
        '    "patientName": string | null,    // 환자 이름(추정). 없으면 null\n' +
        '    "tooth": string | null           // 예: "32", "32-42" 등 치식 정보를 나타내는 문자열, 없으면 null\n' +
        "  }\n" +
        "]\n" +
        "\n" +
        "주의사항:\n" +
        "- 반드시 JSON만 반환하고, 설명 문장은 JSON 바깥에 쓰지 마.\n" +
        "- tooth는 치식 정보를 사람이 읽기 쉬운 한 줄 문자열로만 표현해줘. 예: '26', '26-27', '13,23'.\n" +
        "- clinicName은 파일명에 '치과', 'dental', '치과의원' 등 패턴이 있으면 그 부분을 기준으로 추론해줘. 없으면 null.\n" +
        "\n" +
        example +
        "\n\n" +
        "이제 아래 filenames 배열을 해석해줘.\n" +
        JSON.stringify({ filenames });

      console.log("[AI] parseFilenames: calling generateContent");
      const result = await model.generateContent(prompt);
      console.log("[AI] parseFilenames: generateContent done");

      const text = result.response.text();
      console.log("[AI] parseFilenames: raw response text", text);

      // Gemini가 종종 ```json ... ``` 코드블록으로 응답하는 경우를 대비해
      // 코드블록 마커를 제거한 순수 JSON 문자열로 정규화한다.
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        const firstNewline = cleaned.indexOf("\n");
        const lastFence = cleaned.lastIndexOf("```");
        if (
          firstNewline !== -1 &&
          lastFence !== -1 &&
          lastFence > firstNewline
        ) {
          cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
        }
      }
      console.log("[AI] parseFilenames: cleaned JSON text", cleaned);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
        console.log("[AI] parseFilenames: JSON.parse success");
      } catch (e) {
        console.error("[AI] parseFilenames: JSON.parse error", e);
        const fallback = buildFallbackFromFilenames(filenames);
        return res.json({
          success: true,
          data: fallback,
          provider: "fallback-json-parse-error",
        });
      }

      if (!Array.isArray(parsed)) {
        console.error("[AI] parseFilenames: parsed is not array", parsed);
        const fallback = buildFallbackFromFilenames(filenames);
        return res.json({
          success: true,
          data: fallback,
          provider: "fallback-non-array",
        });
      }

      console.log("[AI] parseFilenames: success", { items: parsed.length });

      // 성공 결과를 캐시에 저장
      setCachedResult(filenames, parsed);

      return res.json({ success: true, data: parsed, provider: "gemini" });
    } catch (error) {
      console.error(
        "[AI] parseFilenames: gemini call failed, fallback to basic",
        error,
      );

      const fallback = buildFallbackFromFilenames(filenames);

      if (error && typeof error === "object" && error.status === 429) {
        const resetTimeKst = "17:00";

        return res.json({
          success: true,
          data: fallback,
          provider: "fallback-quota-exceeded",
          quota: {
            type: "daily",
            status: "exhausted",
            message: `오늘 Gemini 무료 쿼터가 소진되었습니다. 내일 ${resetTimeKst} 이후에 다시 시도해주세요.`,
            resetTimeKst,
          },
        });
      }

      return res.json({
        success: true,
        data: fallback,
        provider: "fallback-external-error",
      });
    }
  } catch (error) {
    console.error("[AI] parseFilenames error (outer catch)", error);
    return res.status(500).json({
      success: false,
      message: "파일명 해석 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사/관리자: 생산 이미지에서 로트넘버(각인코드) 인식
 * @route POST /api/ai/recognize-lot-number
 * body: { s3Key, originalName }
 */
export async function recognizeLotNumber(req, res) {
  try {
    const { s3Key, originalName } = req.body || {};

    if (!s3Key) {
      return res.status(400).json({
        success: false,
        message: "s3Key가 필요합니다.",
      });
    }

    if (!req.user || !["manufacturer", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const genAI = getGenAI();
    if (!genAI) {
      return res.status(503).json({
        success: false,
        message: "AI 서비스가 구성되지 않았습니다.",
      });
    }

    // S3에서 이미지 다운로드
    const buffer = await getObjectBufferFromS3(s3Key);
    if (!buffer || buffer.length === 0) {
      return res.status(404).json({
        success: false,
        message: "S3에서 파일을 찾을 수 없습니다.",
      });
    }

    // Rate guard
    const clientIp =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      (req.connection && req.connection.remoteAddress) ||
      "unknown";
    const guardKey = `gemini-recognizeLotNumber:${clientIp}`;
    const guard = shouldBlockExternalCall(guardKey);
    if (guard?.blocked) {
      return res.status(429).json({
        success: false,
        message:
          "AI 외부 API가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const model = genAI.getGenerativeModel({
      // gemini-1.5-flash deprecated on v1beta; gemini-2.0-flash is current
      model: "gemini-2.0-flash",
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
      '  "lotNumber": string,  // 인식된 3글자 영문 대문자 코드, 없으면 빈 문자열\n' +
      '  "confidence": string  // "high", "medium", "low" 중 하나\n' +
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
      console.error("[AI] recognizeLotNumber: JSON parse failed", {
        originalName,
        s3Key,
        sample: cleaned.slice(0, 400),
      });
      return res.json({
        success: true,
        data: {
          lotNumber: "",
          confidence: "low",
        },
        message: "로트넘버를 인식하지 못했습니다.",
      });
    }

    const extracted = {
      lotNumber: String(parsed.lotNumber || "").trim(),
      confidence: String(parsed.confidence || "low").trim(),
    };

    return res.json({
      success: true,
      data: extracted,
      message: extracted.lotNumber
        ? "로트넘버를 인식했습니다."
        : "로트넘버를 찾지 못했습니다.",
    });
  } catch (error) {
    console.error("[AI] recognizeLotNumber error", error);
    return res.status(500).json({
      success: false,
      message: "로트넘버 인식 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default { parseFilenames, parseBusinessLicense, recognizeLotNumber };
