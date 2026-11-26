// related files:
// - bg/pc2/lot-server/src/index.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/useLotServerWatch.ts
// change-log:
// - 2026-11-26: 패킹 PC lot-server(8012) HTTP 클라이언트. 라이브·감시·AF·OCR.

const DEFAULT_BASE = "http://127.0.0.1:8012";

export function resolveLotServerBaseUrl() {
  const fromEnv = String(
    (import.meta.env.VITE_LOT_SERVER_URL as string) || "",
  ).trim();
  return (fromEnv || DEFAULT_BASE).replace(/\/$/, "");
}

export type LotWatchStatus = {
  success?: boolean;
  running?: boolean;
  phase?: string;
  lastLot?: string | null;
  lastError?: string | null;
  latest?: { fileName?: string; lot?: string; at?: string } | null;
  live?: boolean;
  liveAt?: string | null;
  device?: string | null;
  led?: boolean | null;
  ledOff?: boolean | null;
  serialAf?: boolean | null;
  lastAf?: Record<string, unknown> | null;
  lastFrame?: Record<string, unknown> | null;
};

async function lotFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = resolveLotServerBaseUrl();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
}

export async function getLotWatch(): Promise<LotWatchStatus> {
  const res = await lotFetch("/watch");
  const data = (await res.json().catch(() => null)) as LotWatchStatus | null;
  if (!res.ok) {
    throw new Error(
      (data as { message?: string } | null)?.message ||
        `lot-server /watch ${res.status}`,
    );
  }
  return data || {};
}

export async function startLotWatch(): Promise<LotWatchStatus> {
  const res = await lotFetch("/watch/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => null)) as LotWatchStatus | null;
  if (!res.ok) {
    throw new Error(
      (data as { message?: string } | null)?.message ||
        `감시 시작 실패 (${res.status})`,
    );
  }
  return data || {};
}

export async function stopLotWatch(): Promise<LotWatchStatus> {
  const res = await lotFetch("/watch/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => null)) as LotWatchStatus | null;
  if (!res.ok) {
    throw new Error(
      (data as { message?: string } | null)?.message ||
        `감시 중지 실패 (${res.status})`,
    );
  }
  return data || {};
}

export async function focusLotServer(
  area: "whole" | "local" = "whole",
): Promise<{ success?: boolean; message?: string; watch?: LotWatchStatus }> {
  const res = await lotFetch("/focus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area }),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    watch?: LotWatchStatus;
  } | null;
  if (!res.ok) {
    throw new Error(data?.message || `초점 실패 (${res.status})`);
  }
  return data || {};
}

export async function recognizeLotServer(): Promise<{
  success?: boolean;
  lot?: string;
  message?: string;
  confidence?: number;
  fileName?: string;
}> {
  const res = await lotFetch("/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    lot?: string;
    message?: string;
    confidence?: number;
    fileName?: string;
  } | null;
  if (!res.ok) {
    throw new Error(data?.message || `인식 실패 (${res.status})`);
  }
  return data || {};
}

export function lotLiveImageUrl(cacheBust?: number) {
  const base = resolveLotServerBaseUrl();
  const t = cacheBust ?? Date.now();
  return `${base}/live?t=${t}`;
}

export function lotCaptureImageUrl(fileName: string) {
  const base = resolveLotServerBaseUrl();
  const name = String(fileName || "").trim();
  if (!name) return "";
  return `${base}/image?name=${encodeURIComponent(name)}`;
}
