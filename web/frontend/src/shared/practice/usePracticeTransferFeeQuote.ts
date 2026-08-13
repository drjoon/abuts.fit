// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import {
  DEFAULT_QUOTE_CONTEXT,
  buildFeeQuoteFromContext,
  parsePracticeTransferQuoteContext,
  type PracticeTransferFeeQuote,
  type PracticeTransferQuoteContext,
} from "@/shared/practice/practiceTransferFeeQuote";
import type { AbutsAbutmentPricingTier } from "@/shared/pricing/abutsAbutmentService";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { useAuthStore } from "@/store/useAuthStore";

const AUTO_MATCH_LAB_ID = "__auto_match__";
const contextCache = new Map<string, PracticeTransferQuoteContext>();

const cacheKeyForLab = (labAnchorId: string | null) => labAnchorId || "__default__";

export const usePracticeTransferFeeQuote = (params: {
  enabled?: boolean;
  labAnchorId?: string | null;
  toothWorks?: ToothWorkSelection[] | null;
  storedQuote?: PracticeTransferFeeQuote | null;
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
}): {
  quote: PracticeTransferFeeQuote;
  contextReady: boolean;
} => {
  const enabled = params.enabled !== false;
  const { token } = useAuthStore();
  const toothWorks = params.toothWorks;
  const storedQuote = params.storedQuote;
  const rawLabId = String(params.labAnchorId || "").trim();
  const labAnchorId =
    !rawLabId || rawLabId === AUTO_MATCH_LAB_ID ? null : rawLabId;
  const cacheKey = cacheKeyForLab(labAnchorId);
  const [context, setContext] = useState<PracticeTransferQuoteContext>(
    () => contextCache.get(cacheKey) || DEFAULT_QUOTE_CONTEXT,
  );
  const [contextReady, setContextReady] = useState(() => contextCache.has(cacheKey));

  useEffect(() => {
    if (!enabled || !token) return;
    const cached = contextCache.get(cacheKey);
    if (cached) {
      setContext(cached);
      setContextReady(true);
      return;
    }
    let cancelled = false;
    const query = labAnchorId
      ? `?labAnchorId=${encodeURIComponent(labAnchorId)}`
      : "";
    void apiFetch<{ data?: unknown }>({
      path: `/api/practice/transfers/quote-context${query}`,
      method: "GET",
      token,
    }).then((res) => {
      if (cancelled) return;
      const body = res.ok && res.data && typeof res.data === "object" ? res.data : null;
      const parsed = parsePracticeTransferQuoteContext(
        body && "data" in body ? (body as { data?: unknown }).data : body,
      );
      contextCache.set(cacheKey, parsed);
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
        context: {
          ...context,
          abutmentPricingTier:
            params.abutmentPricingTier || context.abutmentPricingTier,
        },
      }),
    [context, params.abutmentPricingTier, toothWorks],
  );

  const quote = storedQuote && storedQuote.total > 0 ? storedQuote : liveQuote;

  return { quote, contextReady };
};
