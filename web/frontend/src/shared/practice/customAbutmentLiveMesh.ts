// 재생성·후보 선택의 메시를 상대 창에 그대로 넘긴다.
// 좌표는 bbox 기준 uint16이라 실수 배열 JSON보다 작다.

export const ABUTMENT_VARIANT_IDS = [
  "space_fill",
  "strict_subg",
  "space_moderate",
  "keep_subg_no_supra",
  "fixture_axis",
  "buccal_top_open",
  "buccal_shift",
] as const;

export type AbutmentVariantId = (typeof ABUTMENT_VARIANT_IDS)[number];

const VARIANT_SET = new Set<string>(ABUTMENT_VARIANT_IDS);
const QUANT_MAX = 65534;
const LIVE_MESH_BYTE_BUDGET = 6_000_000;

export type PackedPositions = {
  origin: [number, number, number];
  scale: number;
  count: number;
  bytes: Uint8Array;
};

export type LiveMeshItem = {
  id: AbutmentVariantId;
  label: string;
  params: Record<string, number>;
  metrics: Record<string, number>;
  abutment: PackedPositions;
  crown: PackedPositions;
  margin: PackedPositions;
  solid?: PackedPositions;
  enamel?: PackedPositions;
};

export function isOwnAbutmentLiveEcho(raw: unknown, socketId: string, userId: string): boolean {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as { originSocketId?: unknown; updatedBy?: unknown };
  const origin = String(row.originSocketId || "");
  const updatedBy = String(row.updatedBy || "");
  if (origin) {
    if (!socketId) return Boolean(updatedBy && userId && updatedBy === userId);
    return origin === socketId;
  }
  return Boolean(updatedBy && userId && updatedBy === userId);
}

export function isAbutmentVariantId(raw: unknown): raw is AbutmentVariantId {
  return typeof raw === "string" && VARIANT_SET.has(raw);
}

export function finiteNumberMap(raw: unknown, maxKeys = 48): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= maxKeys) break;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function packPositions(src: ArrayLike<number> | null | undefined): PackedPositions | null {
  if (!src || src.length < 3 || src.length % 3 !== 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < src.length; i += 3) {
    const x = Number(src[i]);
    const y = Number(src[i + 1]);
    const z = Number(src[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = span / QUANT_MAX;
  const count = src.length / 3;
  if (count > 400_000) return null;
  const bytes = new Uint8Array(count * 6);
  const view = new DataView(bytes.buffer);
  for (let p = 0, o = 0; p < src.length; p += 3, o += 6) {
    const qx = Math.max(0, Math.min(QUANT_MAX, Math.round((Number(src[p]) - minX) / scale)));
    const qy = Math.max(0, Math.min(QUANT_MAX, Math.round((Number(src[p + 1]) - minY) / scale)));
    const qz = Math.max(0, Math.min(QUANT_MAX, Math.round((Number(src[p + 2]) - minZ) / scale)));
    view.setUint16(o, qx, true);
    view.setUint16(o + 2, qy, true);
    view.setUint16(o + 4, qz, true);
  }
  return {
    origin: [minX, minY, minZ],
    scale,
    count,
    bytes,
  };
}

export function asUint8(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (
    raw &&
    typeof raw === "object" &&
    (raw as { type?: unknown }).type === "Buffer" &&
    Array.isArray((raw as { data?: unknown }).data)
  ) {
    return Uint8Array.from((raw as { data: number[] }).data);
  }
  return null;
}

export function unpackPositions(raw: unknown): Float32Array | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    origin?: unknown;
    scale?: unknown;
    count?: unknown;
    bytes?: unknown;
  };
  const origin = Array.isArray(row.origin) ? row.origin : null;
  const scale = Number(row.scale);
  const count = Number(row.count);
  const bytes = asUint8(row.bytes);
  if (!origin || origin.length < 3) return null;
  const ox = Number(origin[0]);
  const oy = Number(origin[1]);
  const oz = Number(origin[2]);
  if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) return null;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 100) return null;
  if (!Number.isInteger(count) || count < 1 || count > 400_000) return null;
  if (!bytes || bytes.byteLength !== count * 6) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(count * 3);
  for (let i = 0, o = 0; i < count; i += 1, o += 6) {
    out[i * 3] = ox + view.getUint16(o, true) * scale;
    out[i * 3 + 1] = oy + view.getUint16(o + 2, true) * scale;
    out[i * 3 + 2] = oz + view.getUint16(o + 4, true) * scale;
  }
  return out;
}

function partBytes(part: PackedPositions | undefined): number {
  return part?.bytes.byteLength ?? 0;
}

function itemBytes(item: LiveMeshItem, withOptional: boolean): number {
  return (
    partBytes(item.abutment) +
    partBytes(item.crown) +
    partBytes(item.margin) +
    (withOptional ? partBytes(item.solid) + partBytes(item.enamel) : 0)
  );
}

export function packLiveMeshItem(
  id: string,
  label: string,
  design: {
    params: object;
    metrics: object;
    localPositions: ArrayLike<number>;
    crownLocalPositions: ArrayLike<number>;
    marginLoopLocal: ArrayLike<number>;
    solidBodyLocalPositions?: ArrayLike<number> | null;
    enameloplastyLocalPositions?: ArrayLike<number> | null;
  },
): LiveMeshItem | null {
  if (!isAbutmentVariantId(id)) return null;
  const abutment = packPositions(design.localPositions);
  const crown = packPositions(design.crownLocalPositions);
  const margin = packPositions(design.marginLoopLocal);
  if (!abutment || !crown || !margin) return null;
  const solid = packPositions(design.solidBodyLocalPositions);
  const enamel = packPositions(design.enameloplastyLocalPositions);
  return {
    id,
    label: label.slice(0, 80),
    params: finiteNumberMap(design.params),
    metrics: finiteNumberMap(design.metrics),
    abutment,
    crown,
    margin,
    ...(solid ? { solid } : {}),
    ...(enamel ? { enamel } : {}),
  };
}

/** 한도를 넘으면 솔리드·삭제 패치를 빼고, 그래도 크면 활성 후보만 남긴다. */
export function fitLiveMeshItems(
  items: readonly LiveMeshItem[],
  activeIndex: number,
): { items: LiveMeshItem[]; complete: boolean } | null {
  if (items.length === 0) return null;
  const full = items.reduce((sum, item) => sum + itemBytes(item, true), 0);
  if (full <= LIVE_MESH_BYTE_BUDGET) return { items: [...items], complete: true };
  const slim = items.map((item) => {
    const next = { ...item };
    delete next.solid;
    delete next.enamel;
    return next;
  });
  const slimBytes = slim.reduce((sum, item) => sum + itemBytes(item, false), 0);
  if (slimBytes <= LIVE_MESH_BYTE_BUDGET) return { items: slim, complete: true };
  const active = slim[Math.min(Math.max(activeIndex, 0), slim.length - 1)];
  if (!active || itemBytes(active, false) > LIVE_MESH_BYTE_BUDGET) return null;
  return { items: [active], complete: false };
}
