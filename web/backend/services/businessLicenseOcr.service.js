// related files:
// - web/backend/rules.md
// - web/backend/controllers/ai/ai.controller.js
// - web/backend/scripts/backfillBusinessAnchorMetadata.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

// 지연 초기화: dotenv 로드 후 첫 호출 시 초기화
let _apiKey = null;
let _genAI = null;
let _initialized = false;

export const getGenAI = () => {
  if (!_initialized) {
    _initialized = true;
    _apiKey = process.env.GOOGLE_API_KEY;
    if (!_apiKey) {
      console.warn(
        "[AI] GOOGLE_API_KEY is not set. Gemini business license parsing will be disabled.",
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
 * @param {Buffer} buffer - 원본 이미지 버퍼
 * @param {Object} options - 전처리 옵션
 * @param {number} options.maxWidth - 최대 너비 (기본: 1024)
 * @param {boolean} options.grayscale - 그레이스케일 변환 여부 (기본: true)
 * @param {number} options.quality - JPG 압축 품질 (기본: 85)
 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
export async function preprocessImageForGemini(buffer, options = {}) {
  const { maxWidth = 1024, grayscale = true, quality = 85 } = options;

  try {
    let pipeline = sharp(buffer);
    const metadata = await pipeline.metadata();
    const originalWidth = metadata.width || 0;

    if (originalWidth > maxWidth) {
      pipeline = pipeline.resize(maxWidth, null, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (grayscale) {
      pipeline = pipeline.grayscale();
    }

    const processedBuffer = await pipeline
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return {
      buffer: processedBuffer,
      mimeType: "image/jpeg",
    };
  } catch (error) {
    console.error("[AI] preprocessImage: failed, using original", error);
    const mimeType =
      buffer[0] === 0x89 && buffer[1] === 0x50 ? "image/png" : "image/jpeg";
    return { buffer, mimeType };
  }
}

function tryParseJsonObject(input) {
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
}

function normalizeStartDate(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  return digits;
}

export function normalizeBusinessNumber(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

/**
 * 사업자등록증 이미지 버퍼로부터 Gemini OCR로 필드를 추출한다.
 * `controllers/ai/ai.controller.js`의 `parseBusinessLicense`와
 * `scripts/backfillBusinessAnchorMetadata.js`가 공유하는 SSOT 구현.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   extracted: { companyName, businessNumber, address, phoneNumber, email, representativeName, businessType, businessItem, startDate },
 *   normalizedBusinessNumber: string,
 *   reason?: string,
 * }>}
 */
export async function extractBusinessLicenseFields(buffer) {
  const genAI = getGenAI();
  if (!genAI) {
    return {
      ok: false,
      reason: "no_api_key",
      extracted: null,
      normalizedBusinessNumber: "",
    };
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const { buffer: processedBuffer, mimeType } = await preprocessImageForGemini(
    buffer,
    {
      maxWidth: 4096,
      grayscale: true,
      quality: 95,
    },
  );
  const imageBase64 = processedBuffer.toString("base64");

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
    { inlineData: { data: imageBase64, mimeType } },
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

  const parsed = tryParseJsonObject(cleaned);
  const parseOk =
    !!parsed && typeof parsed === "object" && !Array.isArray(parsed);

  const extracted = {
    companyName: String((parseOk ? parsed.companyName : "") || "").trim(),
    businessNumber: String((parseOk ? parsed.businessNumber : "") || "").trim(),
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

  return {
    ok: parseOk,
    reason: parseOk ? null : "json_parse_failed",
    extracted,
    normalizedBusinessNumber: normalizeBusinessNumber(extracted.businessNumber),
  };
}
