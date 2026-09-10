// change-log:
// - 2026-09-10: TextureData2·VertexColorSet·Facets tint → 버텍스 칼라(베이크). PLY export용 mesh 데이터.
// - 2026-09-10: 3Shape/TRIOS HPS(.dcm) → Three.BufferGeometry 클라이언트 파서 (CA/CC/CE).
// related files:
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/files/hpsDcmToPly.ts
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/shared/files/md5Lite.ts
//
// Portions adapted from:
// - hpsdecode (MIT, Copyright (c) 2025 Lars Knol) — CC face command decode · UV/texture bake
// - Open3SDCM (Boost Software License 1.0, Romain Nosenzo) — CE Blowfish key derive
import * as THREE from "three";
import { Blowfish } from "egoroof-blowfish";
import { md5 } from "./md5Lite";

const SUPPORTED_SCHEMAS = new Set(["CA", "CC", "CE"]);

/** Open3SDCM GetBaseCeKey: base64 then XOR 0x55 (not plaintext). */
const CE_KEY_OBF_B64 = "YcVXxg16HMEjV0yKbgMRSQ==";

type IndexMode = 16 | 32;

type Edge = { start: number; end: number };

class BinaryReader {
  private pos = 0;
  constructor(private readonly data: Uint8Array) {}

  isEof() {
    return this.pos >= this.data.length;
  }

  readUint8() {
    if (this.isEof()) throw new Error("Unexpected end of HPS face stream");
    const v = this.data[this.pos]!;
    this.pos += 1;
    return v;
  }

  readUint16() {
    if (this.pos + 2 > this.data.length) {
      throw new Error("Unexpected end of HPS face stream");
    }
    const v = this.data[this.pos]! | (this.data[this.pos + 1]! << 8);
    this.pos += 2;
    return v;
  }

  readUint32() {
    if (this.pos + 4 > this.data.length) {
      throw new Error("Unexpected end of HPS face stream");
    }
    const v =
      this.data[this.pos]! |
      (this.data[this.pos + 1]! << 8) |
      (this.data[this.pos + 2]! << 16) |
      (this.data[this.pos + 3]! << 24);
    this.pos += 4;
    return v >>> 0;
  }
}

function decodeBase64(text: string): Uint8Array {
  const cleaned = String(text || "").replace(/\s+/g, "");
  if (!cleaned) return new Uint8Array(0);
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function swapEndiannessInPlace(data: Uint8Array) {
  for (let i = 0; i + 8 <= data.length; i += 8) {
    let t = data[i]!;
    data[i] = data[i + 3]!;
    data[i + 3] = t;
    t = data[i + 1]!;
    data[i + 1] = data[i + 2]!;
    data[i + 2] = t;
    t = data[i + 4]!;
    data[i + 4] = data[i + 7]!;
    data[i + 7] = t;
    t = data[i + 5]!;
    data[i + 5] = data[i + 6]!;
    data[i + 6] = t;
  }
}

function getBaseCeKey(): Uint8Array {
  const raw = decodeBase64(CE_KEY_OBF_B64);
  const key = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) key[i] = raw[i]! ^ 0x55;
  return key;
}

function packageLockHash(packageLockList: string): string {
  const items = String(packageLockList || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return "";
  const canonical = [...new Set(items)].sort().join(";") + ";";
  return md5(canonical).toUpperCase();
}

function scrambleKey(key: Uint8Array): Uint8Array {
  const out = new Uint8Array(key.length);
  for (let i = 0; i < key.length; i += 1) {
    out[i] = key[key.length - 1 - i]! ^ 0x7b;
  }
  return out;
}

function buildCeKey(
  properties: Record<string, string>,
  scramble: boolean,
): Uint8Array {
  const base = getBaseCeKey();
  const ekid = properties.EKID || "1";
  const hash = packageLockHash(properties.PackageLockList || "");
  let key = base;
  if (ekid === "1" && hash) {
    const hashBytes = new TextEncoder().encode(hash);
    const merged = new Uint8Array(base.length + hashBytes.length);
    merged.set(base, 0);
    merged.set(hashBytes, base.length);
    key = merged;
  }
  return scramble ? scrambleKey(key) : key;
}

function decryptCeBuffer(
  encrypted: Uint8Array,
  key: Uint8Array,
  truncateSize: number,
): Uint8Array {
  let data: Uint8Array;
  if (encrypted.length % 8 !== 0) {
    data = new Uint8Array(encrypted.length + (8 - (encrypted.length % 8)));
    data.set(encrypted);
  } else {
    data = new Uint8Array(encrypted);
  }

  swapEndiannessInPlace(data);
  const bf = new Blowfish(key, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const decrypted = bf.decode(data, Blowfish.TYPE.UINT8_ARRAY);
  swapEndiannessInPlace(decrypted);
  if (truncateSize > 0 && decrypted.length > truncateSize) {
    return decrypted.subarray(0, truncateSize);
  }
  return decrypted;
}

function adler32Swapped(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  return (
    (((adler & 0xff) << 24) |
      ((adler & 0xff00) << 8) |
      ((adler >>> 8) & 0xff00) |
      (adler >>> 24)) >>>
    0
  );
}

function firstElement(xml: Document, tag: string): Element | null {
  return xml.getElementsByTagName(tag)[0] || null;
}

function elementText(el: Element | null): string {
  return String(el?.textContent || "").trim();
}

function attrInt(el: Element | null, name: string, fallback = 0): number {
  if (!el) return fallback;
  const n = Number(el.getAttribute(name));
  return Number.isFinite(n) ? n : fallback;
}

function readProperties(xml: Document): Record<string, string> {
  const out: Record<string, string> = {};
  const root = xml.documentElement;
  if (!root) return out;
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const node = root.childNodes[i];
    if (node?.nodeType !== 1) continue;
    const el = node as Element;
    if (el.tagName !== "Properties") continue;
    const props = el.getElementsByTagName("Property");
    for (let j = 0; j < props.length; j += 1) {
      const p = props[j]!;
      const name = p.getAttribute("name");
      const value = p.getAttribute("value");
      if (name != null && value != null) out[name] = value;
    }
  }
  return out;
}

function parseFaces(
  data: Uint8Array,
  faceCount: number,
  vertexCount: number,
): Uint32Array {
  const errors: string[] = [];
  for (const mode of [16, 32] as IndexMode[]) {
    try {
      return parseFacesWithMode(data, faceCount, vertexCount, mode);
    } catch (e) {
      errors.push(`${mode}-bit: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    `HPS face decode failed.\n${errors.map((s) => `  - ${s}`).join("\n")}`,
  );
}

function parseFacesWithMode(
  data: Uint8Array,
  faceCount: number,
  vertexCount: number,
  mode: IndexMode,
): Uint32Array {
  const faces: number[] = [];
  let edgeList: Edge[] = [];
  let curEdge = 0;
  let globalVertexPtr = 0;
  const reader = new BinaryReader(data);

  const validate = (...indices: number[]) => {
    for (const v of indices) {
      if (v < 0 || v >= vertexCount) {
        throw new Error(
          `Vertex index ${v} out of bounds (0..${vertexCount - 1})`,
        );
      }
    }
  };

  const createRestart = (v0: number, v1: number, v2: number) => {
    faces.push(v0, v1, v2);
    edgeList = [
      { start: v0, end: v1 },
      { start: v1, end: v2 },
      { start: v2, end: v0 },
    ];
    curEdge = 0;
  };

  const extendEdge = (v: number) => {
    if (edgeList.length === 0) throw new Error("No edges to extend");
    const ce = edgeList[curEdge]!;
    faces.push(v, ce.end, ce.start);
    const e1 = { start: ce.start, end: v };
    const e2 = { start: v, end: ce.end };
    edgeList.splice(curEdge, 1, e1, e2);
    curEdge = (curEdge + 2) % edgeList.length;
  };

  const handlePrevious = () => {
    if (edgeList.length < 2) throw new Error("Previous needs ≥2 edges");
    const n = edgeList.length;
    const prevIdx = (curEdge - 1 + n) % n;
    const pe = edgeList[prevIdx]!;
    const ce = edgeList[curEdge]!;
    faces.push(ce.start, pe.start, ce.end);
    const newEdge = { start: pe.start, end: ce.end };
    const high = Math.max(curEdge, prevIdx);
    const low = Math.min(curEdge, prevIdx);
    edgeList.splice(high, 1);
    edgeList.splice(low, 1);
    edgeList.splice(low, 0, newEdge);
    curEdge = (low + 1) % edgeList.length;
  };

  const handleNext = () => {
    if (edgeList.length < 2) throw new Error("Next needs ≥2 edges");
    const nextIdx = (curEdge + 1) % edgeList.length;
    const ce = edgeList[curEdge]!;
    const ne = edgeList[nextIdx]!;
    faces.push(ce.start, ne.end, ce.end);
    const newEdge = { start: ce.start, end: ne.end };
    const high = Math.max(curEdge, nextIdx);
    const low = Math.min(curEdge, nextIdx);
    edgeList.splice(high, 1);
    edgeList.splice(low, 1);
    edgeList.splice(low, 0, newEdge);
    curEdge = (low + 1) % edgeList.length;
  };

  const removeCurrent = () => {
    if (edgeList.length === 0) throw new Error("Cannot remove: empty edges");
    const n = edgeList.length;
    const prevIdx = (curEdge - 1 + n) % n;
    const pe = edgeList[prevIdx]!;
    const ce = edgeList[curEdge]!;
    if (pe.start === ce.end && n > 2) {
      const high = Math.max(curEdge, prevIdx);
      const low = Math.min(curEdge, prevIdx);
      edgeList.splice(high, 1);
      edgeList.splice(low, 1);
      if (edgeList.length > 0) {
        const newPrev = (low - 1 + edgeList.length) % edgeList.length;
        const newCurr = low % edgeList.length;
        edgeList[newPrev]!.end = edgeList[newCurr]!.start;
        curEdge = newCurr;
      } else {
        curEdge = 0;
      }
    } else {
      pe.end = ce.end;
      edgeList.splice(curEdge, 1);
      curEdge = edgeList.length ? curEdge % edgeList.length : 0;
    }
  };

  while (!reader.isEof()) {
    const commandByte = reader.readUint8();
    if (commandByte >> 4 !== 0) {
      throw new Error("Upper 4 bits of face command must be zero");
    }
    const op = commandByte & 0x0f;
    switch (op) {
      case 0: {
        const v = globalVertexPtr;
        globalVertexPtr += 1;
        extendEdge(v);
        break;
      }
      case 1:
        handlePrevious();
        break;
      case 2:
        handleNext();
        break;
      case 3:
        curEdge = (curEdge + 1) % edgeList.length;
        break;
      case 4: {
        const v0 = globalVertexPtr;
        const v1 = globalVertexPtr + 1;
        const v2 = globalVertexPtr + 2;
        globalVertexPtr += 3;
        createRestart(v0, v1, v2);
        break;
      }
      case 5: {
        const v0 = mode === 32 ? reader.readUint32() : reader.readUint16();
        const v1 = mode === 32 ? reader.readUint32() : reader.readUint16();
        const v2 = mode === 32 ? reader.readUint32() : reader.readUint16();
        validate(v0, v1, v2);
        createRestart(v0, v1, v2);
        break;
      }
      case 6: {
        const v0 = reader.readUint32();
        const v1 = reader.readUint32();
        const v2 = reader.readUint32();
        validate(v0, v1, v2);
        createRestart(v0, v1, v2);
        break;
      }
      case 7: {
        const v = mode === 32 ? reader.readUint32() : reader.readUint16();
        validate(v);
        extendEdge(v);
        break;
      }
      case 8: {
        const v = reader.readUint32();
        validate(v);
        extendEdge(v);
        break;
      }
      case 9:
        removeCurrent();
        break;
      case 10:
        globalVertexPtr += 1;
        break;
      default:
        throw new Error(`Unknown face opcode ${op}`);
    }
  }

  if (faces.length / 3 !== faceCount) {
    throw new Error(
      `Face count mismatch: expected ${faceCount}, got ${faces.length / 3}`,
    );
  }
  return Uint32Array.from(faces);
}

function isZipBuffer(buf: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buf);
  return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b;
}

function looksLikeMedicalDicom(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 132) return false;
  const u8 = new Uint8Array(buf);
  return (
    u8[128] === 0x44 &&
    u8[129] === 0x49 &&
    u8[130] === 0x43 &&
    u8[131] === 0x4d
  );
}

async function extractHpsXmlText(buffer: ArrayBuffer): Promise<string> {
  if (looksLikeMedicalDicom(buffer)) {
    throw new Error("의료 DICOM(.dcm)은 메시 프리뷰를 지원하지 않습니다.");
  }

  if (isZipBuffer(buffer)) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    const preferred =
      names.find((n) => /\.(hps|xml|dcm)$/i.test(n) && !zip.files[n]!.dir) ||
      names.find((n) => !zip.files[n]!.dir);
    if (!preferred) throw new Error("ZIP DCM 안에 HPS 데이터가 없습니다.");
    const text = await zip.files[preferred]!.async("string");
    if (!/<HPS[\s>]/i.test(text)) {
      throw new Error("ZIP DCM에서 HPS XML을 찾지 못했습니다.");
    }
    return text;
  }

  const text = new TextDecoder().decode(buffer);
  if (!/<HPS[\s>]/i.test(text)) {
    throw new Error("3Shape HPS DCM이 아닙니다.");
  }
  return text;
}

const OUTSIDE_RANGE_BIT = 0x8000;
const COORD_MASK = 0x7fff;
const SCALE_INSIDE = 1 / 32767;
const SCALE_OUTSIDE = 512 / 32767;
const NO_UV_MARKER = 0xffffffff;

/** Encrypted HPS blob (CE). Key attr → scramble. */
type EncryptedBlob = {
  data: Uint8Array;
  originalSize: number;
  scramble: boolean;
};

export type HpsDcmMeshData = {
  positions: Float32Array;
  indices: Uint32Array;
  /** Per-vertex RGB 0..255. null이면 무색. */
  colors: Uint8Array | null;
};

function attrIntOptional(el: Element | null, name: string): number | null {
  if (!el) return null;
  const raw = el.getAttribute(name);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function packedRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function fillUniformColors(
  count: number,
  rgb: [number, number, number],
): Uint8Array {
  const out = new Uint8Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }
  return out;
}

function readEncryptedOrPlain(
  el: Element | null,
  encrypted: boolean,
): EncryptedBlob | Uint8Array | null {
  if (!el) return null;
  const data = decodeBase64(elementText(el));
  if (!data.length) return null;
  if (!encrypted) return data;
  const sizeAttr =
    el.getAttribute("Base64EncodedBytes") ||
    el.getAttribute("base64_encoded_bytes");
  const originalSize = sizeAttr != null ? Number(sizeAttr) : 0;
  return {
    data,
    originalSize: Number.isFinite(originalSize) && originalSize > 0 ? originalSize : 0,
    scramble: el.getAttribute("Key") != null,
  };
}

function resolveCeBytes(
  blob: EncryptedBlob | Uint8Array | null,
  properties: Record<string, string>,
): Uint8Array | null {
  if (!blob) return null;
  if (blob instanceof Uint8Array) return blob;
  const key = buildCeKey(properties, blob.scramble);
  return decryptCeBuffer(blob.data, key, blob.originalSize);
}

function decompressUvComponent(bits: number): number {
  const value = bits & COORD_MASK;
  if (bits & OUTSIDE_RANGE_BIT) return value * SCALE_OUTSIDE - 256;
  return value * SCALE_INSIDE;
}

function decompressTextureCoord(compressed: number): [number, number] {
  const u = decompressUvComponent(compressed & 0xffff);
  const v = decompressUvComponent((compressed >>> 16) & 0xffff);
  return [u, v];
}

/**
 * Per-vertex UV stream → per-corner UVs (faceCount*3, 2).
 * Adapted from hpsdecode.parse_texture_coords (MIT).
 */
function parseTextureCoords(
  data: Uint8Array,
  vertexCount: number,
  indices: Uint32Array,
): Float32Array {
  const faceCount = indices.length / 3;
  const vertexCorners: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let corner = 0; corner < indices.length; corner += 1) {
    const v = indices[corner]!;
    vertexCorners[v]!.push(corner);
  }

  const uvs = new Float32Array(faceCount * 3 * 2);
  const reader = new BinaryReader(data);

  for (let vertexIdx = 0; vertexIdx < vertexCount; vertexIdx += 1) {
    if (reader.isEof()) {
      throw new Error(
        `Unexpected end of texture UV at vertex ${vertexIdx}/${vertexCount}`,
      );
    }
    const flag = reader.readUint8();
    const corners = vertexCorners[vertexIdx]!;

    const writeUv = (cornerIdx: number, u: number, v: number) => {
      const o = cornerIdx * 2;
      uvs[o] = u;
      uvs[o + 1] = v;
    };

    if (flag === 1) {
      const compressed = reader.readUint32();
      if (compressed !== NO_UV_MARKER) {
        const [u, v] = decompressTextureCoord(compressed);
        for (const cornerIdx of corners) writeUv(cornerIdx, u, v);
      }
    } else {
      if (flag !== 0xff && flag !== corners.length) {
        throw new Error(
          `UV flag mismatch at vertex ${vertexIdx}: flag=${flag}, corners=${corners.length}`,
        );
      }
      const sorted = [...corners].sort((a, b) => Math.floor(a / 3) - Math.floor(b / 3));
      for (const cornerIdx of sorted) {
        const compressed = reader.readUint32();
        if (compressed !== NO_UV_MARKER) {
          const [u, v] = decompressTextureCoord(compressed);
          writeUv(cornerIdx, u, v);
        }
      }
    }
  }

  return uvs;
}

function parseVertexColorBytes(
  data: Uint8Array,
  vertexCount: number,
): Uint8Array | null {
  if (vertexCount <= 0 || data.length < vertexCount * 3) return null;
  const bpp = Math.floor(data.length / vertexCount);
  if (bpp === 3) return data.subarray(0, vertexCount * 3);
  if (bpp === 4) {
    const out = new Uint8Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
      out[i * 3] = data[i * 4]!;
      out[i * 3 + 1] = data[i * 4 + 1]!;
      out[i * 3 + 2] = data[i * 4 + 2]!;
    }
    return out;
  }
  return null;
}

async function decodeJpegRgb(
  jpegBytes: Uint8Array,
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const copy = new Uint8Array(jpegBytes.byteLength);
  copy.set(jpegBytes);
  const blob = new Blob([copy.buffer], { type: "image/jpeg" });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable for DCM texture");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      rgba: imageData.data,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Texture UV + JPEG → per-vertex RGB (corner samples averaged).
 * Adapted from hpsdecode.texture_to_vertex_colors (MIT).
 */
async function bakeTextureToVertexColors(
  indices: Uint32Array,
  cornerUvs: Float32Array,
  jpegBytes: Uint8Array,
  vertexCount: number,
): Promise<Uint8Array> {
  const { width, height, rgba } = await decodeJpegRgb(jpegBytes);
  const sums = new Float32Array(vertexCount * 3);
  const counts = new Uint32Array(vertexCount);

  for (let corner = 0; corner < indices.length; corner += 1) {
    const vIdx = indices[corner]!;
    const u = cornerUvs[corner * 2]!;
    const v = cornerUvs[corner * 2 + 1]!;
    const x = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
    // HPS UV는 상단 원점 JPEG과 맞춤(hpsdecode와 동일, V flip 없음).
    const y = Math.min(height - 1, Math.max(0, Math.round(v * (height - 1))));
    const p = (y * width + x) * 4;
    const o = vIdx * 3;
    sums[o] += rgba[p]!;
    sums[o + 1] += rgba[p + 1]!;
    sums[o + 2] += rgba[p + 2]!;
    counts[vIdx]! += 1;
  }

  const out = new Uint8Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const c = counts[i]!;
    const o = i * 3;
    if (c > 0) {
      out[o] = Math.round(sums[o]! / c);
      out[o + 1] = Math.round(sums[o + 1]! / c);
      out[o + 2] = Math.round(sums[o + 2]! / c);
    } else {
      out[o] = 128;
      out[o + 1] = 128;
      out[o + 2] = 128;
    }
  }
  return out;
}

function faceTintToVertexColors(
  indices: Uint32Array,
  faceRgb: [number, number, number],
  vertexCount: number,
): Uint8Array {
  // Mesh-wide Facets/@color — same tint on every vertex.
  void indices;
  return fillUniformColors(vertexCount, faceRgb);
}

function collectTextureImages(
  xml: Document,
  schema: string,
  properties: Record<string, string>,
): Uint8Array[] {
  const isCe = schema === "CE";
  const out: Uint8Array[] = [];
  const seen = new Set<Element>();

  const pushResolved = (el: Element, encryptable: boolean) => {
    if (seen.has(el)) return;
    seen.add(el);
    const raw = readEncryptedOrPlain(el, isCe && encryptable);
    const resolved = resolveCeBytes(raw, properties);
    if (resolved && resolved.length > 0) out.push(resolved);
  };

  // CE: AdditionalTextureImage / PartialTextureData는 암호화 가능.
  for (const el of Array.from(
    xml.querySelectorAll(
      "TextureData2 > TextureImages > AdditionalTextureImage, TextureData > TextureImages > AdditionalTextureImage, PartialTextureData > TextureImages > TextureImage",
    ),
  )) {
    pushResolved(el, true);
  }
  // TextureImages/TextureImage (TRIOS TextureData2)는 JPEG 평문.
  for (const el of Array.from(xml.querySelectorAll("TextureImages > TextureImage"))) {
    pushResolved(el, false);
  }

  return out;
}

async function resolveVertexColors(options: {
  xml: Document;
  schema: string;
  properties: Record<string, string>;
  indices: Uint32Array;
  vertexCount: number;
  verticesEl: Element;
  facetsEl: Element;
}): Promise<Uint8Array | null> {
  const {
    xml,
    schema,
    properties,
    indices,
    vertexCount,
    verticesEl,
    facetsEl,
  } = options;
  const isCe = schema === "CE";

  const texCoordEl = xml.getElementsByTagName("PerVertexTextureCoord")[0] || null;
  const texCoordRaw = readEncryptedOrPlain(texCoordEl, isCe);
  const texCoordBytes = resolveCeBytes(texCoordRaw, properties);
  const textureImages = collectTextureImages(xml, schema, properties);

  if (texCoordBytes && textureImages.length > 0) {
    try {
      const cornerUvs = parseTextureCoords(texCoordBytes, vertexCount, indices);
      return await bakeTextureToVertexColors(
        indices,
        cornerUvs,
        textureImages[0]!,
        vertexCount,
      );
    } catch (err) {
      console.warn("[hpsDcm] texture bake failed; falling back", err);
    }
  }

  const vColorEl =
    xml.querySelector("VertexColorSets > VertexColorSet") ||
    xml.getElementsByTagName("VertexColorSet")[0] ||
    null;
  const vColorRaw = readEncryptedOrPlain(vColorEl, isCe);
  const vColorBytes = resolveCeBytes(vColorRaw, properties);
  if (vColorBytes) {
    const parsed = parseVertexColorBytes(vColorBytes, vertexCount);
    if (parsed) return parsed;
  }

  const vertexTint = attrIntOptional(verticesEl, "color");
  if (vertexTint != null) {
    return fillUniformColors(vertexCount, packedRgb(vertexTint >>> 0));
  }

  const faceTint = attrIntOptional(facetsEl, "color");
  if (faceTint != null) {
    return faceTintToVertexColors(indices, packedRgb(faceTint >>> 0), vertexCount);
  }

  return null;
}

function colorsToThreeAttribute(colors: Uint8Array): THREE.BufferAttribute {
  const count = colors.length / 3;
  const arr = new Float32Array(count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    tmp.setRGB(
      colors[i * 3]! / 255,
      colors[i * 3 + 1]! / 255,
      colors[i * 3 + 2]! / 255,
      THREE.SRGBColorSpace,
    );
    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }
  return new THREE.BufferAttribute(arr, 3);
}

/**
 * 3Shape/TRIOS HPS DCM → positions/indices/vertex colors.
 * CE Blowfish. 칼라 우선순위: Texture bake → VertexColorSet → Vertices/@color → Facets/@color.
 */
export async function parseHpsDcmMeshData(
  buffer: ArrayBuffer,
): Promise<HpsDcmMeshData> {
  const xmlText = await extractHpsXmlText(buffer);
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error("HPS XML 파싱에 실패했습니다.");
  }

  const schema = elementText(firstElement(xml, "Schema")).toUpperCase();
  if (!SUPPORTED_SCHEMAS.has(schema)) {
    throw new Error(`지원하지 않는 HPS 스키마: ${schema || "(없음)"}`);
  }

  const verticesEl = firstElement(xml, "Vertices");
  const facetsEl = firstElement(xml, "Facets");
  if (!verticesEl || !facetsEl) {
    throw new Error("HPS Vertices/Facets가 없습니다.");
  }

  const vertexCount = attrInt(verticesEl, "vertex_count");
  const faceCount = attrInt(facetsEl, "facet_count");
  if (vertexCount <= 0 || faceCount <= 0) {
    throw new Error("HPS vertex/face count가 올바르지 않습니다.");
  }

  const properties = readProperties(xml);
  let vertexBytes = decodeBase64(elementText(verticesEl));
  const faceBytes = decodeBase64(elementText(facetsEl));
  const expectedVertexBytes = vertexCount * 3 * 4;

  if (schema === "CE") {
    const key = buildCeKey(properties, false);
    vertexBytes = decryptCeBuffer(vertexBytes, key, expectedVertexBytes);
    const checkRaw = verticesEl.getAttribute("check_value");
    if (checkRaw) {
      const expected = Number(checkRaw) >>> 0;
      const got = adler32Swapped(vertexBytes);
      if (expected !== got) {
        throw new Error("HPS CE 무결성 검사 실패(복호화 키 불일치).");
      }
    }
  } else if (vertexBytes.byteLength < expectedVertexBytes) {
    throw new Error("HPS vertex 버퍼가 너무 짧습니다.");
  } else if (vertexBytes.byteLength > expectedVertexBytes) {
    vertexBytes = vertexBytes.subarray(0, expectedVertexBytes);
  }

  const positions = new Float32Array(vertexCount * 3);
  positions.set(
    new Float32Array(
      vertexBytes.buffer,
      vertexBytes.byteOffset,
      vertexCount * 3,
    ),
  );
  const indices = parseFaces(faceBytes, faceCount, vertexCount);
  const colors = await resolveVertexColors({
    xml,
    schema,
    properties,
    indices,
    vertexCount,
    verticesEl,
    facetsEl,
  });

  return { positions, indices, colors };
}

/** 3Shape/TRIOS HPS DCM → indexed BufferGeometry (+ vertex colors when present). */
export async function parseHpsDcmGeometry(
  buffer: ArrayBuffer,
): Promise<THREE.BufferGeometry> {
  const mesh = await parseHpsDcmMeshData(buffer);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (mesh.colors) {
    geometry.setAttribute("color", colorsToThreeAttribute(mesh.colors));
  }
  geometry.computeVertexNormals();
  return geometry;
}
