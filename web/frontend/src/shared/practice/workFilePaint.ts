// 작업 파일 3D 프리뷰 페인트·카메라. 서버 production.workFilePaint와 같다.
// related files:
// - web/backend/utils/workFilePaint.js
// - web/frontend/src/shared/components/RequestFilesPreviewDialog.tsx
import type { PaintShape } from "@/shared/components/practice/viewPaintGeom";
import type { CaseLayerView } from "@/shared/share/CaseLayerViewer";

export type WorkFilePaintPayload = {
  fileKeys: string[];
  shapes: PaintShape[];
  view: CaseLayerView | null;
};

function tuple3(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  if (![x, y, z].every((n) => Number.isFinite(n))) return null;
  return [x, y, z];
}

export function parseWorkFilePaintView(raw: unknown): CaseLayerView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const position = tuple3(row.position);
  const target = tuple3(row.target);
  const up = tuple3(row.up);
  if (!position || !target || !up) return null;
  return { position, target, up };
}

export function workFilePaintModelKeys(fileNamesAndKeys: ReadonlyArray<{
  fileName?: string;
  s3Key?: string;
}>): string[] {
  const keys = fileNamesAndKeys
    .filter((row) => /\.(stl|ply|obj|dcm)$/i.test(String(row.fileName || "")))
    .map((row) => String(row.s3Key || "").trim())
    .filter(Boolean);
  return [...new Set(keys)].sort();
}

export function parseWorkFilePaint(raw: unknown): WorkFilePaintPayload {
  if (!raw || typeof raw !== "object") {
    return { fileKeys: [], shapes: [], view: null };
  }
  const row = raw as Record<string, unknown>;
  const fileKeys = Array.isArray(row.fileKeys)
    ? [...new Set(row.fileKeys.map((key) => String(key || "").trim()).filter(Boolean))].sort()
    : [];
  const shapes = Array.isArray(row.shapes) ? (row.shapes as PaintShape[]) : [];
  return { fileKeys, shapes, view: parseWorkFilePaintView(row.view) };
}
