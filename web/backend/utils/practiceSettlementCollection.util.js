// related files:
// - web/backend/jobs/monthlyPracticeObSettlementWorker.js
// - web/backend/services/practiceObBilling.service.js
// - web/backend/utils/creditLock.util.js
//
// 치과 → 어벗츠 하나은행 월 기공료 입금·1일/5일 안내 문자·미납 정지.
// 정책 재개 전까지 기본 OFF. PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED=true 로만 켠다.

/** 월 기공료 입금 수집·안내 문자·미납 정지가 켜져 있는지. 기본 false(중단). */
export function isPracticeMonthlySettlementCollectionEnabled() {
  return (
    String(process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
}
