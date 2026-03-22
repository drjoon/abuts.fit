const ADMIN_REFERRAL_CACHE_TTL_MS = 60 * 60 * 1000;

const __adminReferralCache = new Map();
const __adminReferralInFlight = new Map();

export function getAdminReferralCache(key) {
  const hit = __adminReferralCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ADMIN_REFERRAL_CACHE_TTL_MS) {
    __adminReferralCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setAdminReferralCache(key, value) {
  __adminReferralCache.set(key, { ts: Date.now(), value });
}

export async function withAdminReferralInFlight(key, factory) {
  const existing = __adminReferralInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (__adminReferralInFlight.get(key) === promise) {
        __adminReferralInFlight.delete(key);
      }
    });

  __adminReferralInFlight.set(key, promise);
  return promise;
}

function invalidateStoreKeys(store, predicate) {
  let removed = 0;
  for (const key of store.keys()) {
    const keyStr = String(key || "");
    if (!predicate(keyStr)) continue;
    store.delete(key);
    removed += 1;
  }
  return removed;
}

export function invalidateAdminReferralCachesForBusinessAnchorId(
  businessAnchorId,
) {
  const anchorId = String(businessAnchorId || "").trim();

  const matchAnchorKey = (keyStr) => {
    if (!anchorId) return false;
    return (
      keyStr.endsWith(`:${anchorId}`) ||
      keyStr.includes(`:${anchorId}:`) ||
      keyStr.includes(`anchor=${anchorId}`)
    );
  };

  const matchGroupKey = (keyStr) => keyStr.startsWith("referral-groups:v");

  return (
    invalidateStoreKeys(
      __adminReferralCache,
      (keyStr) => matchAnchorKey(keyStr) || matchGroupKey(keyStr),
    ) +
    invalidateStoreKeys(
      __adminReferralInFlight,
      (keyStr) => matchAnchorKey(keyStr) || matchGroupKey(keyStr),
    )
  );
}

export function clearAdminReferralCaches() {
  __adminReferralCache.clear();
  __adminReferralInFlight.clear();
}
