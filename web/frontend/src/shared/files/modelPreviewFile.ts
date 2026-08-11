// change-log:
// - 2026-08-11: STL/PLY/OBJ 프리뷰용 File 래핑(확장자→MIME) 헬퍼 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/ui/dashboard/WorksheetDiameterQueueModal.tsx

export const MODEL_PREVIEW_EXTENSIONS = [".stl", ".ply", ".obj"] as const;

export function getModelExtLower(name: string): string {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
}

export function isModelPreviewExt(ext: string): boolean {
  return (MODEL_PREVIEW_EXTENSIONS as readonly string[]).includes(
    String(ext || "").toLowerCase(),
  );
}

export function mimeTypeForModelFileName(name: string): string {
  const ext = getModelExtLower(name);
  if (ext === ".ply") return "model/ply";
  if (ext === ".obj") return "model/obj";
  return "model/stl";
}

/** path/filePath에서 basename만 추출. 비면 fallback. */
export function modelFileBasename(
  pathOrName: unknown,
  fallback = "model.stl",
): string {
  const raw = String(pathOrName || "").trim();
  if (!raw) return fallback;
  const base = raw.split("/").pop() || raw;
  return base.trim() || fallback;
}

/**
 * Blob을 StlPreviewViewer가 확장자로 로더를 고를 수 있게 File로 감싼다.
 * MIME은 blob이 비어 있거나 octet-stream일 때 파일명 확장자로 보정한다.
 */
export function fileFromModelBlob(blob: Blob, fileName: string): File {
  const name = modelFileBasename(fileName, "model.stl");
  const blobType = String(blob?.type || "").trim().toLowerCase();
  const type =
    blobType && blobType !== "application/octet-stream"
      ? blob.type
      : mimeTypeForModelFileName(name);
  return new File([blob], name, { type });
}
