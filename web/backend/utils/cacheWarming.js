// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
/**
 * 캐시 워밍 유틸리티
 * 서버 시작 시 자주 사용되는 데이터를 미리 캐싱
 */

import cache, { CacheKeys, CacheTTL } from "./cache.utils.js";
import { getDeliveryEtaLeadDays } from "../controllers/requests/utils.js";
import { loadAutoMatchBudgetCatalog } from "./practiceTransferAutoMatchBudget.js";

/**
 * 배송 리드타임 캐시 워밍
 */
async function warmDeliveryLeadDays() {
  try {
    const leadDays = await getDeliveryEtaLeadDays();
    cache.set(CacheKeys.deliveryLeadDays(), leadDays, CacheTTL.VERY_LONG);
    console.log("[CacheWarming] ✅ Delivery lead days cached");
  } catch (error) {
    console.error(
      "[CacheWarming] ❌ Failed to cache delivery lead days:",
      error.message,
    );
  }
}

async function warmAbutsLabFeeCatalog() {
  try {
    await loadAutoMatchBudgetCatalog();
    console.log("[CacheWarming] ✅ Abuts lab fee catalog cached");
  } catch (error) {
    console.error(
      "[CacheWarming] ❌ Failed to cache abuts lab fee catalog:",
      error.message,
    );
  }
}

/**
 * 모든 캐시 워밍 실행
 */
export async function warmupCache() {
  console.log("[CacheWarming] 🔥 Starting cache warming...");

  const startTime = Date.now();

  await Promise.allSettled([
    warmDeliveryLeadDays(),
    warmAbutsLabFeeCatalog(),
  ]);

  const duration = Date.now() - startTime;
  console.log(`[CacheWarming] ✅ Cache warming completed in ${duration}ms`);
  console.log(`[CacheWarming] 📊 Cache stats:`, cache.stats());
}

/**
 * 주기적 캐시 갱신 (선택적)
 */
export function startPeriodicCacheRefresh() {
  // 30분마다 배송 리드타임 갱신
  setInterval(
    () => {
      warmDeliveryLeadDays();
      warmAbutsLabFeeCatalog();
    },
    30 * 60 * 1000,
  );

  console.log(
    "[CacheWarming] 🔄 Periodic cache refresh started (every 30 minutes)",
  );
}
