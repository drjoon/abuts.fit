// change-log:
// - 2026-09-28: STL 추가. 저장값이 없으면 null(디자인 SW 기본값을 쓸 수 있게).
// - 2026-09-10: 기공소 DCM 다운로드 포맷(원본/PLY) localStorage 선호.
// related files:
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx

export type DcmDownloadFormat = "dcm" | "ply" | "stl";

export const DCM_DOWNLOAD_FORMAT_OPTIONS: Array<{
  value: DcmDownloadFormat;
  label: string;
}> = [
  { value: "dcm", label: "DCM 원본" },
  { value: "ply", label: "PLY (칼라)" },
  { value: "stl", label: "STL" },
];

const STORAGE_KEY = "abuts.dcmDownloadFormat";

export function isDcmFileName(fileName: string): boolean {
  return /\.dcm$/i.test(String(fileName || "").trim());
}

/** 사용자가 고른 적이 없으면 null */
export function readStoredDcmDownloadFormat(): DcmDownloadFormat | null {
  try {
    const raw = String(localStorage.getItem(STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    if (raw === "dcm" || raw === "ply" || raw === "stl") return raw;
  } catch {
    // ignore
  }
  return null;
}

export function readDcmDownloadFormat(): DcmDownloadFormat {
  return readStoredDcmDownloadFormat() || "dcm";
}

export function writeDcmDownloadFormat(format: DcmDownloadFormat) {
  try {
    localStorage.setItem(STORAGE_KEY, format);
  } catch {
    // ignore
  }
}
