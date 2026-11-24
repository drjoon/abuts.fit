// 관리자 대시보드 카드가 다시 마운트돼도 같은 조회를 바로 반복하지 않는다.
// HMR이 모듈을 다시 실행해도 캐시가 남도록 globalThis에 둔다.
type Snap = { at: number; data: unknown };
type Store = {
  memory: Map<string, Snap>;
  inflight: Map<string, Promise<unknown>>;
};

const g = globalThis as typeof globalThis & { __abutsAdminLoadOnce?: Store };

function store(): Store {
  if (!g.__abutsAdminLoadOnce) {
    g.__abutsAdminLoadOnce = {
      memory: new Map(),
      inflight: new Map(),
    };
  }
  return g.__abutsAdminLoadOnce;
}

export const ADMIN_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

/** TTL 안이면 hit. data는 null일 수 있다(빈 조회도 재요청하지 않음). */
export function peekOnce<T>(
  key: string,
  ttlMs = ADMIN_SNAPSHOT_TTL_MS,
): { hit: boolean; data: T | null } {
  const snap = store().memory.get(key);
  if (!snap || Date.now() - snap.at >= ttlMs) return { hit: false, data: null };
  return { hit: true, data: snap.data as T | null };
}

export async function loadOnce<T>(
  key: string,
  ttlMs: number,
  run: () => Promise<T | null>,
  force = false,
): Promise<T | null> {
  const { memory, inflight } = store();
  if (!force) {
    const snap = memory.get(key);
    if (snap && Date.now() - snap.at < ttlMs) return snap.data as T | null;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T | null>;
  }

  const task = run()
    .then((data) => {
      // 빈·실패(null)도 기록해 리마운트 재요청을 막는다. force로만 다시 부른다.
      memory.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === task) inflight.delete(key);
    });
  inflight.set(key, task);
  return task;
}

export function rememberOnce<T>(key: string, data: T) {
  store().memory.set(key, { at: Date.now(), data });
}
