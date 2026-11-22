// 기공소 다운로드: 스캔을 기공소가 고른 DCM·PLY·STL로 저장한다.
// .3ox·.3oxz는 안의 스캔을 풀어 같은 포맷으로 쓴다. .dentalProject 안의 확장자만 맞춘다.
// 씬에 있는 스캔(어벗이 들어간 악궁)도 같은 인코더로 쓴다. 텍스처가 있으면 버텍스 칼라로 굽는다.
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

type TexturePixels = { data: Uint8ClampedArray; width: number; height: number };

function texturePixels(
  texture: THREE.Texture,
  cache: WeakMap<object, TexturePixels>,
): TexturePixels | null {
  const image = texture.image as (CanvasImageSource & { width?: number; height?: number }) | null;
  if (!image || !image.width || !image.height) return null;
  const cached = cache.get(image);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0);
  } catch {
    return null;
  }
  const pixels = {
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width,
    height: canvas.height,
  };
  cache.set(image, pixels);
  return pixels;
}

/** 프리뷰와 같다. 텍스처가 있으면 그걸, 없으면 버텍스 칼라, 둘 다 없으면 재질색. */
function meshColors(
  mesh: THREE.Mesh,
  vertexCount: number,
  cache: WeakMap<object, TexturePixels>,
): Uint8Array {
  const uv = mesh.geometry.getAttribute("uv");
  const texture =
    (mesh.userData.scanTexture as THREE.Texture | null | undefined) ||
    (mesh.material instanceof THREE.MeshStandardMaterial ? mesh.material.map : null);
  if (texture && uv && uv.count >= vertexCount) {
    const pixels = texturePixels(texture, cache);
    if (pixels) {
      const out = new Uint8Array(vertexCount * 3);
      const { data, width, height } = pixels;
      const flipY = texture.flipY !== false;
      for (let i = 0; i < vertexCount; i += 1) {
        const u = Math.min(1, Math.max(0, uv.getX(i)));
        const vRaw = Math.min(1, Math.max(0, uv.getY(i)));
        const v = flipY ? 1 - vRaw : vRaw;
        const x = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
        const y = Math.min(height - 1, Math.max(0, Math.round(v * (height - 1))));
        const p = (y * width + x) * 4;
        const o = i * 3;
        out[o] = data[p]!;
        out[o + 1] = data[p + 1]!;
        out[o + 2] = data[p + 2]!;
      }
      return out;
    }
  }
  const color = mesh.geometry.getAttribute("color");
  if (color && color.itemSize >= 3 && color.count >= vertexCount) {
    return linearColorsToSrgbBytes({
      count: vertexCount,
      getX: (i) => color.getX(i),
      getY: (i) => color.getY(i),
      getZ: (i) => color.getZ(i),
    });
  }
  const mat = mesh.material;
  const solid =
    mat instanceof THREE.MeshStandardMaterial ? mat.color : new THREE.Color(0xb9c6d6);
  const byte = linearColorsToSrgbBytes({
    count: 1,
    getX: () => solid.r,
    getY: () => solid.g,
    getZ: () => solid.b,
  });
  const out = new Uint8Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const o = i * 3;
    out[o] = byte[0]!;
    out[o + 1] = byte[1]!;
    out[o + 2] = byte[2]!;
  }
  return out;
}

type WorldPiece = {
  positions: Float32Array;
  indices: Uint32Array;
  colors: Uint8Array;
};

function meshWorldPiece(
  mesh: THREE.Mesh,
  cache: WeakMap<object, TexturePixels>,
): WorldPiece | null {
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.getAttribute("position");
  if (!pos || pos.count < 3) return null;
  const index = mesh.geometry.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  if (triCount < 1) return null;
  const fullColors = meshColors(mesh, pos.count, cache);
  const v = new THREE.Vector3();
  if (index) {
    const remap = new Int32Array(pos.count).fill(-1);
    const usedVerts: number[] = [];
    const indices = new Uint32Array(triCount * 3);
    let validTriCount = 0;
    for (let t = 0; t < triCount; t += 1) {
      const base = t * 3;
      const a = index.getX(base);
      const b = index.getX(base + 1);
      const c = index.getX(base + 2);
      if (a < 0 || b < 0 || c < 0 || a >= pos.count || b >= pos.count || c >= pos.count) continue;
      if (remap[a]! < 0) {
        remap[a] = usedVerts.length;
        usedVerts.push(a);
      }
      if (remap[b]! < 0) {
        remap[b] = usedVerts.length;
        usedVerts.push(b);
      }
      if (remap[c]! < 0) {
        remap[c] = usedVerts.length;
        usedVerts.push(c);
      }
      const outBase = validTriCount * 3;
      indices[outBase] = remap[a]!;
      indices[outBase + 1] = remap[b]!;
      indices[outBase + 2] = remap[c]!;
      validTriCount += 1;
    }
    if (validTriCount < 1 || usedVerts.length < 3) return null;
    const positions = new Float32Array(usedVerts.length * 3);
    const colors = new Uint8Array(usedVerts.length * 3);
    for (let outIdx = 0; outIdx < usedVerts.length; outIdx += 1) {
      const srcIdx = usedVerts[outIdx]!;
      v.fromBufferAttribute(pos as THREE.BufferAttribute, srcIdx).applyMatrix4(mesh.matrixWorld);
      positions[outIdx * 3] = v.x;
      positions[outIdx * 3 + 1] = v.y;
      positions[outIdx * 3 + 2] = v.z;
      colors[outIdx * 3] = fullColors[srcIdx * 3]!;
      colors[outIdx * 3 + 1] = fullColors[srcIdx * 3 + 1]!;
      colors[outIdx * 3 + 2] = fullColors[srcIdx * 3 + 2]!;
    }
    return {
      positions,
      indices: validTriCount === triCount ? indices : indices.slice(0, validTriCount * 3),
      colors,
    };
  }
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const indices = new Uint32Array(triCount * 3);
  for (let t = 0; t < triCount; t += 1) {
    const base = t * 3;
    indices[base] = base;
    indices[base + 1] = base + 1;
    indices[base + 2] = base + 2;
  }
  return {
    positions,
    indices,
    colors: fullColors,
  };
}

/** 월드 좌표로 합친 스캔. 칼라는 프리뷰와 같은 우선순위다. */
export function meshesToLabMeshData(meshes: readonly THREE.Mesh[]): HpsDcmMeshData | null {
  const cache = new WeakMap<object, TexturePixels>();
  const pieces: WorldPiece[] = [];
  let vertexCount = 0;
  let indexCount = 0;
  for (const mesh of meshes) {
    const piece = meshWorldPiece(mesh, cache);
    if (!piece) continue;
    pieces.push(piece);
    vertexCount += piece.positions.length / 3;
    indexCount += piece.indices.length;
  }
  if (vertexCount < 3 || indexCount < 3) return null;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  const colors = new Uint8Array(vertexCount * 3);
  let vertexAt = 0;
  let indexAt = 0;
  for (const piece of pieces) {
    positions.set(piece.positions, vertexAt * 3);
    colors.set(piece.colors.subarray(0, (piece.positions.length / 3) * 3), vertexAt * 3);
    for (let i = 0; i < piece.indices.length; i += 1) {
      indices[indexAt + i] = piece.indices[i]! + vertexAt;
    }
    vertexAt += piece.positions.length / 3;
    indexAt += piece.indices.length;
  }
  return { positions, indices, colors, workCopy: true };
}

/** DCM·PLY(칼라)·STL. 프리뷰 다운로드와 같은 인코더. */
export function encodeLabMeshData(mesh: HpsDcmMeshData, format: DcmDownloadFormat): Blob {
  if (format === "dcm") return encodeHpsCaDcm(mesh);
  if (format === "stl") return meshDataToStlBlob(mesh);
  return meshDataToPlyBlob(mesh);
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
