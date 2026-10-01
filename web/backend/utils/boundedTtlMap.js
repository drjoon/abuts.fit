// 프로세스 메모리 캐시.
// 만료는 그 키를 다시 읽을 때만 지우면, 한 번 쓰고 안 읽는 응답이 재시작 전까지 남는다.
// 쓸 때마다 만료분을 걷고, 상한을 넘으면 먼저 들어온 키부터 뺀다.
// 같은 키를 다시 쓰면 맨 뒤로 옮겨 방금 갱신한 값이 먼저 밀려나지 않게 한다.

export function resolveMaxEntries(raw, fallback, floor = 1) {
  const n = Math.floor(Number(raw));
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  const min = Math.floor(Number(floor));
  return Math.max(Number.isFinite(min) && min > 0 ? min : 1, base);
}

export function pruneTtlMap(store, maxEntries, now = Date.now()) {
  for (const [key, entry] of store) {
    const expiresAt = entry && typeof entry === "object" ? Number(entry.expiresAt) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) store.delete(key);
  }
  evictOverflow(store, maxEntries);
}

export function getTtlMapValue(store, key, now = Date.now()) {
  const hit = store.get(key);
  if (!hit) return null;
  if (typeof hit.expiresAt !== "number" || hit.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function setTtlMapValue(store, key, value, ttlMs, maxEntries, now = Date.now()) {
  const ttl = Number(ttlMs);
  const span = Number.isFinite(ttl) && ttl > 0 ? ttl : 0;
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: now + span });
  pruneTtlMap(store, maxEntries, now);
  return value;
}

/** key -> timestamp. 창 안의 기존 시각은 밀지 않는다. 만료된 키는 다른 키를 볼 때도 뺀다. */
export function observeTimestampMap(store, key, now, windowMs, maxEntries) {
  const span = positiveSpan(windowMs);
  const last = store.get(key);
  const fresh = typeof last !== "number" || now - last >= span;
  if (fresh) {
    if (store.has(key)) store.delete(key);
    store.set(key, now);
  }
  pruneTimestampMap(store, span, maxEntries, now);
  return fresh;
}

export function pruneTimestampMap(store, windowMs, maxEntries, now = Date.now()) {
  const span = positiveSpan(windowMs);
  for (const [key, ts] of store) {
    if (typeof ts !== "number" || now - ts >= span) store.delete(key);
  }
  evictOverflow(store, maxEntries);
}

/** key -> timestamps[]. 마지막 시각이 maxAgeMs보다 오래된 키를 뺀다. */
export function pruneStampListMap(store, maxAgeMs, maxEntries, now = Date.now()) {
  const maxAge = positiveSpan(maxAgeMs);
  for (const [key, stamps] of store) {
    const last =
      Array.isArray(stamps) && stamps.length > 0 ? stamps[stamps.length - 1] : null;
    if (typeof last !== "number" || now - last > maxAge) store.delete(key);
  }
  evictOverflow(store, maxEntries);
}

function positiveSpan(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function evictOverflow(store, maxEntries) {
  const limit = resolveMaxEntries(maxEntries, 500, 1);
  if (store.size <= limit) return;
  const overflow = store.size - limit;
  let removed = 0;
  for (const key of store.keys()) {
    if (removed >= overflow) break;
    store.delete(key);
    removed += 1;
  }
}
