#!/usr/bin/env node
/**
 * DEPRECATED
 *
 * 본 스크립트는 레거시 CreditLedger 기반 분석 로직이므로 사용 중단합니다.
 * General Ledger(SSOT) 기준 점검은 아래 경로를 사용하세요.
 *
 * 1) node web/backend/scripts/reconcile-business-credit-spends.mjs --all-requestors
 * 2) 관리자 API: /api/admin/credit-reconcile/check, /api/admin/credit-reconcile/execute
 */

console.error("[DEPRECATED] analyze-credit-discrepancy.mjs is disabled. Use General Ledger tools.");
process.exit(1);
