// change-log:
// - 2026-10-03: v8 계정별 헬퍼 세션 — 치과·기공소 동시 폴링. /notify는 health ping 생략.
// - 2026-10-03: v7 POST /open-href — 알림 보기가 수신함 탭을 앞으로.
// - 2026-10-03: /notify health ping — 로컬 네트워크 권한 대기(400ms면 헬퍼 있어도 실패).
// - 2026-10-03: v4 PC 알람 — notify/session (폴더열기 MIN_VERSION은 3 유지, 알람은 version>=4).
// - 2026-09-29: Chrome 「로컬 네트워크 액세스」 권한 창이 떠 있으면 답할 때까지 기다린다
//   (0.5초에 끊으면 설치돼 있어도 없는 것으로 보여 설치 안내·브라우저 저장만 반복).
// - 2026-09-27: Mac 연결 프로그램 v3 — Windows와 같은 API. OS별 설치본(Windows exe, Mac .app zip).
// - 2026-09-27: Windows 연결 프로그램 v3 클라이언트 — 작업 폴더, 케이스 폴더 확인·저장·열기.
//   설치본은 exe 하나(동의 한 번, 관리자 권한 없음). 로그인 때마다 창 없이 127.0.0.1:8010에서 대기.
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
// - bg/lab-cad-helper/mac/AbutsLabHelper.swift
// - bg/lab-cad-helper/rules.md
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/LabHelperInstallDialog.tsx
// - web/frontend/src/shared/components/LabWorkFolderDialog.tsx

const HELPER_BASE = "http://127.0.0.1:8010";
/** 폴더열기·케이스 저장에 필요한 최소 버전 */
export const LAB_HELPER_MIN_VERSION = 3;
/** PC 알람(/notify·/session)에 필요한 최소 버전 */
export const LAB_HELPER_ALARM_MIN_VERSION = 4;
/** 배포 중인 최신 연결 프로그램 버전(구버전이면 자동 갱신 유도) */
export const LAB_HELPER_CURRENT_VERSION = 8;
const INSTALLED_KEY = "abuts.labHelperInstalled";
const WORK_FOLDER_KEY = "abuts.labWorkFolder";

export type LabHelperOs = "windows" | "mac";

/** 연결 프로그램을 설치할 수 있는 PC면 OS, 아니면 null(모바일·iPad·Linux). */
export function labHelperOs(): LabHelperOs | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  if (nav.userAgentData?.mobile) return null;
  const platform = String(nav.userAgentData?.platform || nav.platform || "").toLowerCase();
  const ua = String(nav.userAgent || "");
  if (platform.includes("win") || /windows/i.test(ua)) return "windows";
  const mac = platform.includes("mac") || /mac os x/i.test(ua);
  if (mac && !(nav.maxTouchPoints > 1) && !/iphone|ipad/i.test(ua)) return "mac";
  return null;
}

export function supportsLabHelper(): boolean {
  return labHelperOs() != null;
}

export type LabHelperInstaller = {
  href: string;
  fileName: string;
};

export function labHelperInstaller(os: LabHelperOs): LabHelperInstaller {
  return os === "mac"
    ? { href: "/downloads/lab-helper/AbutsLabHelper-mac.zip", fileName: "어벗츠연결_설치_Mac.zip" }
    : { href: "/downloads/lab-helper/AbutsLabHelperSetup.exe", fileName: "어벗츠연결_설치.exe" };
}

function readStorage(key: string): string {
  try {
    return String(localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const DECLINED_KEY = "abuts.labHelperInstallDeclined";

/** 설치 안내를 닫았으면 다음부터 묻지 않고 브라우저 저장(Chrome·Edge) 또는 zip으로 간다. */
export function readLabHelperInstallDeclined(): boolean {
  return readStorage(DECLINED_KEY) === "1";
}

export function writeLabHelperInstallDeclined(declined: boolean) {
  writeStorage(DECLINED_KEY, declined ? "1" : "");
}

export function readLabHelperWorkFolder(): string {
  return readStorage(WORK_FOLDER_KEY);
}

export function writeLabHelperWorkFolder(path: string) {
  writeStorage(WORK_FOLDER_KEY, String(path || "").trim());
}

export type LabHelperHealth = {
  ok: boolean;
  version?: number;
  workFolder?: string;
  workFolderExists?: boolean;
};

export type LabHelperAlarmPrefsPayload = {
  enabled: boolean;
};

export type LabHelperAlarmSessionPayload = {
  apiOrigin: string;
  appOrigin?: string;
  token: string;
  prefs: LabHelperAlarmPrefsPayload;
  browserAlive: boolean;
  /** 알림 보기 URL — 치과 발신함 / 기공소 수신함 */
  alertMode?: "send" | "receive";
};

/** 헬퍼가 백엔드에 직접 붙을 때 쓰는 origin(끝에 /api 없음). */
export function resolveLabHelperApiOrigin(): string {
  const envRaw = String(
    (import.meta.env.VITE_DEV_API_TARGET as string) ||
      (import.meta.env.VITE_API_URL as string) ||
      "",
  ).trim();
  const stripApi = (url: string) =>
    url.replace(/\/+$/, "").replace(/\/api$/i, "");
  if (import.meta.env.DEV && envRaw) return stripApi(envRaw);
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://abuts.fit";
}

export class LabHelperError extends Error {
  code: string;
  constructor(message: string, code = "HELPER_ERROR") {
    super(message);
    this.name = "LabHelperError";
    this.code = code;
  }
}

export type LabHelperNetworkPermission = "granted" | "prompt" | "denied" | "unknown";

/** Chrome·Edge 「로컬 네트워크 액세스」 권한. 이름이 버전마다 달라 차례로 묻는다. */
export async function readLabHelperNetworkPermission(): Promise<LabHelperNetworkPermission> {
  const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
  if (!permissions?.query) return "unknown";
  for (const name of ["loopback-network", "local-network-access", "local-network"]) {
    try {
      const status = await permissions.query({ name } as unknown as PermissionDescriptor);
      return status.state;
    } catch {
      // 모르는 이름
    }
  }
  return "unknown";
}

/** 권한 창이 떠 있는 동안 요청을 끊으면 연결 프로그램이 없는 것으로 보인다. */
const PERMISSION_PROMPT_WAIT_MS = 60_000;

async function pingTimeout(timeoutMs: number): Promise<number> {
  return (await readLabHelperNetworkPermission()) === "prompt"
    ? PERMISSION_PROMPT_WAIT_MS
    : timeoutMs;
}

async function pingOnce(timeoutMs: number): Promise<LabHelperHealth | null> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${HELPER_BASE}/health`, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as LabHelperHealth;
    if (!body?.ok || Number(body.version || 0) < LAB_HELPER_MIN_VERSION) return null;
    writeStorage(INSTALLED_KEY, "1");
    writeStorage(DECLINED_KEY, "");
    return body;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 설치 뒤 꺼져 있으면 abuts-cad:// 로 깨운다. 설치한 적 없는 PC에서는 부르지 않는다(브라우저 경고). */
function wakeLabHelper() {
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = "abuts-cad://wake";
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 2500);
  } catch {
    // ignore
  }
}

/**
 * 연결 프로그램이 떠 있으면 health. 설치할 수 없는 기기면 바로 null.
 * Chrome·Edge는 처음 한 번 「로컬 네트워크 접근」 허용을 묻는다.
 * Windows는 설치한 적 있는 PC만 깨운 뒤 잠깐 기다린다(Mac은 launchd가 계속 띄워 둔다).
 */
export async function findLabHelper(): Promise<LabHelperHealth | null> {
  const os = labHelperOs();
  if (!os) return null;
  const installed = readStorage(INSTALLED_KEY) === "1";
  const first = await pingOnce(installed ? await pingTimeout(500) : 500);
  if (first || os !== "windows" || !installed) return first;
  wakeLabHelper();
  const deadline = Date.now() + 1800;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const next = await pingOnce(300);
    if (next) return next;
  }
  return null;
}

/** 한 번만 확인한다. 권한 창이 떠 있으면 답할 때까지 기다린다. */
export async function probeLabHelper(): Promise<LabHelperHealth | null> {
  if (!labHelperOs()) return null;
  return pingOnce(await pingTimeout(600));
}

/** 설치 안내 창이 열려 있는 동안 연결될 때까지 기다린다. */
export async function waitForLabHelper(signal: AbortSignal): Promise<LabHelperHealth | null> {
  while (!signal.aborted) {
    const health = await pingOnce(await pingTimeout(600));
    if (health) return health;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** 업데이트 안내 창 — 최소 버전 이상 health가 올 때까지 기다린다. */
export async function waitForLabHelperMinVersion(
  signal: AbortSignal,
  minVersion: number,
): Promise<LabHelperHealth | null> {
  const min = Math.max(1, Number(minVersion) || 1);
  while (!signal.aborted) {
    const health = await pingOnce(await pingTimeout(600));
    if (health && Number(health.version || 0) >= min) return health;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function helperJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${HELPER_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new LabHelperError("연결 프로그램이 응답하지 않습니다.", "HELPER_UNREACHABLE");
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { ok?: boolean; code?: string; message?: string })
    | null;
  if (!res.ok || !data || data.ok === false) {
    throw new LabHelperError(
      String(data?.message || `연결 프로그램 오류 (${res.status})`),
      String(data?.code || "HELPER_ERROR"),
    );
  }
  return data;
}

export type LabHelperFolderResult = {
  ok: boolean;
  path: string;
  code: string;
  message: string;
};

async function folderCall(path: string, body: unknown): Promise<LabHelperFolderResult> {
  try {
    const res = await helperJson<{ path?: string }>(path, body);
    const next = String(res.path || "").trim();
    if (!next) return { ok: false, path: "", code: "EMPTY", message: "폴더 경로가 비어 있습니다." };
    writeLabHelperWorkFolder(next);
    return { ok: true, path: next, code: "", message: "" };
  } catch (err) {
    const e = err instanceof LabHelperError ? err : new LabHelperError(String(err));
    return { ok: false, path: "", code: e.code, message: e.message };
  }
}

/** PC 폴더 고르기 창(연결 프로그램이 띄움). */
export function pickLabHelperWorkFolder(initial?: string) {
  return folderCall("/work-folder/pick", { initial: String(initial || "").trim() });
}

/** 붙여 넣은 경로가 PC에 있는지 확인하고 저장. */
export function setLabHelperWorkFolder(path: string) {
  return folderCall("/work-folder", { path: String(path || "").trim() });
}

export type LabHelperCaseRef = { workFolder: string; caseFolder: string };

/** 케이스 폴더에 없거나 크기가 다른 파일. size 0은 이름만 본다. */
export async function checkLabHelperCase(
  ref: LabHelperCaseRef & { files: Array<{ name: string; size: number }> },
): Promise<{ folder: string; exists: boolean; missing: string[] }> {
  const res = await helperJson<{ folder?: string; exists?: boolean; missing?: string[] }>(
    "/cases/check",
    ref,
  );
  return {
    folder: String(res.folder || ""),
    exists: Boolean(res.exists),
    missing: Array.isArray(res.missing) ? res.missing.map(String) : [],
  };
}

export async function putLabHelperCaseFile(
  ref: LabHelperCaseRef & { name: string; blob: Blob },
): Promise<void> {
  const params = new URLSearchParams({
    workFolder: ref.workFolder,
    caseFolder: ref.caseFolder,
    name: ref.name,
  });
  let res: Response;
  try {
    res = await fetch(`${HELPER_BASE}/cases/file?${params.toString()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: ref.blob,
    });
  } catch {
    throw new LabHelperError("연결 프로그램이 응답하지 않습니다.", "HELPER_UNREACHABLE");
  }
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; code?: string; message?: string }
    | null;
  if (!res.ok || !data?.ok) {
    throw new LabHelperError(
      String(data?.message || `${ref.name} 저장 실패 (${res.status})`),
      String(data?.code || "HELPER_ERROR"),
    );
  }
}

/** 탐색기로 케이스 폴더를 연다(이미 열려 있으면 앞으로). */
export async function revealLabHelperCase(ref: LabHelperCaseRef): Promise<string> {
  const res = await helperJson<{ folder?: string }>("/cases/reveal", ref);
  return String(res.folder || "");
}

async function helperAlarmJson(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${HELPER_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(data?.ok !== false);
  } catch {
    return false;
  }
}

/** v4 헬퍼에 OS 알림음. 없거나 구버전이면 false(조용히 실패). */
export async function notifyLabHelperAlarm(opts?: {
  title?: string;
  body?: string;
  href?: string;
}): Promise<boolean> {
  if (!labHelperOs()) return false;
  return helperAlarmJson("/notify", {
    title: String(opts?.title || "").trim(),
    body: String(opts?.body || "").trim(),
    href: String(opts?.href || "").trim(),
  });
}

/** 알림 보기 — 이미 열린 수신함/발신함 브라우저 탭을 앞으로. 헬퍼 없거나 탭을 못 찾으면 false. */
export async function openLabHelperHref(href: string): Promise<boolean> {
  const link = String(href || "").trim();
  if (!link || !labHelperOs()) return false;
  try {
    const res = await fetch(`${HELPER_BASE}/open-href`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ href: link }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      focused?: boolean;
    } | null;
    return Boolean(data?.ok !== false && data?.focused);
  } catch {
    return false;
  }
}

/** 로그인·heartbeat·설정 변경 시 헬퍼에 세션 동기화(브라우저 종료 후 폴링용). */
export async function syncLabHelperAlarmSession(
  payload: LabHelperAlarmSessionPayload,
): Promise<boolean> {
  if (!labHelperOs()) return false;
  const health = await pingOnce(await pingTimeout(1200));
  if (!health || Number(health.version || 0) < LAB_HELPER_ALARM_MIN_VERSION) {
    return false;
  }
  return helperAlarmJson("/session", {
    apiOrigin: String(payload.apiOrigin || "").trim(),
    appOrigin: String(payload.appOrigin || "").trim(),
    token: String(payload.token || "").trim(),
    prefs: {
      enabled: payload.prefs?.enabled !== false,
    },
    browserAlive: Boolean(payload.browserAlive),
    alertMode: payload.alertMode === "send" ? "send" : "receive",
  });
}

export async function clearLabHelperAlarmSession(token?: string): Promise<boolean> {
  if (!labHelperOs()) return false;
  return helperAlarmJson("/session/clear", {
    token: String(token || "").trim(),
  });
}

export function startLabHelperInstallerDownload(os: LabHelperOs) {
  const installer = labHelperInstaller(os);
  try {
    const a = document.createElement("a");
    a.href = installer.href;
    a.download = installer.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // ignore
  }
}

/** 연결 프로그램이 떠 있는데 CURRENT 미만이면 true. 안내 모달용. */
export async function needsLabHelperUpdate(): Promise<boolean> {
  if (!labHelperOs()) return false;
  const health = await probeLabHelper();
  if (!health) return false;
  return Number(health.version || 0) < LAB_HELPER_CURRENT_VERSION;
}
