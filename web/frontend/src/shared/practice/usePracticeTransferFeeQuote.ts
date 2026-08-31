// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/hooks/useSystemSettings.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - 2026-08-14: quote-context 단가 + credit-settings 단가를 견적에 반영. 캐시 60s.
// - 2026-08-14: quote-context 인 inflight 합류 — intake/치아차트 중복 GET 방지.
// - 2026-08-14: 환봉 요청중 판별용 implantFavorites를 견적 계산에 전달.
// - 2026-08-14: practice:lab-fee-multiplier-updated 수신 시 quote-context 재조회.
// - 2026-08-31: practice:lab-special-supply-updated 도 quote-context 재조회(특별공급가 삭제 즉시 반영).
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import {
  DEFAULT_QUOTE_CONTEXT,
  buildFeeQuoteFromContext,
  parsePracticeTransferQuoteContext,
  type PracticeTransferAutoMatchBudget,
  type PracticeTransferFeeQuote,
  type PracticeTransferQuoteContext,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  normalizeAbutsAbutmentCreditPrices,
  type AbutsAbutmentCreditPrices,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";
import type { ImplantFavoriteForFee } from "@/shared/practice/labFeeSchedule";
import { normalizeConfiguredRushFeeMultiplier } from "@/shared/practice/labFeeSchedule";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { useAuthStore } from "@/store/useAuthStore";

const CONTEXT_CACHE_TTL_MS = 60_000;
export const LAB_FEE_MULTIPLIER_UPDATED_EVENT =
  "practice:lab-fee-multiplier-updated";
export const LAB_SPECIAL_SUPPLY_UPDATED_EVENT =
  "practice:lab-special-supply-updated";

/** quote-context를 다시 받아야 하는 기공소 수가·특별공급가 변경 이벤트 */
export const LAB_FEE_QUOTE_CONTEXT_INVALIDATION_EVENTS = [
  LAB_FEE_MULTIPLIER_UPDATED_EVENT,
  LAB_SPECIAL_SUPPLY_UPDATED_EVENT,
] as const;

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

/** 기공수가 할증·수가 변경 시 클라이언트 quote-context 캐시 무효화. */
export function invalidatePracticeTransferQuoteContextCache(
  labAnchorId?: string | null,
) {
  const raw = String(labAnchorId || "").trim();
  if (!raw) {
    contextCache.clear();
    contextInflight.clear();
    return;
  }
  const key = cacheKeyForLab(raw);
  contextCache.delete(key);
  contextInflight.delete(key);
}

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
  /** @deprecated 무시. 치과 멤버십 폐지 — 항상 고시 단일가. */
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
  abutmentPrices?: Partial<AbutsAbutmentCreditPrices> | null;
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
  rushFeeMultiplier?: number;
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
    /^[a-fA-F0-9]{24}$/.test(rawLabId) ? rawLabId : null;
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

  useAppEventListener({
    enabled: enabled && Boolean(token) && Boolean(labAnchorId),
    eventTypes: [...LAB_FEE_QUOTE_CONTEXT_INVALIDATION_EVENTS],
    deferWhenEditing: false,
    shouldHandle: (evt) => {
      const data =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as { labAnchorId?: unknown })
          : null;
      const eventLabId = String(data?.labAnchorId || "").trim();
      return Boolean(eventLabId) && eventLabId === labAnchorId;
    },
    onMatch: () => {
      if (!token || !labAnchorId) return;
      invalidatePracticeTransferQuoteContextCache(labAnchorId);
      void loadQuoteContext(cacheKey, labAnchorId, token).then((parsed) => {
        setContext(parsed);
        setContextReady(true);
      });
    },
  });

  const liveQuote = useMemo(() => {
    const requestedRush = Number(params.rushFeeMultiplier);
    const rushFeeMultiplier =
      Number.isFinite(requestedRush) && requestedRush > 1
        ? normalizeConfiguredRushFeeMultiplier(
            context.practiceRushFeeMultiplier || requestedRush,
          )
        : 1;
    return buildFeeQuoteFromContext({
      toothWorks,
      implantFavorites: params.implantFavorites,
      autoMatchBudget: params.autoMatchBudget,
      rushFeeMultiplier,
      context: {
        ...context,
        abutmentPricingTier:
          params.abutmentPricingTier || context.abutmentPricingTier,
        abutmentPrices: normalizeAbutsAbutmentCreditPrices(
          params.abutmentPrices || settingsPrices || context.abutmentPrices,
        ),
      },
    });
  }, [
    context,
    params.abutmentPrices,
    params.abutmentPricingTier,
    params.autoMatchBudget,
    params.implantFavorites,
    params.rushFeeMultiplier,
    settingsPrices,
    toothWorks,
  ]);

  const quote = storedQuote && storedQuote.total > 0 ? storedQuote : liveQuote;

  return { quote, contextReady };
};
