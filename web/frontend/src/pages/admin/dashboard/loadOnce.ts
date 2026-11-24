// 관리자 대시보드 카드가 다시 마운트돼도 같은 조회를 바로 반복하지 않는다.
const memory = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export const ADMIN_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

export async function loadOnce<T>(
  key: string,
  ttlMs: number,
  run: () => Promise<T | null>,
  force = false,
): Promise<T | null> {
  if (!force) {
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T | null>;
  }

  const task = run()
    .then((data) => {
      if (data != null) memory.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === task) inflight.delete(key);
    });
  inflight.set(key, task);
  return task;
}

export function rememberOnce<T>(key: string, data: T) {
  memory.set(key, { at: Date.now(), data });
}
