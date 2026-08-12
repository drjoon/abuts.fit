// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { shouldBlockExternalCall } from "../../utils/rateGuard.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { assertBusinessRole } from "../businesses/businessRole.util.js";
import s3Utils, { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import sharp from "sharp";
import {
  getGenAI as getSharedGenAI,
  extractBusinessLicenseFields,
} from "../../services/businessLicenseOcr.service.js";

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

/**
 * 이미지 전처리: 토큰 다이어트를 위한 리사이징 및 최적화
 * - 문서 인식(사업자등록증): 1024px 이하 + 그레이스케일 + JPG 압축
 * - 로트넘버 인식: 1024px 이하 + 그레이스케일 + JPG 압축
 * @param {Buffer} buffer - 원본 이미지 버퍼
 * @param {Object} options - 전처리 옵션
 * @param {number} options.maxWidth - 최대 너비 (기본: 1024)
 * @param {boolean} options.grayscale - 그레이스케일 변환 여부 (기본: true)
 * @param {number} options.quality - JPG 압축 품질 (기본: 85)
 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
async function preprocessImageForGemini(buffer, options = {}) {
  const { maxWidth = 1024, grayscale = true, quality = 85 } = options;

  try {
    let pipeline = sharp(buffer);

    // 메타데이터 조회하여 현재 크기 확인
    const metadata = await pipeline.metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    console.log("[AI] preprocessImage: original size", {
      width: originalWidth,
      height: originalHeight,
      format: metadata.format,
    });

    // 리사이징 (너비가 maxWidth 초과 시에만)
    if (originalWidth > maxWidth) {
      pipeline = pipeline.resize(maxWidth, null, {
        fit: "inside",
        withoutEnlargement: true,
      });
      console.log("[AI] preprocessImage: resizing to max width", maxWidth);
    }

    // 그레이스케일 변환 (문서 인식에는 색상 정보 불필요)
    if (grayscale) {
      pipeline = pipeline.grayscale();
      console.log("[AI] preprocessImage: converting to grayscale");
    }

    // JPG 포맷으로 변환 및 압축
    const processedBuffer = await pipeline
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const reduction = (
      ((buffer.length - processedBuffer.length) / buffer.length) *
      100
    ).toFixed(1);

    console.log("[AI] preprocessImage: optimization complete", {
      originalSize: buffer.length,
      processedSize: processedBuffer.length,
      reduction: `${reduction}%`,
    });

    return {
      buffer: processedBuffer,
      mimeType: "image/jpeg",
    };
  } catch (error) {
    console.error("[AI] preprocessImage: failed, using original", error);
    // 전처리 실패 시 원본 반환
    const mimeType =
      buffer[0] === 0x89 && buffer[1] === 0x50 ? "image/png" : "image/jpeg";
    return { buffer, mimeType };
  }
}

export async function parseBusinessLicense(req, res) {
  try {
    const { fileId, s3Key, originalName } = req.body || {};

    if (!fileId && !s3Key) {
      return res.status(400).json({
        success: false,
        message: "fileId 또는 s3Key가 필요합니다.",
      });
    }

    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const businessAnchorId = String(req.user?.businessAnchorId || "").trim();
    const hasBusinessAnchor = Boolean(businessAnchorId);
    let anchor = null;
    if (hasBusinessAnchor) {
      anchor = await BusinessAnchor.findOne({
        _id: businessAnchorId,
        businessType,
      })
        .select({ primaryContactUserId: 1, owners: 1 })
        .lean();
      const meId = String(req.user._id);
      const canUpload =
        anchor &&
        (String(anchor.primaryContactUserId) === meId ||
          (Array.isArray(anchor.owners) &&
            anchor.owners.some((c) => String(c) === meId)));
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

    const genAI = getSharedGenAI();
    if (!genAI) {
      const extracted = {};
      const verification = {
        verified: false,
        provider: "none",
        message:
          "GOOGLE_API_KEY가 설정되지 않아 사업자등록증 자동 인식이 비활성화되어 있습니다.",
      };

      if (hasBusinessAnchor && anchor?._id) {
        await BusinessAnchor.findByIdAndUpdate(businessAnchorId, {
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

      // SSOT: metadata로 응답 (extracted 레거시 제거)
      return res.json({
        success: true,
        data: {
          input: {
            fileId: fileId || null,
            s3Key: key,
            originalName: originalName || null,
          },
          metadata: extracted,
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

    const { ok: parseOk, extracted, normalizedBusinessNumber } =
      await extractBusinessLicenseFields(buffer);
    if (!parseOk) {
      console.error("[AI] parseBusinessLicense: JSON parse failed", {
        originalName,
        s3Key: key,
      });
    }

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

    // SSOT: metadata 사용 (extracted 레거시 제거)
    const baseSet = {
      businessLicense: {
        fileId: fileId || null,
        s3Key: key,
        originalName: originalName || "",
        uploadedAt: new Date(),
      },
      "metadata.companyName": extracted.companyName,
      "metadata.address": extracted.address,
      "metadata.phoneNumber": extracted.phoneNumber,
      "metadata.email": extracted.email,
      "metadata.representativeName": extracted.representativeName,
      "metadata.businessType": extracted.businessType,
      "metadata.businessItem": extracted.businessItem,
      verification: {
        ...verification,
        checkedAt: new Date(),
      },
    };

    const setWithBusinessNumber = {
      ...baseSet,
      ...(normalizedBusinessNumber
        ? { "metadata.businessNumber": normalizedBusinessNumber }
        : {}),
    };

    if (hasBusinessAnchor && anchor?._id) {
      try {
        await BusinessAnchor.findByIdAndUpdate(businessAnchorId, {
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

          await BusinessAnchor.findByIdAndUpdate(businessAnchorId, {
            $set: {
              ...baseSet,
              verification: {
                ...verificationOverride,
                checkedAt: new Date(),
              },
            },
          });

          return res.json({
            success: true,
            data: {
              input: {
                fileId: fileId || null,
                s3Key: key,
                originalName: originalName || null,
              },
              metadata: {
                companyName: extracted.companyName,
                address: extracted.address,
                phoneNumber: extracted.phoneNumber,
                email: extracted.email,
                representativeName: extracted.representativeName,
                businessType: extracted.businessType,
                businessItem: extracted.businessItem,
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
        metadata: {
          ...extracted,
          businessNumber: normalizedBusinessNumber || "",
        },
        verification,
      },
    });
  } catch (error) {
    console.error("[AI] parseBusinessLicense error", error);

    // Gemini API 할당량 초과 에러
    if (error?.status === 429 || error?.errorDetails) {
      return res.status(429).json({
        success: false,
        message:
          "AI 인식 서비스 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.",
        error: error.message,
      });
    }

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

const VALID_TOOTH =
  /^([1-4][1-8])(-[1-4][1-8])?([,\s]+[1-4][1-8](-[1-4][1-8])?)*$/;

/**
 * AI가 날짜(YYYYMMDD) 부분숫자를 tooth로 반환했는지 검사.
 * 예: filename=20260804-홍길동-37.stl, tooth=26 → 날짜 내부 오인
 */
const isToothFromDateDigits = (filename, tooth) => {
  const t = String(tooth || "").trim();
  if (!/^[1-4][1-8]$/.test(t)) return false;

  const name = String(filename || "");
  const dateMatches = name.matchAll(/\d{8}/g);
  for (const m of dateMatches) {
    const dateToken = m[0];
    const dateStart = m.index ?? -1;
    if (dateStart < 0) continue;
    if (!dateToken.includes(t)) continue;

    // 같은 숫자가 날짜 밖에도 독립 토큰으로 있으면 허용
    const standalone = new RegExp(`(^|[^0-9])${t}([^0-9]|$)`);
    let hasOutside = false;
    let searchFrom = 0;
    while (searchFrom < name.length) {
      const slice = name.slice(searchFrom);
      const sm = slice.match(standalone);
      if (!sm || sm.index === undefined) break;
      const absIndex = searchFrom + sm.index + (sm[1] ? sm[1].length : 0);
      const insideThisDate =
        absIndex >= dateStart && absIndex < dateStart + dateToken.length;
      if (!insideThisDate) {
        hasOutside = true;
        break;
      }
      searchFrom = absIndex + t.length;
    }
    if (!hasOutside) return true;
  }
  return false;
};

const sanitizeParsedFilenameItem = (item) => {
  const filename = typeof item?.filename === "string" ? item.filename : "";
  const toNullIfEmpty = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };

  let clinicName = toNullIfEmpty(item?.clinicName);
  let patientName = toNullIfEmpty(item?.patientName);
  let tooth = toNullIfEmpty(item?.tooth);

  if (tooth) {
    const normalized = tooth.replace(/\s+/g, "");
    if (
      !VALID_TOOTH.test(normalized) ||
      (/^[1-4][1-8]$/.test(normalized) &&
        isToothFromDateDigits(filename, normalized))
    ) {
      tooth = null;
    } else {
      tooth = normalized;
    }
  }

  return {
    filename,
    clinicName,
    patientName,
    tooth,
  };
};

const sanitizeParsedFilenames = (items, originalFilenames) => {
  if (!Array.isArray(items)) {
    return buildFallbackFromFilenames(originalFilenames);
  }

  return items.map((item, idx) => {
    const sanitized = sanitizeParsedFilenameItem(item);
    if (!sanitized.filename && originalFilenames[idx]) {
      sanitized.filename = originalFilenames[idx];
    }
    return sanitized;
  });
};

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

      const prompt =
        "너는 치과 기공소 STL 파일명에서 clinicName/patientName/tooth만 추출하는 파서다.\n" +
        "추측하지 말고, 파일명에 명확히 있는 정보만 채워라. 불확실하면 해당 필드는 반드시 null.\n" +
        "\n" +
        "반환 형식(JSON 배열만, 설명 금지):\n" +
        "[\n" +
        "  {\n" +
        '    "filename": string,            // 원본 파일명 그대로\n' +
        '    "clinicName": string | null,  // 치과/의원명. 없으면 null\n' +
        '    "patientName": string | null, // 환자명. 없으면 null\n' +
        '    "tooth": string | null        // FDI 치식. 예: "37", "32-42", "13,23". 없으면 null\n' +
        "  }\n" +
        "]\n" +
        "\n" +
        "치아번호(tooth) 규칙 (매우 중요):\n" +
        "- FDI 표기만 허용: 단일 11-18/21-28/31-38/41-48, 브리지/복수(예: 32-42, 13,23).\n" +
        "- 치아번호는 보통 환자명 뒤, 파일명 끝쪽의 독립 토큰이다.\n" +
        "- 날짜(YYYYMMDD, YYYY-MM-DD, YYMMDD 등) 안의 숫자를 치아번호로 쓰지 마라.\n" +
        "  예: 20260804 안의 26/08/04는 날짜다. tooth로 쓰지 말고, 끝의 37을 써라.\n" +
        "- 시리얼/버전/인덱스처럼 치식이 아닌 숫자(예: _1, _v2, (1))는 무시.\n" +
        "- 후보가 여러 개면 날짜가 아닌 가장 오른쪽(끝쪽) 치식 토큰을 선택.\n" +
        "- 확신이 없으면 tooth=null. 틀린 값보다 빈 값이 낫다.\n" +
        "\n" +
        "clinicName / patientName 규칙:\n" +
        "- clinicName: '치과','치과의원','dental','Dental','기공소' 등이 붙은 토큰만.\n" +
        "  없으면 null. 환자명을 치과명으로 넣지 마라.\n" +
        "- patientName: 사람 이름으로 보이는 토큰(한글 2~4자 또는 영문 이름).\n" +
        "  날짜/치아번호/치과명 토큰은 제외. 없으면 null.\n" +
        "- 없는 필드를 지어내지 마라.\n" +
        "\n" +
        "예시:\n" +
        '1) "20251119고운치과_김혜영_32-42_4.stl"\n' +
        '   -> clinicName:"고운치과", patientName:"김혜영", tooth:"32-42"\n' +
        '2) "20260804-홍길동-37.stl"\n' +
        '   -> clinicName:null, patientName:"홍길동", tooth:"37"  (20260804의 26 사용 금지)\n' +
        '3) "김철수_26.stl"\n' +
        '   -> clinicName:null, patientName:"김철수", tooth:"26"\n' +
        '4) "scan_upper.stl"\n' +
        "   -> clinicName:null, patientName:null, tooth:null\n" +
        "\n" +
        "아래 filenames를 해석해 JSON 배열만 반환해라.\n" +
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

      const sanitized = sanitizeParsedFilenames(parsed, filenames);

      // 성공 결과를 캐시에 저장
      setCachedResult(filenames, sanitized);

      return res.json({ success: true, data: sanitized, provider: "gemini" });
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
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    // 이미지 전처리: 인식 정확도 우선 (원본 해상도 유지, 그레이스케일 + 고품질 압축)
    const { buffer: processedBuffer, mimeType } =
      await preprocessImageForGemini(buffer, {
        maxWidth: 4096, // 원본 해상도 유지 (대부분의 스캔 이미지보다 큰 값)
        grayscale: true,
        quality: 95, // 고품질 압축으로 텍스트 선명도 유지
      });
    const imageBase64 = processedBuffer.toString("base64");

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
