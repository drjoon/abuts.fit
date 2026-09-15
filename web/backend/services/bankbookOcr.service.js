// related files:
// - web/backend/services/businessLicenseOcr.service.js
// - web/backend/controllers/ai/ai.controller.js
// - web/backend/utils/bankCodes.js
// change-log:
// - 2026-09-16: 통장 사본 Gemini OCR — 은행/계좌번호/예금주 추출.
import {
  getGenAI,
  preprocessImageForGemini,
} from "./businessLicenseOcr.service.js";
import { resolvePopbillBank } from "../utils/bankCodes.js";

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

function stripCodeFence(text) {
  let cleaned = String(text || "").trim();
  if (!cleaned.startsWith("```")) return cleaned;
  const firstNewline = cleaned.indexOf("\n");
  const lastFence = cleaned.lastIndexOf("```");
  if (firstNewline !== -1 && lastFence !== -1 && lastFence > firstNewline) {
    cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
  }
  return cleaned;
}

function normalizeAccountNumber(input) {
  return String(input || "")
    .replace(/[^\d]/g, "")
    .trim();
}

/**
 * 통장 사본 이미지 버퍼에서 입금 계좌 필드를 추출한다.
 * @returns {Promise<{
 *   ok: boolean,
 *   extracted: { bankName: string, accountNumber: string, holderName: string, bankCode: string },
 *   reason?: string,
 * }>}
 */
export async function extractBankbookFields(buffer) {
  const genAI = getGenAI();
  if (!genAI) {
    return {
      ok: false,
      reason: "no_api_key",
      extracted: {
        bankName: "",
        accountNumber: "",
        holderName: "",
        bankCode: "",
      },
    };
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
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
    "너는 한국 통장 사본(또는 계좌 확인서) 이미지를 읽어 입금 계좌 정보를 JSON으로만 추출하는 도우미야.\n" +
    '아래 스키마를 정확히 따르고, 값이 불확실하면 빈 문자열("")로 둬.\n' +
    "반드시 JSON만 반환하고 다른 설명은 하지 마.\n" +
    "bankName은 은행 정식명으로 (예: 국민은행, 신한은행, 카카오뱅크).\n" +
    "accountNumber는 숫자만 (하이픈·공백 제거).\n" +
    "holderName은 예금주명(상호·성명).\n\n" +
    "스키마:\n" +
    "{\n" +
    '  "bankName": string,\n' +
    '  "accountNumber": string,\n' +
    '  "holderName": string\n' +
    "}";

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { data: imageBase64, mimeType } },
  ]);

  const text = result?.response?.text?.() || "";
  const parsed = tryParseJsonObject(stripCodeFence(text));
  const parseOk =
    !!parsed && typeof parsed === "object" && !Array.isArray(parsed);

  const rawBankName = String((parseOk ? parsed.bankName : "") || "").trim();
  const resolved = resolvePopbillBank(rawBankName);
  const accountNumber = normalizeAccountNumber(
    parseOk ? parsed.accountNumber : "",
  );
  const holderName = String((parseOk ? parsed.holderName : "") || "").trim();

  const extracted = {
    bankName: resolved?.name || rawBankName,
    accountNumber,
    holderName,
    bankCode: resolved?.code || "",
  };

  const hasAny =
    Boolean(extracted.bankName) ||
    Boolean(extracted.accountNumber) ||
    Boolean(extracted.holderName);

  return {
    ok: parseOk && hasAny,
    reason: parseOk ? (hasAny ? null : "empty_fields") : "json_parse_failed",
    extracted,
  };
}
