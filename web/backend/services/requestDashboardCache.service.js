const __requestPerfCache = new Map();
const __requestInFlight = new Map();
const __bulkShippingCache = new Map();
const __bulkShippingInFlight = new Map();

const getMapCacheValue = (store, key) => {
  const hit = store.get(key);
  if (!hit) return null;
  if (typeof hit.expiresAt !== "number" || hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
};

const setMapCacheValue = (store, key, value, ttlMs) => {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

const withMapInFlight = async (store, key, factory) => {
  const existing = store.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (store.get(key) === promise) {
        store.delete(key);
      }
    });

  store.set(key, promise);
  return promise;
};

const invalidateMapKeysByBusinessAnchorId = (store, businessAnchorId) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!anchorId) return 0;

  let removed = 0;
  for (const key of store.keys()) {
    const keyStr = String(key || "");
    if (
      keyStr.endsWith(`:${anchorId}`) ||
      keyStr.includes(`:${anchorId}:`)
    ) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
};

export const getRequestPerfCacheValue = (key) =>
  getMapCacheValue(__requestPerfCache, key);
export const setRequestPerfCacheValue = (key, value, ttlMs) =>
  setMapCacheValue(__requestPerfCache, key, value, ttlMs);
export const withRequestPerfInFlight = (key, factory) =>
  withMapInFlight(__requestInFlight, key, factory);

export const getBulkShippingCacheValue = (key) =>
  getMapCacheValue(__bulkShippingCache, key);
export const setBulkShippingCacheValue = (key, value, ttlMs) =>
  setMapCacheValue(__bulkShippingCache, key, value, ttlMs);
export const withBulkShippingInFlight = (key, factory) =>
  withMapInFlight(__bulkShippingInFlight, key, factory);

export const invalidateRequestPerfCachesForBusinessAnchorId = (businessAnchorId) => {
  const removedCache = invalidateMapKeysByBusinessAnchorId(
    __requestPerfCache,
    businessAnchorId,
  );
  const removedInFlight = invalidateMapKeysByBusinessAnchorId(
    __requestInFlight,
    businessAnchorId,
  );
  return removedCache + removedInFlight;
};

export const invalidateBulkShippingCachesForBusinessAnchorId = (businessAnchorId) => {
  const removedCache = invalidateMapKeysByBusinessAnchorId(
    __bulkShippingCache,
    businessAnchorId,
  );
  const removedInFlight = invalidateMapKeysByBusinessAnchorId(
    __bulkShippingInFlight,
    businessAnchorId,
  );
  return removedCache + removedInFlight;
};

export const invalidateDashboardAndBulkCachesForBusinessAnchorId = (
  businessAnchorId,
) => {
  return {
    requestPerf: invalidateRequestPerfCachesForBusinessAnchorId(businessAnchorId),
    bulkShipping: invalidateBulkShippingCachesForBusinessAnchorId(
      businessAnchorId,
    ),
  };
};
