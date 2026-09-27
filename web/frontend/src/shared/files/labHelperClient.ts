// change-log:
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
export const LAB_HELPER_MIN_VERSION = 3;
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

export class LabHelperError extends Error {
  code: string;
  constructor(message: string, code = "HELPER_ERROR") {
    super(message);
    this.name = "LabHelperError";
    this.code = code;
  }
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
  const first = await pingOnce(500);
  if (first || os !== "windows" || readStorage(INSTALLED_KEY) !== "1") return first;
  wakeLabHelper();
  const deadline = Date.now() + 1800;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const next = await pingOnce(300);
    if (next) return next;
  }
  return null;
}

/** 설치 안내 창이 열려 있는 동안 연결될 때까지 기다린다. */
export async function waitForLabHelper(signal: AbortSignal): Promise<LabHelperHealth | null> {
  while (!signal.aborted) {
    const health = await pingOnce(600);
    if (health) return health;
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
