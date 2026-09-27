// change-log:
// - 2026-09-27: 헬퍼 v2 — OS별 설치본(Windows/Mac), 버전 확인(need_update), 작업 폴더(로컬 저장·헬퍼 지정),
//   케이스 폴더(날짜_환자명) 세션, 저장 후 폴더 열기(reveal)·디자인 SW 열기(open) 분리.
//   3Shape·exocad는 파일 인자 열기를 지원하지 않아 open 결과의 guide로 가져오기 안내를 띄운다.
// - 2026-09-27: ensureReady — 미응답 시 바로 onWaiting, 깨우기 대기는 1.2초.
// - 2026-09-24: 설치 zip·프로토콜 wake·ensureReady — 컴맹용 최초 1회 안내.
// - 2026-09-24: 기공소 로컬 CAD 헬퍼(127.0.0.1:8010) 클라이언트 — 세션·업로드·open.
// related files:
// - bg/lab-cad-helper/lab-cad-helper.ps1
// - bg/lab-cad-helper/mac/AbutsLabHelper.swift
// - bg/lab-cad-helper/rules.md
// - web/frontend/public/downloads/lab-cad-helper/
// - web/frontend/src/shared/components/LabCadHelperSetupDialog.tsx
// - web/frontend/src/shared/components/LabWorkFolderDialog.tsx
// - web/frontend/src/shared/components/LabCadOpenedGuideDialog.tsx
// - web/frontend/src/shared/files/useS3FileDownload.ts
import { toKstYmd } from "@/shared/date/kst";

export const LAB_CAD_HELPER_DEFAULT_BASE = "http://127.0.0.1:8010";
/** 작업 폴더·케이스 폴더·TcpListener가 들어간 헬퍼 */
export const LAB_CAD_HELPER_MIN_VERSION = 2;

const STORAGE_BASE_KEY = "abuts.labCadHelperBase";
const STORAGE_SECRET_KEY = "abuts.labCadHelperSecret";
const WORK_FOLDER_KEY = "abuts.labWorkFolder";

export type LabHelperOs = "windows" | "mac" | "other";

export function detectLabHelperOs(): LabHelperOs {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const platform = String(
    (nav as { userAgentData?: { platform?: string } } | null)?.userAgentData
      ?.platform ||
      nav?.platform ||
      "",
  ).toLowerCase();
  const ua = String(nav?.userAgent || "").toLowerCase();
  if (platform.includes("win") || ua.includes("windows")) return "windows";
  if (platform.includes("mac") || ua.includes("mac os")) return "mac";
  return "other";
}

export type LabCadHelperInstaller = {
  href: string;
  fileName: string;
  /** zip 안에서 더블클릭할 파일 */
  runFileLabel: string;
};

export function labCadHelperInstallerFor(os: LabHelperOs): LabCadHelperInstaller {
  if (os === "mac") {
    return {
      href: "/downloads/lab-cad-helper/AbutsCad%EC%97%B0%EA%B2%B0_%EC%84%A4%EC%B9%98_Mac.zip",
      fileName: "AbutsCad연결_설치_Mac.zip",
      runFileLabel: "Abuts연결_설치.command",
    };
  }
  return {
    href: "/downloads/lab-cad-helper/AbutsCad%EC%97%B0%EA%B2%B0_%EC%84%A4%EC%B9%98.zip",
    fileName: "AbutsCad연결_설치.zip",
    runFileLabel: "여기를_더블클릭_설치",
  };
}

export function readLabCadHelperBase(): string {
  try {
    const raw = String(localStorage.getItem(STORAGE_BASE_KEY) || "").trim();
    if (raw) return raw.replace(/\/+$/, "");
  } catch {
    // ignore
  }
  return LAB_CAD_HELPER_DEFAULT_BASE;
}

export function readLabCadHelperSecret(): string {
  try {
    return String(localStorage.getItem(STORAGE_SECRET_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function readLabWorkFolder(): string {
  try {
    return String(localStorage.getItem(WORK_FOLDER_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeLabWorkFolder(path: string) {
  try {
    const next = String(path || "").trim();
    if (next) localStorage.setItem(WORK_FOLDER_KEY, next);
    else localStorage.removeItem(WORK_FOLDER_KEY);
  } catch {
    // ignore
  }
}

function helperHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const secret = readLabCadHelperSecret();
  if (secret) headers.set("x-abuts-cad-secret", secret);
  return headers;
}

export type LabCadHelperHealth = {
  ok: boolean;
  service?: string;
  version?: number;
  os?: string;
  port?: number;
  workFolder?: string;
  workFolderExists?: boolean;
};

export async function pingLabCadHelper(
  signal?: AbortSignal,
): Promise<LabCadHelperHealth> {
  const base = readLabCadHelperBase();
  const res = await fetch(`${base}/health`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    throw new Error(`CAD 헬퍼 응답 오류 (${res.status})`);
  }
  return (await res.json()) as LabCadHelperHealth;
}

export async function tryPingLabCadHelper(
  timeoutMs = 800,
): Promise<LabCadHelperHealth | null> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await pingLabCadHelper(ac.signal);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 설치 후 등록된 abuts-cad:// 로 숨은 헬퍼를 깨운다(Windows만. Mac은 로그인 시 상시 실행). */
export function wakeLabCadHelperViaProtocol() {
  if (detectLabHelperOs() !== "windows") return;
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = "abuts-cad://wake";
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    }, 2500);
  } catch {
    try {
      window.location.href = "abuts-cad://wake";
    } catch {
      // ignore
    }
  }
}

/** 첫 health가 실패하면 바로 알리고, 설치본이 깨어날 시간만 남긴다. */
const HELPER_FIRST_PING_MS = 400;
const HELPER_WAKE_WAIT_MS = 1200;

export type LabCadHelperReadyResult =
  | { status: "ready"; health: LabCadHelperHealth }
  | { status: "need_update"; health: LabCadHelperHealth }
  | { status: "need_setup" };

function classifyHealth(health: LabCadHelperHealth): LabCadHelperReadyResult {
  const version = Number(health.version || 1) || 1;
  if (version < LAB_CAD_HELPER_MIN_VERSION) return { status: "need_update", health };
  return { status: "ready", health };
}

/**
 * 헬퍼가 떠 있는지 확인. 없으면 프로토콜로 깨운 뒤 잠깐 폴링.
 * need_setup → 설치 안내, need_update → 새 버전 설치 안내.
 * timeoutMs는 첫 ping을 포함한 전체 예산. 생략 시 약 1.6초.
 * onWaiting은 첫 ping 실패 직후 한 번 — 화면은 여기서 「연결 확인 중」을 띄운다.
 */
export async function ensureLabCadHelperReady(opts?: {
  timeoutMs?: number;
  skipWake?: boolean;
  onWaiting?: () => void;
}): Promise<LabCadHelperReadyResult> {
  const budget =
    opts?.timeoutMs != null
      ? Math.max(400, Number(opts.timeoutMs) || 0)
      : HELPER_FIRST_PING_MS + HELPER_WAKE_WAIT_MS;
  const started = Date.now();
  const deadline = started + budget;
  const firstBudget = Math.min(HELPER_FIRST_PING_MS, budget);
  const first = firstBudget > 0 ? await tryPingLabCadHelper(firstBudget) : null;
  if (first) return classifyHealth(first);
  opts?.onWaiting?.();
  if (!opts?.skipWake) {
    wakeLabCadHelperViaProtocol();
  }
  while (Date.now() < deadline) {
    const sleepMs = Math.min(200, deadline - Date.now());
    if (sleepMs <= 0) break;
    await new Promise((r) => setTimeout(r, sleepMs));
    const pingBudget = Math.min(250, deadline - Date.now());
    if (pingBudget <= 0) break;
    const health = await tryPingLabCadHelper(pingBudget);
    if (health) return classifyHealth(health);
  }
  return { status: "need_setup" };
}

export class LabCadHelperOpenError extends Error {
  code: string;
  folder?: string;
  constructor(message: string, code = "OPEN_FAILED", folder?: string) {
    super(message);
    this.name = "LabCadHelperOpenError";
    this.code = code;
    this.folder = folder;
  }
}

async function helperJson<T>(
  path: string,
  init: { method: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(`${readLabCadHelperBase()}${path}`, {
    method: init.method,
    headers: helperHeaders({ "Content-Type": "application/json" }),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { ok?: boolean; code?: string; message?: string; folder?: string })
    | null;
  if (!res.ok || !body || body.ok === false) {
    throw new LabCadHelperOpenError(
      String(body?.message || `연결 프로그램 오류 (${res.status})`),
      String(body?.code || "").trim() || "OPEN_FAILED",
      body?.folder,
    );
  }
  return body;
}

/** 설치 안내 사유: 미설치·꺼짐 / 구버전 / 디자인 프로그램 못 찾음 */
export type LabCadHelperSetupReason =
  | "helper_missing"
  | "helper_outdated"
  | "exe_not_found";

/** 작업 폴더가 없거나 사라졌을 때 사용자에게 받는다. 취소면 null. */
export type LabWorkFolderResolver = (ctx: {
  reason: "missing" | "not_found";
  helperWorkFolder: string;
}) => Promise<string | null>;

export type LabWorkFolderResult = {
  ok: boolean;
  path?: string;
  code?: string;
  message?: string;
};

async function workFolderCall(
  path: string,
  body: unknown,
): Promise<LabWorkFolderResult> {
  try {
    const res = await helperJson<{ path?: string }>(path, {
      method: "POST",
      body,
    });
    const next = String(res.path || "").trim();
    if (!next) return { ok: false, code: "EMPTY", message: "폴더 경로가 비어 있습니다." };
    writeLabWorkFolder(next);
    return { ok: true, path: next };
  } catch (err) {
    if (err instanceof LabCadHelperOpenError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "HELPER_UNREACHABLE",
      message: "연결 프로그램이 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

/** PC의 폴더 고르기 창을 띄운다(헬퍼). 고르면 헬퍼·로컬 저장 모두 갱신. */
export function pickLabWorkFolder(initial?: string): Promise<LabWorkFolderResult> {
  return workFolderCall("/work-folder/pick", { initial: String(initial || "").trim() });
}

/** 입력한 경로가 PC에 있는지 헬퍼가 확인한 뒤 저장. */
export function setLabWorkFolder(path: string): Promise<LabWorkFolderResult> {
  return workFolderCall("/work-folder", { path: String(path || "").trim() });
}

function sanitizeFolderSegment(value: string): string {
  return String(value || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
}

/** 작업 폴더 안 케이스 폴더: 「YYYYMMDD_환자명」(주문일 KST). */
export function buildLabCaseFolderName(opts: {
  orderDate?: string | null;
  patientName?: string | null;
  fallbackId?: string | null;
}): string {
  const ymd = (toKstYmd(opts.orderDate || null) || toKstYmd(new Date()) || "").replace(/-/g, "");
  const patient = sanitizeFolderSegment(String(opts.patientName || ""));
  const fallback = sanitizeFolderSegment(String(opts.fallbackId || "")).slice(-6);
  const tail = patient || (fallback ? `의뢰${fallback}` : "의뢰");
  return `${ymd}_${tail}`;
}

export type LabCadOpenFile = {
  fileName: string;
  blob: Blob;
};

/** 파일을 작업 폴더의 케이스 폴더(없으면 임시 폴더)에 저장한다. */
export async function sendFilesToLabHelper(opts: {
  files: LabCadOpenFile[];
  workFolder?: string;
  caseFolder?: string;
  signal?: AbortSignal;
}): Promise<{ sessionId: string; folder: string }> {
  const files = (opts.files || []).filter(
    (f) => f?.blob && String(f.fileName || "").trim(),
  );
  if (!files.length) {
    throw new Error("저장할 파일이 없습니다.");
  }
  const base = readLabCadHelperBase();
  const created = await helperJson<{ sessionId?: string; folder?: string }>(
    "/sessions",
    {
      method: "POST",
      body: {
        workFolder: String(opts.workFolder || "").trim(),
        caseFolder: String(opts.caseFolder || "").trim(),
      },
      signal: opts.signal,
    },
  );
  const sessionId = String(created.sessionId || "").trim();
  if (!sessionId) throw new Error("세션 ID가 없습니다.");

  for (const file of files) {
    const name = encodeURIComponent(
      String(file.fileName || "model.stl").trim() || "model.stl",
    );
    const putRes = await fetch(
      `${base}/sessions/${encodeURIComponent(sessionId)}/files/${name}`,
      {
        method: "PUT",
        headers: helperHeaders({
          "Content-Type": "application/octet-stream",
        }),
        body: file.blob,
        signal: opts.signal,
      },
    );
    if (!putRes.ok) {
      const body = await putRes.json().catch(() => null);
      throw new Error(
        String(body?.message || `${file.fileName} 전송 실패 (${putRes.status})`),
      );
    }
  }
  return { sessionId, folder: String(created.folder || "").trim() };
}

/** 저장한 케이스 폴더를 탐색기/Finder로 연다. */
export async function revealLabHelperSession(sessionId: string): Promise<{ folder: string; count: number }> {
  const res = await helperJson<{ folder?: string; count?: number }>(
    `/sessions/${encodeURIComponent(sessionId)}/reveal`,
    { method: "POST", body: {} },
  );
  return { folder: String(res.folder || ""), count: Number(res.count || 0) || 0 };
}

/**
 * 3shape_import: Dental Manager를 열고 폴더 경로를 복사함 → 스캔 가져오기 안내
 * exocad_import: DentalDB를 열고 폴더 경로를 복사함 → 가져오기 안내
 * exocad_project: .dentalProject를 DentalCADApp으로 바로 엶
 * args: 사용자 지정 프로그램에 파일 인자로 엶
 * folder_only: 폴더만 엶(Mac, 프로그램 미설정)
 */
export type LabCadOpenGuide =
  | "3shape_import"
  | "exocad_import"
  | "exocad_project"
  | "args"
  | "folder_only";

export type LabCadOpenResult = {
  designSoftware: string;
  folder: string;
  count: number;
  guide: LabCadOpenGuide;
  /** started | activated | folder */
  mode: string;
  exe: string | null;
  /** 헬퍼가 폴더 경로를 클립보드에 복사했는지 */
  clipboard: boolean;
};

export async function openLabHelperSession(
  sessionId: string,
  designSoftware: string,
): Promise<LabCadOpenResult> {
  const res = await helperJson<{
    folder?: string;
    count?: number;
    guide?: string;
    mode?: string;
    exe?: string | null;
    clipboard?: boolean;
  }>(`/sessions/${encodeURIComponent(sessionId)}/open`, {
    method: "POST",
    body: { designSoftware: String(designSoftware || "").trim() },
  });
  const guide = String(res.guide || "folder_only") as LabCadOpenGuide;
  return {
    designSoftware: String(designSoftware || "").trim(),
    folder: String(res.folder || ""),
    count: Number(res.count || 0) || 0,
    guide,
    mode: String(res.mode || ""),
    exe: res.exe ?? null,
    clipboard: Boolean(res.clipboard),
  };
}

const LAST_CONFIRMED_SW_KEY = "abuts.labCadLastConfirmedSoftware";

export function readLastConfirmedDesignSoftware(): string {
  try {
    return String(localStorage.getItem(LAST_CONFIRMED_SW_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeLastConfirmedDesignSoftware(value: string) {
  try {
    const next = String(value || "").trim();
    if (!next) {
      localStorage.removeItem(LAST_CONFIRMED_SW_KEY);
      return;
    }
    localStorage.setItem(LAST_CONFIRMED_SW_KEY, next);
  } catch {
    // ignore
  }
}

/** 플랫폼 설정 SW가 마지막으로 확인한 값과 다르면 true */
export function needsDesignSoftwareOpenConfirm(
  currentDesignSoftware: string,
): boolean {
  const current = String(currentDesignSoftware || "").trim();
  if (!current) return false;
  const last = readLastConfirmedDesignSoftware();
  if (!last) return false;
  return last !== current;
}

/** DCM 포맷: 3Shape=원본, ExoCAD·그외=PLY */
export function dcmFormatForDesignSoftware(
  designSoftware: string,
): "dcm" | "ply" {
  return String(designSoftware || "").trim() === "3Shape" ? "dcm" : "ply";
}
