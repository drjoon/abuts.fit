// 작업 파일 3D 프리뷰 페인트(표시) 메타데이터. 파일은 그대로 두고 production.workFilePaint만 남긴다.
// 지금 케이스 3D 키 집합과 같을 때만 유효하다. 스캔·어벗·보철을 다시 올리면 버린다.
// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferWorkFilePaint.controller.js
// - web/frontend/src/shared/practice/workFilePaint.ts
import { sameKeySet } from "./workScanAlignment.js";

const MODEL_NAME_RE = /\.(stl|ply|obj|dcm)$/i;
const KINDS = new Set(["pen", "arrow", "rect", "ellipse", "dot", "text"]);
const MAX_SHAPES = 200;
const MAX_PEN_POINTS = 2000;
const MAX_TEXT = 200;
const MAX_BYTES = 400 * 1024;

const round = (value, fallback = null) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 1e5) / 1e5;
};

const vec3 = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const x = round(raw.x);
  const y = round(raw.y);
  const z = round(raw.z);
  if (x == null || y == null || z == null) return null;
  return { x, y, z };
};

const screen = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const x = round(raw.x);
  const y = round(raw.y);
  if (x == null || y == null) return null;
  return { x, y };
};

const pose = (raw) => {
  if (!raw || typeof raw !== "object") return undefined;
  const origin = vec3(raw.origin);
  const normal = vec3(raw.normal);
  const axisU = vec3(raw.axisU);
  const axisV = vec3(raw.axisV);
  if (!origin || !normal || !axisU || !axisV) return undefined;
  return { origin, normal, axisU, axisV };
};

const ink = (raw) => {
  if (!raw || typeof raw !== "object") return undefined;
  const px = round(raw.px);
  const lift = round(raw.lift, 0);
  if (px == null || px <= 0) return undefined;
  return { px, lift: lift ?? 0 };
};

const modelKeysFromRows = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => MODEL_NAME_RE.test(String(row?.file?.originalName || row?.fileName || "")))
    .map((row) => String(row?.file?.s3Key || row?.s3Key || "").trim())
    .filter(Boolean);

export function workFilePaintFileKeys(transfer) {
  const keys = [
    ...modelKeysFromRows(transfer?.files),
    ...modelKeysFromRows(transfer?.production?.labWorkScanFiles),
    ...modelKeysFromRows(transfer?.production?.designFiles),
    ...modelKeysFromRows(transfer?.resultFiles),
  ];
  return [...new Set(keys)].sort();
}

export function sameWorkFilePaintKeys(a, b) {
  return sameKeySet(a, b);
}

function sanitizeShape(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind || "").trim();
  if (!KINDS.has(kind)) return null;
  const color = String(raw.color || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  const width = round(raw.width, 4);
  if (width == null || width <= 0) return null;
  const nextPose = pose(raw.pose);
  const nextInk = ink(raw.ink);
  const base = { kind, color, width };
  if (nextPose) base.pose = nextPose;
  if (nextInk) base.ink = nextInk;

  if (kind === "pen") {
    const points = (Array.isArray(raw.points) ? raw.points : [])
      .slice(0, MAX_PEN_POINTS)
      .map(screen)
      .filter(Boolean);
    if (points.length === 0) return null;
    const samples = (Array.isArray(raw.samples) ? raw.samples : [])
      .slice(0, MAX_PEN_POINTS)
      .map((sample) => {
        const u = round(sample?.u);
        const v = round(sample?.v);
        const lift = round(sample?.lift, 0);
        if (u == null || v == null) return null;
        return { u, v, lift: lift ?? 0 };
      })
      .filter(Boolean);
    return { ...base, points, ...(samples.length ? { samples } : {}) };
  }

  if (kind === "dot") {
    const at = screen(raw.at);
    if (!at) return null;
    const au = round(raw.au, 0);
    const av = round(raw.av, 0);
    const radius = round(raw.radius);
    return {
      ...base,
      at,
      au: au ?? 0,
      av: av ?? 0,
      ...(radius != null && radius > 0 ? { radius } : {}),
    };
  }

  if (kind === "text") {
    const at = screen(raw.at);
    const text = String(raw.text || "").trim().slice(0, MAX_TEXT);
    if (!at || !text) return null;
    const au = round(raw.au, 0);
    const av = round(raw.av, 0);
    const scale = round(raw.scale, 1);
    return {
      ...base,
      at,
      text,
      au: au ?? 0,
      av: av ?? 0,
      scale: scale != null && scale > 0 ? scale : 1,
    };
  }

  const from = screen(raw.from);
  const to = screen(raw.to);
  if (!from || !to) return null;
  const au = round(raw.au, 0);
  const av = round(raw.av, 0);
  const bu = round(raw.bu, 0);
  const bv = round(raw.bv, 0);
  return {
    ...base,
    from,
    to,
    au: au ?? 0,
    av: av ?? 0,
    bu: bu ?? 0,
    bv: bv ?? 0,
  };
}

export function sanitizeWorkFilePaintShapes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (out.length >= MAX_SHAPES) break;
    const shape = sanitizeShape(row);
    if (shape) out.push(shape);
  }
  return out;
}

const tuple3 = (raw) => {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = round(raw[0]);
  const y = round(raw[1]);
  const z = round(raw[2]);
  if (x == null || y == null || z == null) return null;
  return [x, y, z];
};

/** 원근 카메라 자세. position·target·up. */
export function sanitizeWorkFilePaintView(raw) {
  if (!raw || typeof raw !== "object") return null;
  const position = tuple3(raw.position);
  const target = tuple3(raw.target);
  const up = tuple3(raw.up);
  if (!position || !target || !up) return null;
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  if (dx * dx + dy * dy + dz * dz < 1e-12) return null;
  if (up[0] * up[0] + up[1] * up[1] + up[2] * up[2] < 1e-12) return null;
  return { position, target, up };
}

export function workFilePaintByteLength(payload) {
  return Buffer.byteLength(JSON.stringify(payload || {}), "utf8");
}

export function assertWorkFilePaintSize(payload) {
  if (workFilePaintByteLength(payload) > MAX_BYTES) {
    const error = new Error("페인트 표시가 너무 많습니다.");
    error.code = "too_large";
    throw error;
  }
}

/** 지금 3D 키와 맞는 기록만. */
export function currentWorkFilePaint(transfer) {
  const stored = transfer?.production?.workFilePaint;
  if (!stored || typeof stored !== "object") return null;
  const keys = workFilePaintFileKeys(transfer);
  if (keys.length === 0 || !sameKeySet(stored.fileKeys, keys)) return null;
  const shapes = sanitizeWorkFilePaintShapes(stored.shapes);
  const view = sanitizeWorkFilePaintView(stored.view);
  return { fileKeys: keys, shapes, view };
}

export function toWorkFilePaintApi(transfer) {
  const fileKeys = workFilePaintFileKeys(transfer);
  const current = currentWorkFilePaint(transfer);
  return {
    fileKeys,
    shapes: current?.shapes || [],
    view: current?.view || null,
  };
}

export { MAX_BYTES as WORK_FILE_PAINT_MAX_BYTES };
