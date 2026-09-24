// change-log:
// - 2026-09-24: 설치 zip·프로토콜 wake·ensureReady — 컴맹용 최초 1회 안내.
// - 2026-09-24: 기공소 로컬 CAD 헬퍼(127.0.0.1:8010) 클라이언트 — 세션·업로드·open.
// related files:
// - bg/lab-cad-helper/여기를_더블클릭_설치.cmd
// - bg/lab-cad-helper/run-hidden.vbs
// - bg/lab-cad-helper/lab-cad-helper.ps1
// - bg/lab-cad-helper/rules.md
// - web/frontend/public/downloads/lab-cad-helper/AbutsCad연결_설치.zip
// - web/frontend/src/shared/components/LabCadHelperSetupDialog.tsx
// - web/frontend/src/shared/files/useS3FileDownload.ts

export const LAB_CAD_HELPER_DEFAULT_BASE = "http://127.0.0.1:8010";

/** 기공소 설치 zip (public) */
export const LAB_CAD_HELPER_ZIP_PATH =
  "/downloads/lab-cad-helper/AbutsCad%EC%97%B0%EA%B2%B0_%EC%84%A4%EC%B9%98.zip";

const STORAGE_BASE_KEY = "abuts.labCadHelperBase";
const STORAGE_SECRET_KEY = "abuts.labCadHelperSecret";

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

function helperHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const secret = readLabCadHelperSecret();
  if (secret) headers.set("x-abuts-cad-secret", secret);
  return headers;
}

export type LabCadHelperHealth = {
  ok: boolean;
  service?: string;
  port?: number;
  exeConfigured?: {
    "3Shape"?: boolean;
    ExoCAD?: boolean;
    custom?: boolean;
  };
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
): Promise<boolean> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    await pingLabCadHelper(ac.signal);
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 설치 후 등록된 abuts-cad:// 로 숨은 헬퍼를 깨운다(창 이동 없음). */
export function wakeLabCadHelperViaProtocol() {
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

/**
 * 헬퍼가 떠 있는지 확인. 없으면 프로토콜로 깨운 뒤 잠깐 폴링.
 * need_setup → 웹 설치 안내 모달.
 */
export async function ensureLabCadHelperReady(opts?: {
  timeoutMs?: number;
  skipWake?: boolean;
}): Promise<"ready" | "need_setup"> {
  if (await tryPingLabCadHelper()) return "ready";
  if (!opts?.skipWake) {
    wakeLabCadHelperViaProtocol();
  }
  const deadline = Date.now() + Math.max(1500, Number(opts?.timeoutMs) || 4500);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 350));
    if (await tryPingLabCadHelper(600)) return "ready";
  }
  return "need_setup";
}

export type LabCadOpenFile = {
  fileName: string;
  blob: Blob;
};

/**
 * 로컬 헬퍼에 파일을 올린 뒤 설정 디자인 SW로 연다.
 */
export async function openFilesWithLabCadHelper(opts: {
  designSoftware: string;
  files: LabCadOpenFile[];
  signal?: AbortSignal;
}): Promise<{
  mode: string;
  exe: string | null;
  hint?: string;
  count: number;
}> {
  const files = (opts.files || []).filter(
    (f) => f?.blob && String(f.fileName || "").trim(),
  );
  if (!files.length) {
    throw new Error("열 3D 파일이 없습니다.");
  }

  const base = readLabCadHelperBase();
  const signal = opts.signal;

  const createRes = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: helperHeaders({ "Content-Type": "application/json" }),
    body: "{}",
    signal,
  });
  if (!createRes.ok) {
    const body = await createRes.json().catch(() => null);
    throw new Error(
      String(body?.message || `세션 생성 실패 (${createRes.status})`),
    );
  }
  const created = (await createRes.json()) as { sessionId?: string };
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
        signal,
      },
    );
    if (!putRes.ok) {
      const body = await putRes.json().catch(() => null);
      throw new Error(
        String(body?.message || `${file.fileName} 전송 실패 (${putRes.status})`),
      );
    }
  }

  const openRes = await fetch(
    `${base}/sessions/${encodeURIComponent(sessionId)}/open`,
    {
      method: "POST",
      headers: helperHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        designSoftware: String(opts.designSoftware || "").trim(),
      }),
      signal,
    },
  );
  const openBody = (await openRes.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    mode?: string;
    exe?: string | null;
    hint?: string;
    count?: number;
  } | null;
  if (!openRes.ok || !openBody?.ok) {
    throw new Error(
      String(openBody?.message || `열기 실패 (${openRes.status})`),
    );
  }
  return {
    mode: String(openBody.mode || "shell"),
    exe: openBody.exe ?? null,
    hint: openBody.hint,
    count: Number(openBody.count || files.length) || files.length,
  };
}

/** DCM 포맷: 3Shape=원본, ExoCAD·그외=PLY */
export function dcmFormatForDesignSoftware(
  designSoftware: string,
): "dcm" | "ply" {
  return String(designSoftware || "").trim() === "3Shape" ? "dcm" : "ply";
}
