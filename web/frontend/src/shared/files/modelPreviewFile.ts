// change-log:
// - 2026-08-23: STL/PLY/OBJ geometry 파서를 썸네일·뷰어 공용으로 분리.
// - 2026-08-11: STL/PLY/OBJ 프리뷰용 File 래핑(확장자→MIME) 헬퍼 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/ui/dashboard/WorksheetDiameterQueueModal.tsx
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

/** STL/PLY/OBJ File → BufferGeometry (StlPreviewViewer·썸네일 공용) */
export async function parseModelGeometry(file: File): Promise<THREE.BufferGeometry> {
  const buffer = await file.arrayBuffer();
  const ext = getModelExtLower(file.name);

  if (ext === ".ply") {
    return new PLYLoader().parse(buffer);
  }

  if (ext === ".obj") {
    const text = new TextDecoder().decode(buffer);
    const group = new OBJLoader().parse(text);
    group.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      parts.push(geo);
    });
    if (parts.length === 0) {
      throw new Error("OBJ에 표시할 메시가 없습니다.");
    }
    if (parts.length === 1) return parts[0]!;
    const merged = mergeGeometries(parts, false);
    if (!merged) {
      throw new Error("OBJ 메시를 합치지 못했습니다.");
    }
    return merged;
  }

  return new STLLoader().parse(buffer);
}
