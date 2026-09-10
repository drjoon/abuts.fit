// change-log:
// - 2026-09-10: 기공소 DCM 다운로드 포맷(원본/PLY) localStorage 선호.
// related files:
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx

export type DcmDownloadFormat = "dcm" | "ply";

const STORAGE_KEY = "abuts.dcmDownloadFormat";

export function isDcmFileName(fileName: string): boolean {
  return /\.dcm$/i.test(String(fileName || "").trim());
}

export function readDcmDownloadFormat(): DcmDownloadFormat {
  try {
    const raw = String(localStorage.getItem(STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    if (raw === "ply") return "ply";
  } catch {
    // ignore
  }
  return "dcm";
}

export function writeDcmDownloadFormat(format: DcmDownloadFormat) {
  try {
    localStorage.setItem(STORAGE_KEY, format);
  } catch {
    // ignore
  }
}
