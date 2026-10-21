// related files:
// - web/backend/controllers/files/stlPreflight.controller.js
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
import type { CaseInfos } from "@/pages/requestor/new_request/hooks/newRequestTypes";

/** 서버 correctedDownloadName과 같다. 의뢰 파일명을 유지하고 한글은 NFC로 둔다. */
export function correctedFileName(originalName: string) {
  let base = (
    String(originalName || "")
      .normalize("NFC")
      .replace(/\\/g, "/")
      .split("/")
      .pop() || ""
  )
    .replace(/[\u0000-\u001f"]/g, "")
    .trim();
  base = base.replace(/\.corrected(?=\.stl$)/i, "").replace(/\.corrected$/i, "");
  if (!base) return "corrected.stl";
  if (base.length > 180) base = base.slice(-180);
  if (!/\.stl$/i.test(base)) base = `${base}.stl`;
  return base.normalize("NFC");
}

function parseAttachmentFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return star[1].trim();
    }
  }
  const plain = /filename="([^"]+)"/i.exec(contentDisposition);
  return plain?.[1]?.trim() || null;
}

export async function fetchCorrectedStlBlob({
  file,
  caseInfos,
  token,
}: {
  file: File;
  caseInfos?: CaseInfos | null;
  token?: string | null;
}): Promise<
  { ok: true; blob: Blob; fileName: string } | { ok: false; message: string }
> {
  const form = new FormData();
  form.append("originalFileName", file.name);
  form.append("file", file, file.name);
  if (caseInfos?.implantManufacturer) {
    form.append("implantManufacturer", caseInfos.implantManufacturer);
  }
  if (caseInfos?.implantBrand) form.append("implantBrand", caseInfos.implantBrand);
  if (caseInfos?.implantFamily) form.append("implantFamily", caseInfos.implantFamily);
  if (caseInfos?.implantType) form.append("implantType", caseInfos.implantType);

  let effectiveToken = token;
  if (!effectiveToken) {
    try {
      effectiveToken = localStorage.getItem("abuts_auth_token") || undefined;
    } catch {
      // ignore
    }
  }

  const res = await fetch("/api/files/temp/stl-corrected", {
    method: "POST",
    headers: effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {},
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(170_000),
  });

  if (!res.ok) {
    let message = "보정 STL을 만들지 못했습니다.";
    try {
      const json = (await res.json()) as { message?: string };
      if (json?.message) message = json.message;
    } catch {
      // ignore
    }
    return { ok: false, message };
  }

  const blob = await res.blob();
  const fileName =
    parseAttachmentFileName(res.headers.get("Content-Disposition")) ||
    correctedFileName(file.name);
  return { ok: true, blob, fileName };
}

function authHeaders(token?: string | null) {
  let effectiveToken = token;
  if (!effectiveToken) {
    try {
      effectiveToken = localStorage.getItem("abuts_auth_token") || undefined;
    } catch {
      // ignore
    }
  }
  return effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {};
}

/** 보정을 고르면 바로 파이프라인을 시작한다. 파일은 기다리지 않는다. */
export function startCorrectedDesign(correctedId: string, token?: string | null) {
  const id = String(correctedId || "").trim();
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  void fetch(`/api/files/temp/stl-corrected-cache/${id}/start`, {
    method: "POST",
    headers: authHeaders(token),
    cache: "no-store",
  }).catch(() => null);
}

/** 람다가 S3에 남긴 보정 STL. 의뢰 파일은 이 키를 그대로 쓴다. */
export async function fetchCorrectedDesignUpload({
  correctedId,
  fallbackName,
  token,
}: {
  correctedId: string;
  fallbackName: string;
  token?: string | null;
}): Promise<
  | { ok: true; file: { _id: string; key: string; originalName: string; size: number; mimetype: string } }
  | { ok: false; message: string }
> {
  const id = String(correctedId || "").trim();
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return { ok: false, message: "보정 STL이 없거나 만료되었습니다." };
  }
  let effectiveToken = token;
  if (!effectiveToken) {
    try {
      effectiveToken = localStorage.getItem("abuts_auth_token") || undefined;
    } catch {
      // ignore
    }
  }
  const res = await fetch(`/api/files/temp/stl-corrected-cache/${id}/meta`, {
    method: "GET",
    headers: effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(170_000),
  });
  if (!res.ok) {
    let message = "보정 STL이 없거나 만료되었습니다.";
    try {
      const json = (await res.json()) as { message?: string };
      if (json?.message) message = json.message;
    } catch {
      // ignore
    }
    return { ok: false, message };
  }
  const json = (await res.json()) as {
    data?: { s3Key?: string; size?: number; originalName?: string };
  };
  const s3Key = String(json?.data?.s3Key || "").trim();
  const size = Number(json?.data?.size || 0);
  if (!s3Key || !(size > 0)) {
    return { ok: false, message: "보정 STL이 없거나 만료되었습니다." };
  }
  return {
    ok: true,
    file: {
      _id: id,
      key: s3Key,
      originalName: correctedFileName(json?.data?.originalName || fallbackName),
      size,
      mimetype: "model/stl",
    },
  };
}

/** 검사 때 캐시한 보정 STL. 원본 파일을 다시 올리지 않는다. */
export async function fetchCachedCorrectedStlBlob({
  correctedId,
  fallbackName,
  token,
}: {
  correctedId: string;
  fallbackName: string;
  token?: string | null;
}): Promise<
  { ok: true; blob: Blob; fileName: string } | { ok: false; message: string }
> {
  const id = String(correctedId || "").trim();
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return { ok: false, message: "보정 STL이 없거나 만료되었습니다." };
  }
  let effectiveToken = token;
  if (!effectiveToken) {
    try {
      effectiveToken = localStorage.getItem("abuts_auth_token") || undefined;
    } catch {
      // ignore
    }
  }
  const res = await fetch(`/api/files/temp/stl-corrected-cache/${id}`, {
    method: "GET",
    headers: effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(170_000),
  });
  if (!res.ok) {
    return { ok: false, message: "보정 STL이 없거나 만료되었습니다." };
  }
  const blob = await res.blob();
  const fileName =
    parseAttachmentFileName(res.headers.get("Content-Disposition")) ||
    correctedFileName(fallbackName);
  return { ok: true, blob, fileName };
}

export function triggerBrowserFileDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
