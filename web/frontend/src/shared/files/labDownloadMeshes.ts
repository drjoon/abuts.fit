// 기공소 다운로드: 스캔을 기공소가 고른 DCM·PLY·STL로 저장한다.
// .3ox·.3oxz는 안의 스캔을 풀어 같은 포맷으로 쓴다. .dentalProject 안의 확장자만 맞춘다.
// related files:
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/files/cadProjectPreview.ts
// - web/frontend/src/shared/files/hpsDcmToPly.ts
// - web/frontend/src/shared/files/hpsDcmWrite.ts

import { expandCadProjectPreview } from "@/shared/files/cadProjectPreview";
import type { DcmDownloadFormat } from "@/shared/files/dcmDownloadFormat";
import {
  convertHpsDcmBuffer,
  meshDataToPlyBlob,
  meshDataToStlBlob,
  replaceExt,
} from "@/shared/files/hpsDcmToPly";
import type { HpsDcmMeshData } from "@/shared/files/hpsDcmPreview";
import { encodeHpsCaDcm, linearColorsToSrgbBytes } from "@/shared/files/hpsDcmWrite";
import { getModelExtLower, parseModelPreview } from "@/shared/files/modelPreviewFile";
import { classifyOralScanFileName } from "@/shared/practice/labProsthesisAiDesign";
import * as THREE from "three";

export type LabDownloadPiece = { fileName: string; blob: Blob };

const MESH_EXT = new Set([".dcm", ".ply", ".stl", ".obj"]);

function baseName(fileName: string): string {
  const raw = String(fileName || "").trim() || "download";
  return raw.split(/[/\\]/).pop() || raw;
}

function shouldApply(fileName: string, labFormat?: boolean): boolean {
  if (labFormat === false) return false;
  const ext = getModelExtLower(fileName);
  if (ext === ".3ox" || ext === ".3oxz") return true;
  if (ext === ".dentalproject") return labFormat === true;
  if (ext === ".dcm" || ext === ".ply" || ext === ".obj") return true;
  if (ext === ".stl") {
    if (labFormat === true) return true;
    return classifyOralScanFileName(fileName) !== "other";
  }
  return false;
}

/** 저장 이름. 묶음·프로젝트는 받은 뒤에 내용이 바뀌므로 refresh. */
export function planLabDownloadFile(opts: {
  fileName: string;
  format: DcmDownloadFormat;
  labFormat?: boolean;
  size?: number;
}): { fileName: string; refresh: boolean; size: number } {
  const original = baseName(opts.fileName);
  const size = Math.max(0, Number(opts.size) || 0);
  if (!shouldApply(original, opts.labFormat)) {
    return { fileName: original, refresh: false, size };
  }
  const ext = getModelExtLower(original);
  if (ext === ".3ox" || ext === ".3oxz" || ext === ".dentalproject") {
    return { fileName: original, refresh: true, size: 0 };
  }
  if (ext === `.${opts.format}`) return { fileName: original, refresh: false, size };
  return { fileName: replaceExt(original, opts.format), refresh: false, size: 0 };
}

function geometryToMesh(geometry: THREE.BufferGeometry): HpsDcmMeshData {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count < 3) throw new Error("스캔 형상이 없습니다.");
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
  }
  const index = geometry.getIndex();
  const indices = new Uint32Array(index ? index.count : pos.count);
  if (index) {
    for (let i = 0; i < index.count; i += 1) indices[i] = index.getX(i);
  } else {
    for (let i = 0; i < pos.count; i += 1) indices[i] = i;
  }
  const color = geometry.getAttribute("color");
  const colors =
    color && color.itemSize >= 3 && color.count >= pos.count
      ? linearColorsToSrgbBytes(color)
      : null;
  return { positions, indices, colors, workCopy: true };
}

async function meshFromFile(file: File): Promise<HpsDcmMeshData> {
  const parsed = await parseModelPreview(file, { skipColorEnhance: true });
  parsed.texture?.dispose();
  try {
    return geometryToMesh(parsed.geometry);
  } finally {
    parsed.geometry.dispose();
  }
}

async function meshToFormat(file: File, format: DcmDownloadFormat): Promise<LabDownloadPiece> {
  const ext = getModelExtLower(file.name);
  if (ext === `.${format}`) return { fileName: file.name, blob: file };
  if (ext === ".dcm" && (format === "ply" || format === "stl")) {
    const blob = await convertHpsDcmBuffer(await file.arrayBuffer(), format);
    return { fileName: replaceExt(file.name, format), blob };
  }
  if (!MESH_EXT.has(ext)) return { fileName: file.name, blob: file };
  const mesh = await meshFromFile(file);
  const blob =
    format === "dcm"
      ? encodeHpsCaDcm(mesh)
      : format === "stl"
        ? meshDataToStlBlob(mesh)
        : meshDataToPlyBlob(mesh);
  return { fileName: replaceExt(file.name, format), blob };
}

function patchProjectExt(text: string, format: DcmDownloadFormat): string {
  return text.replace(/\.(ply|stl|obj|dcm)\b/gi, (match) => {
    const ext = match.slice(1).toLowerCase();
    return ext === format ? match : `.${format}`;
  });
}

/** 원본 blob을 기공소 포맷 파일들로. 변환 대상이 아니면 원본 하나. */
export async function materializeLabDownload(opts: {
  blob: Blob;
  fileName: string;
  format: DcmDownloadFormat;
  labFormat?: boolean;
}): Promise<LabDownloadPiece[]> {
  const fileName = baseName(opts.fileName);
  if (!shouldApply(fileName, opts.labFormat)) return [{ fileName, blob: opts.blob }];

  const ext = getModelExtLower(fileName);
  if (ext === ".dentalproject") {
    const text = await opts.blob.text();
    if (text.includes("\0")) return [{ fileName, blob: opts.blob }];
    const patched = patchProjectExt(text, opts.format);
    if (patched === text) return [{ fileName, blob: opts.blob }];
    return [{ fileName, blob: new Blob([patched], { type: "application/xml" }) }];
  }

  if (ext === ".3ox" || ext === ".3oxz") {
    const packed = new File([opts.blob], fileName, {
      type: opts.blob.type || "application/octet-stream",
    });
    const preview = await expandCadProjectPreview(packed);
    if (!preview.models.length) return [{ fileName, blob: opts.blob }];
    const pieces: LabDownloadPiece[] = [];
    for (const model of preview.models) {
      pieces.push(await meshToFormat(model, opts.format));
    }
    for (const image of preview.images) {
      pieces.push({ fileName: image.name, blob: image });
    }
    return pieces;
  }

  const file = new File([opts.blob], fileName, {
    type: opts.blob.type || "application/octet-stream",
  });
  return [await meshToFormat(file, opts.format)];
}
