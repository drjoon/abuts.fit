// related files:
// - web/frontend/src/shared/demo/CreditUsageScopeFilter.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/requestor/credits/components/CreditStatisticsTab.tsx
// - web/backend/controllers/credits/creditLedger.utils.js

export type CreditUsageScope = "all" | "real" | "demo";

export type CreditUsageScopeSelection = {
  includeReal: boolean;
  includeDemo: boolean;
};

export const CREDIT_USAGE_SCOPE_GUIDE_STORAGE_KEY =
  "abuts.creditUsageScopeGuideSeen.v1";

export function toCreditUsageScope(
  selection: CreditUsageScopeSelection,
): CreditUsageScope {
  const { includeReal, includeDemo } = selection;
  if (includeReal && includeDemo) return "all";
  if (includeReal && !includeDemo) return "real";
  if (!includeReal && includeDemo) return "demo";
  return "all";
}

export function appendCreditUsageScopeParam(
  params: URLSearchParams,
  selection: CreditUsageScopeSelection,
) {
  const scope = toCreditUsageScope(selection);
  if (scope !== "all") params.set("usageScope", scope);
}

export function readCreditUsageScopeGuideSeen(): boolean {
  try {
    return localStorage.getItem(CREDIT_USAGE_SCOPE_GUIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCreditUsageScopeGuideSeen() {
  try {
    localStorage.setItem(CREDIT_USAGE_SCOPE_GUIDE_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}
