// related files:
// - web/backend/services/noOrderAlerts.service.js
export type NoOrderTier = "3m" | "6m";

export type NoOrderAlertItem = {
  businessAnchorId: string;
  name: string;
  kind: "practice" | "lab" | null;
  lastCompletedAt: string;
  tier: NoOrderTier;
  daysSinceCompletion: number;
};

export type NoOrderAlertSummary = {
  count3m: number;
  count6m: number;
  total: number;
};

export type NoOrderAlertsData = {
  summary: NoOrderAlertSummary;
  items: NoOrderAlertItem[];
};

export const NO_ORDER_TIER_LABEL: Record<NoOrderTier, string> = {
  "3m": "3개월",
  "6m": "6개월",
};
