// change-log:
// - 2026-09-10: 3Shape HPS(.dcm) → binary PLY(버텍스 칼라) 클라이언트 변환.
// related files:
// - web/frontend/src/shared/files/hpsDcmPreview.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/files/dcmDownloadFormat.ts
import { parseHpsDcmMeshData, type HpsDcmMeshData } from "./hpsDcmPreview";

function plyHeader(vertexCount: number, faceCount: number, hasColors: boolean): string {
  const lines = [
    "ply",
    "format binary_little_endian 1.0",
    "comment abuts.fit hps-dcm",
    `element vertex ${vertexCount}`,
    "property float x",
    "property float y",
    "property float z",
  ];
  if (hasColors) {
    lines.push(
      "property uchar red",
      "property uchar green",
      "property uchar blue",
    );
  }
  lines.push(
    `element face ${faceCount}`,
    "property list uchar int vertex_indices",
    "end_header",
  );
  return `${lines.join("\n")}\n`;
}

/** Mesh data → binary little-endian PLY blob. */
export function meshDataToPlyBlob(mesh: HpsDcmMeshData): Blob {
  const vertexCount = mesh.positions.length / 3;
  const faceCount = mesh.indices.length / 3;
  const hasColors = Boolean(mesh.colors && mesh.colors.length >= vertexCount * 3);
  const header = new TextEncoder().encode(plyHeader(vertexCount, faceCount, hasColors));

  const vertexStride = hasColors ? 15 : 12; // 3*float32 + optional 3*uchar
  const faceStride = 1 + 3 * 4; // uchar count + 3*int32
  const body = new ArrayBuffer(vertexCount * vertexStride + faceCount * faceStride);
  const view = new DataView(body);
  let offset = 0;

  for (let i = 0; i < vertexCount; i += 1) {
    const p = i * 3;
    view.setFloat32(offset, mesh.positions[p]!, true);
    view.setFloat32(offset + 4, mesh.positions[p + 1]!, true);
    view.setFloat32(offset + 8, mesh.positions[p + 2]!, true);
    offset += 12;
    if (hasColors) {
      view.setUint8(offset, mesh.colors![p]!);
      view.setUint8(offset + 1, mesh.colors![p + 1]!);
      view.setUint8(offset + 2, mesh.colors![p + 2]!);
      offset += 3;
    }
  }

  for (let f = 0; f < faceCount; f += 1) {
    const i = f * 3;
    view.setUint8(offset, 3);
    view.setInt32(offset + 1, mesh.indices[i]!, true);
    view.setInt32(offset + 5, mesh.indices[i + 1]!, true);
    view.setInt32(offset + 9, mesh.indices[i + 2]!, true);
    offset += faceStride;
  }

  return new Blob([header, new Uint8Array(body)], {
    type: "application/octet-stream",
  });
}

export function replaceExtWithPly(fileName: string): string {
  const raw = String(fileName || "").trim() || "model.dcm";
  const base = raw.split("/").pop() || raw;
  const dot = base.lastIndexOf(".");
  if (dot > 0) return `${base.slice(0, dot)}.ply`;
  return `${base}.ply`;
}

/** 3Shape HPS DCM ArrayBuffer → colored binary PLY. */
export async function convertHpsDcmBufferToPlyBlob(
  buffer: ArrayBuffer,
): Promise<Blob> {
  const mesh = await parseHpsDcmMeshData(buffer);
  return meshDataToPlyBlob(mesh);
}
