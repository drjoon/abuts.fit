// 커스텀어벗 AI 디자인 대화의 토큰 금액.
// Gemini 3.5 Flash-Lite 유료 단가(2026-11): 입력 $0.30 / 1M, 캐시 입력 $0.03 / 1M, 출력(생각 토큰 포함) $2.50 / 1M.
// 원화는 2026-11-13 매매기준율 1,332원. 호출 때 확정하고 나중에 환율이 바뀌어도 기록은 그대로 둔다.
// related files:
// - web/backend/services/aiDesignChatUsage.service.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js

/** 달러 1 = 1,332원. 2026-11-13 매매기준율. */
export const AI_DESIGN_CHAT_FX_KRW_PER_USD = 1332;

export const AI_DESIGN_CHAT_MODEL = "gemini-3.5-flash-lite";

const INPUT_USD_PER_MILLION = 0.3;
const CACHED_INPUT_USD_PER_MILLION = 0.03;
const OUTPUT_USD_PER_MILLION = 2.5;

const whole = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
};

/**
 * Gemini usageMetadata → 청구 토큰과 원화.
 * 생각 토큰이 total에 이미 들어 있으면 출력을 두 번 더하지 않는다.
 */
export function quoteAiDesignChatUsage(meta) {
  const inputTokens = whole(meta?.promptTokenCount ?? meta?.inputTokens);
  const cachedTokens = Math.min(inputTokens, whole(meta?.cachedContentTokenCount ?? meta?.cachedTokens));
  const candidates = whole(meta?.candidatesTokenCount);
  const thoughtsTokens = whole(meta?.thoughtsTokenCount ?? meta?.thoughtsTokens);
  const reportedTotal = whole(meta?.totalTokenCount);
  const separate = inputTokens + candidates + thoughtsTokens;
  const outputTokens =
    thoughtsTokens > 0 && reportedTotal > 0 && reportedTotal + 1 < separate
      ? Math.max(0, reportedTotal - inputTokens)
      : candidates + thoughtsTokens || whole(meta?.outputTokens);
  const totalTokens = reportedTotal || inputTokens + outputTokens;
  const freshInput = Math.max(0, inputTokens - cachedTokens);
  const usd =
    (freshInput * INPUT_USD_PER_MILLION +
      cachedTokens * CACHED_INPUT_USD_PER_MILLION +
      outputTokens * OUTPUT_USD_PER_MILLION) /
    1_000_000;
  const costUsdMicros = Math.round(usd * 1_000_000);
  const costKrw = Math.round((costUsdMicros / 1_000_000) * AI_DESIGN_CHAT_FX_KRW_PER_USD);
  return {
    inputTokens,
    cachedTokens,
    outputTokens,
    thoughtsTokens,
    totalTokens,
    costUsdMicros,
    costKrw,
    fxKrwPerUsd: AI_DESIGN_CHAT_FX_KRW_PER_USD,
  };
}

/** 저장한 마이크로달러 합을 원화로. 건별 반올림을 더하지 않는다. */
export function krwFromUsdMicros(costUsdMicros) {
  const micros = Number(costUsdMicros);
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return Math.round((micros / 1_000_000) * AI_DESIGN_CHAT_FX_KRW_PER_USD);
}
