// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/hooks/useSystemSettings.ts
// - 2026-08-14: quote-context 단가 + credit-settings 단가를 견적에 반영. 캐시 60s.
// - 2026-08-14: quote-context 인 inflight 합류 — intake/치아차트 중복 GET 방지.
// - 2026-08-14: 환봉 요청중 판별용 implantFavorites를 견적 계산에 전달.
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import {
  DEFAULT_QUOTE_CONTEXT,
  buildFeeQuoteFromContext,
  parsePracticeTransferQuoteContext,
  type PracticeTransferFeeQuote,
  type PracticeTransferQuoteContext,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  normalizeAbutsAbutmentCreditPrices,
  type AbutsAbutmentCreditPrices,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";
import type { ImplantFavoriteForFee } from "@/shared/practice/labFeeSchedule";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { useAuthStore } from "@/store/useAuthStore";

const AUTO_MATCH_LAB_ID = "__auto_match__";
const CONTEXT_CACHE_TTL_MS = 60_000;
const contextCache = new Map<
  string,
  { value: PracticeTransferQuoteContext; expiresAt: number }
>();
const contextInflight = new Map<string, Promise<PracticeTransferQuoteContext>>();

const cacheKeyForLab = (labAnchorId: string | null) => labAnchorId || "__default__";

const readCachedContext = (cacheKey: string) => {
  const hit = contextCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    contextCache.delete(cacheKey);
    return null;
  }
  return hit.value;
};

const loadQuoteContext = (
  cacheKey: string,
  labAnchorId: string | null,
  token: string,
): Promise<PracticeTransferQuoteContext> => {
  const cached = readCachedContext(cacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = contextInflight.get(cacheKey);
  if (pending) return pending;

  const query = labAnchorId
    ? `?labAnchorId=${encodeURIComponent(labAnchorId)}`
    : "";
  const request = apiFetch<{ data?: unknown }>({
    path: `/api/practice/transfers/quote-context${query}`,
    method: "GET",
    token,
  })
    .then((res) => {
      const body = res.ok && res.data && typeof res.data === "object" ? res.data : null;
      const parsed = parsePracticeTransferQuoteContext(
        body && "data" in body ? (body as { data?: unknown }).data : body,
      );
      contextCache.set(cacheKey, {
        value: parsed,
        expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
      });
      return parsed;
    })
    .finally(() => {
      contextInflight.delete(cacheKey);
    });

  contextInflight.set(cacheKey, request);
  return request;
};

export const usePracticeTransferFeeQuote = (params: {
  enabled?: boolean;
  labAnchorId?: string | null;
  toothWorks?: ToothWorkSelection[] | null;
  implantFavorites?: ReadonlyArray<ImplantFavoriteForFee> | null;
  storedQuote?: PracticeTransferFeeQuote | null;
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
  abutmentPrices?: Partial<AbutsAbutmentCreditPrices> | null;
}): {
  quote: PracticeTransferFeeQuote;
  contextReady: boolean;
} => {
  const enabled = params.enabled !== false;
  const { token } = useAuthStore();
  const { data: systemSettings } = useSystemSettings();
  const toothWorks = params.toothWorks;
  const storedQuote = params.storedQuote;
  const rawLabId = String(params.labAnchorId || "").trim();
  const labAnchorId =
    !rawLabId || rawLabId === AUTO_MATCH_LAB_ID ? null : rawLabId;
  const cacheKey = cacheKeyForLab(labAnchorId);
  const [context, setContext] = useState<PracticeTransferQuoteContext>(
    () => readCachedContext(cacheKey) || DEFAULT_QUOTE_CONTEXT,
  );
  const [contextReady, setContextReady] = useState(() => Boolean(readCachedContext(cacheKey)));
  const settingsPrices = useMemo(
    () =>
      systemSettings?.creditSettings
        ? normalizeAbutsAbutmentCreditPrices(systemSettings.creditSettings)
        : null,
    [systemSettings?.creditSettings],
  );

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    void loadQuoteContext(cacheKey, labAnchorId, token).then((parsed) => {
      if (cancelled) return;
      setContext(parsed);
      setContextReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, labAnchorId, token]);

  const liveQuote = useMemo(
    () =>
      buildFeeQuoteFromContext({
        toothWorks,
        implantFavorites: params.implantFavorites,
        context: {
          ...context,
          abutmentPricingTier:
            params.abutmentPricingTier || context.abutmentPricingTier,
          abutmentPrices: normalizeAbutsAbutmentCreditPrices(
            params.abutmentPrices || settingsPrices || context.abutmentPrices,
          ),
        },
      }),
    [
      context,
      params.abutmentPrices,
      params.abutmentPricingTier,
      params.implantFavorites,
      settingsPrices,
      toothWorks,
    ],
  );

  const quote = storedQuote && storedQuote.total > 0 ? storedQuote : liveQuote;

  return { quote, contextReady };
};
