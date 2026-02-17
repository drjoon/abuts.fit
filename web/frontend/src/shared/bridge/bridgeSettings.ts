import { apiFetch } from "@/shared/api/apiClient";

type BridgeSettingsData = {
  mockCncMachiningEnabled?: boolean;
};

type CachedValue = {
  ts: number;
  enabled: boolean | null;
};

const TTL_MS = 30_000;
let cache: CachedValue | null = null;
let inFlight: Promise<boolean | null> | null = null;

export async function getMockCncMachiningEnabled(
  token?: string | null,
): Promise<boolean | null> {
  if (!token) return null;
  const now = Date.now();
  if (cache && now - cache.ts <= TTL_MS) return cache.enabled;
  if (inFlight) return await inFlight;

  inFlight = (async () => {
    try {
      const res = await apiFetch<{ success?: boolean; data?: BridgeSettingsData }>
      ({
        path: "/api/bg/bridge-settings",
        method: "GET",
        token,
      });
      if (!res.ok || res.data?.success === false) {
        return cache?.enabled ?? null;
      }
      const enabledRaw = res.data?.data?.mockCncMachiningEnabled;
      const enabled = enabledRaw === true ? true : enabledRaw === false ? false : null;
      cache = { ts: Date.now(), enabled };
      return enabled;
    } catch {
      return cache?.enabled ?? null;
    } finally {
      inFlight = null;
    }
  })();

  return await inFlight;
}
