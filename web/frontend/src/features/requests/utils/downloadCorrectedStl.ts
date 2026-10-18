// related files:
// - web/backend/controllers/files/stlPreflight.controller.js
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
import type { CaseInfos } from "@/pages/requestor/new_request/hooks/newRequestTypes";

function correctedFileName(originalName: string) {
  const raw = String(originalName || "model.stl").trim() || "model.stl";
  const base = raw.replace(/\.stl$/i, "");
  return `${base}.corrected.stl`;
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
