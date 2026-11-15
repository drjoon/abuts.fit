// 구강 스캔을 한 번 해석한 정점·색·UV를 이 브라우저에 둔다.
// 모달을 다시 열면 S3와 파서(DCM·PLY)를 건너뛰고 이 메시로 바로 연다.
// 정렬은 이 복사본을 덮어쓰므로, 저장본은 해석 직후 값이고 읽기마다 새 배열로 복사한다.
// related files:
// - web/frontend/src/shared/files/fileBlobCache.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

import * as THREE from "three";

import { getFileBlob, setFileBlob } from "@/shared/files/fileBlobCache";

const MAGIC = 0x53434e31;
const VERSION = 1;
const memory = new Map<string, ArrayBuffer>();

function cacheKey(s3Key: string) {
  return `scanmesh:v1:${String(s3Key || "").trim()}`;
}

function copyComponents(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  itemSize: number,
  target: Float32Array,
  offset: number,
) {
  const plain = attr as THREE.BufferAttribute;
  if (!plain.isInterleavedBufferAttribute && plain.array instanceof Float32Array && plain.itemSize === itemSize) {
    target.set(plain.array.subarray(0, attr.count * itemSize), offset);
    return;
  }
  let o = offset;
  for (let i = 0; i < attr.count; i += 1) {
    for (let k = 0; k < itemSize; k += 1) target[o++] = attr.getComponent(i, k);
  }
}

function bytesFromGeometry(geometry: THREE.BufferGeometry): ArrayBuffer | null {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < 3) return null;
  const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const index = geometry.getIndex();
  const colorItem = colorAttr && (colorAttr.itemSize === 3 || colorAttr.itemSize === 4) ? colorAttr.itemSize : 0;
  const uvItem = uvAttr && uvAttr.itemSize >= 2 ? 2 : 0;
  const indexCount = index?.count ?? 0;
  const headerFloats = 6;
  const floatCount = headerFloats + pos.count * 3 + pos.count * colorItem + pos.count * uvItem;
  const buffer = new ArrayBuffer(floatCount * 4 + indexCount * 4);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, pos.count, true);
  view.setUint32(12, colorItem, true);
  view.setUint32(16, uvItem, true);
  view.setUint32(20, indexCount, true);
  const floats = new Float32Array(buffer, 0, floatCount);
  let o = headerFloats;
  copyComponents(pos, 3, floats, o);
  o += pos.count * 3;
  if (colorItem && colorAttr) {
    copyComponents(colorAttr, colorItem, floats, o);
    o += pos.count * colorItem;
  }
  if (uvItem && uvAttr) {
    copyComponents(uvAttr, uvItem, floats, o);
  }
  if (index && indexCount > 0) {
    const ids = new Uint32Array(buffer, floatCount * 4, indexCount);
    for (let i = 0; i < indexCount; i += 1) ids[i] = index.getX(i);
  }
  return buffer;
}

function geometryFromBytes(buffer: ArrayBuffer): THREE.BufferGeometry | null {
  if (buffer.byteLength < 24) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null;
  const count = view.getUint32(8, true);
  const colorItem = view.getUint32(12, true);
  const uvItem = view.getUint32(16, true);
  const indexCount = view.getUint32(20, true);
  if (count < 3 || colorItem > 4 || uvItem > 2) return null;
  const floatCount = 6 + count * 3 + count * colorItem + count * uvItem;
  if (buffer.byteLength < floatCount * 4 + indexCount * 4) return null;
  const floats = new Float32Array(buffer, 0, floatCount);
  let o = 6;
  const positions = floats.slice(o, o + count * 3);
  o += count * 3;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colorItem === 3 || colorItem === 4) {
    geometry.setAttribute("color", new THREE.BufferAttribute(floats.slice(o, o + count * colorItem), colorItem));
    o += count * colorItem;
  }
  if (uvItem === 2) {
    geometry.setAttribute("uv", new THREE.BufferAttribute(floats.slice(o, o + count * 2), 2));
  }
  if (indexCount > 0) {
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, floatCount * 4, indexCount).slice(), 1));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** 해석된 스캔 메시. 없으면 null. 반환 지오메트리는 캐시와 분리된 복사본이다. */
export async function readCachedScanGeometry(s3Key: string): Promise<THREE.BufferGeometry | null> {
  const id = String(s3Key || "").trim();
  if (!id) return null;
  const key = cacheKey(id);
  try {
    let bytes = memory.get(key) ?? null;
    if (!bytes) {
      const blob = await getFileBlob(key);
      if (!blob) return null;
      bytes = await blob.arrayBuffer();
      memory.set(key, bytes);
    }
    return geometryFromBytes(bytes);
  } catch {
    return null;
  }
}

/** 해석 직후 호출한다. 이후 정점을 바꿔도 저장본은 그대로다. */
export function storeScanGeometry(s3Key: string, geometry: THREE.BufferGeometry): void {
  const id = String(s3Key || "").trim();
  if (!id) return;
  const key = cacheKey(id);
  if (memory.has(key)) return;
  const bytes = bytesFromGeometry(geometry);
  if (!bytes) return;
  memory.set(key, bytes);
  void setFileBlob(key, new Blob([bytes])).catch(() => undefined);
}
