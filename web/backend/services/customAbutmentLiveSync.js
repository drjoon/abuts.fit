// 커스텀어벗 디자인 화면을 저장보다 먼저 상대에게 넘긴다.
// 카메라·표시·검볼은 초당 수십 번이라 DB를 기다리지 않는다.
import { Types } from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import User from "../models/user.model.js";
import {
  sanitizeAbutmentChoice,
  sanitizeSharedDesignView,
  toDesignSyncMeta,
  ABUTMENT_VARIANT_IDS,
} from "./customAbutmentDesignSync.js";

const VARIANT_SET = new Set(ABUTMENT_VARIANT_IDS);
const MESH_BYTE_BUDGET = 6_000_000;

const PARTY_TTL_MS = 45_000;
const MAX_PARTY = 200;
const MAX_VIEW_PER_SEC = 12;
const MAX_CTRL_PER_SEC = 20;
const MAX_BYTES = 120_000;
const partyCache = new Map();
const rateBySocket = new Map();

function finite(raw, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 1000) / 1000;
}

function toothKey(raw) {
  const tooth = String(raw || "").trim();
  return /^[1-4][1-8]$/.test(tooth) ? tooth : "";
}

function toothMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!toothKey(key) || Object.keys(out).length >= 32) continue;
    if (value === true || value === false) out[key] = value;
  }
  return out;
}

function sanitizeChrome(raw) {
  if (!raw || typeof raw !== "object") return null;
  const transparency = finite(raw.scanTransparency, 0, 90);
  const guide = raw.centerGuide === "center" || raw.centerGuide === "grid" ? raw.centerGuide : "off";
  const selected = Array.isArray(raw.selectedTeeth)
    ? raw.selectedTeeth.map(toothKey).filter(Boolean).slice(0, 16)
    : [];
  return {
    showUpper: raw.showUpper !== false,
    showLower: raw.showLower !== false,
    scanTransparency: transparency == null ? 0 : transparency,
    showFinishLine: raw.showFinishLine !== false,
    showFixtureAnalog: raw.showFixtureAnalog !== false,
    gumballOn: raw.gumballOn !== false,
    colorMapping: raw.colorMapping !== false,
    centerGuide: guide,
    selectedTeeth: selected,
    visibleTeeth: toothMap(raw.visibleTeeth),
    shownScanbodies: toothMap(raw.shownScanbodies),
    shownPredictedCrowns: toothMap(raw.shownPredictedCrowns),
    expandedTeeth: toothMap(raw.expandedTeeth),
  };
}

function sanitizeEdit(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const heightMm = finite(raw.heightMm, -20, 20);
  const shiftLabialMm = finite(raw.shiftLabialMm, -15, 15);
  const shiftMesialMm = finite(raw.shiftMesialMm, -15, 15);
  const yawDeg = finite(raw.yawDeg, -180, 180);
  const tiltLabialDeg = finite(raw.tiltLabialDeg, -45, 45);
  const tiltMesialDeg = finite(raw.tiltMesialDeg, -45, 45);
  const scale = Array.isArray(raw.scale) ? raw.scale : [];
  const sx = finite(scale[0], 0.2, 3);
  const sy = finite(scale[1], 0.2, 3);
  const sz = finite(scale[2], 0.2, 3);
  if (
    heightMm == null ||
    shiftLabialMm == null ||
    shiftMesialMm == null ||
    yawDeg == null ||
    tiltLabialDeg == null ||
    tiltMesialDeg == null ||
    sx == null ||
    sy == null ||
    sz == null
  ) {
    return undefined;
  }
  const partial = [];
  if (Array.isArray(raw.partial)) {
    for (const row of raw.partial) {
      if (partial.length >= 24 || !row || typeof row !== "object") continue;
      const z = finite(row.z, -5, 30);
      const angle = finite(row.angle, -7, 7);
      const reach = finite(row.reach, 0, 12);
      const grow = finite(row.grow, -5, 5);
      if (z == null || angle == null || reach == null || grow == null) continue;
      partial.push({ z, angle, reach, grow });
    }
  }
  return {
    heightMm,
    shiftLabialMm,
    shiftMesialMm,
    yawDeg,
    tiltLabialDeg,
    tiltMesialDeg,
    scale: [sx, sy, sz],
    partial,
  };
}

function asBytes(raw) {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  return null;
}

function finiteExact(raw, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function vec3(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const value = finiteExact(raw[i], -1e5, 1e5);
    if (value == null) return null;
    out.push(value);
  }
  return out;
}

function numberMapLimited(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 48) break;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

function meshPart(raw) {
  if (!raw || typeof raw !== "object") return null;
  const origin = vec3(raw.origin);
  const scale = finiteExact(raw.scale, 1e-8, 100);
  const count = Number(raw.count);
  const bytes = asBytes(raw.bytes);
  if (!origin || scale == null) return null;
  if (!Number.isInteger(count) || count < 1 || count > 400_000) return null;
  if (!bytes || bytes.length !== count * 6) return null;
  return { origin, scale, count, bytes };
}

/** 재생성된 어벗 메시. 조정값 JSON 한도와 따로 검사한다. */
export function sanitizeLiveMesh(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tooth = toothKey(raw.tooth);
  if (!tooth || !Array.isArray(raw.items) || raw.items.length === 0) return null;
  const items = [];
  let total = 0;
  for (const item of raw.items) {
    if (items.length >= 3 || !item || typeof item !== "object") continue;
    const id = VARIANT_SET.has(String(item.id || "")) ? String(item.id) : "";
    const abutment = meshPart(item.abutment);
    const crown = meshPart(item.crown);
    const margin = meshPart(item.margin);
    if (!id || !abutment || !crown || !margin) continue;
    const solid = meshPart(item.solid);
    const enamel = meshPart(item.enamel);
    const bytes =
      abutment.bytes.length +
      crown.bytes.length +
      margin.bytes.length +
      (solid ? solid.bytes.length : 0) +
      (enamel ? enamel.bytes.length : 0);
    if (total + bytes > MESH_BYTE_BUDGET) break;
    total += bytes;
    items.push({
      id,
      label: String(item.label || "").trim().slice(0, 80),
      params: numberMapLimited(item.params),
      metrics: numberMapLimited(item.metrics),
      abutment,
      crown,
      margin,
      ...(solid ? { solid } : {}),
      ...(enamel ? { enamel } : {}),
    });
  }
  if (items.length === 0) return null;
  const choice = sanitizeAbutmentChoice({
    variantId: raw.variantId,
    picker: raw.picker,
    candidates: items.map((item) => ({ id: item.id, label: item.label })),
    candidateIndex: raw.candidateIndex,
  });
  return {
    tooth,
    complete: raw.complete === true && items.length === raw.items.length,
    items,
    ...choice,
  };
}

function sanitizeAction(raw) {
  const op = raw?.op === "regen" || raw?.op === "candidate" || raw?.op === "confirm" ? raw.op : "";
  if (!op) return null;
  const tooth = toothKey(raw.tooth);
  const teeth = Array.isArray(raw.teeth)
    ? raw.teeth.map((row) => toothKey(row)).filter(Boolean).slice(0, 16)
    : [];
  if (op === "regen" && teeth.length === 0) return null;
  if (op !== "regen" && !tooth) return null;
  let index = null;
  if (op === "candidate") {
    if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index > 2) return null;
    index = raw.index;
  }
  return { op, tooth, teeth, ...(index != null ? { index } : {}) };
}

export function forgetCustomAbutmentLive(socketId) {
  rateBySocket.delete(socketId);
}

/** 뷰는 초당 12회로 낮춘다. 재생성·검볼·표시는 따로 센다. */
export function allowCustomAbutmentLive(socketId, kind) {
  const now = Date.now();
  let row = rateBySocket.get(socketId);
  if (!row || now - row.at >= 1000) {
    row = { at: now, view: 0, ctrl: 0 };
    rateBySocket.set(socketId, row);
  }
  if (kind === "view") {
    row.view += 1;
    return row.view <= MAX_VIEW_PER_SEC;
  }
  row.ctrl += 1;
  return row.ctrl <= MAX_CTRL_PER_SEC;
}

async function partyUserIds(transfer) {
  const anchorIds = [
    String(transfer?.practiceBusinessAnchorId || "").trim(),
    String(transfer?.targetLabAnchorId || "").trim(),
    String(transfer?.assigneeLabAnchorId || "").trim(),
  ].filter((id) => Types.ObjectId.isValid(id));
  const userIdSet = new Set();
  if (transfer?.practiceUserId && Types.ObjectId.isValid(String(transfer.practiceUserId))) {
    userIdSet.add(String(transfer.practiceUserId));
  }
  if (anchorIds.length > 0) {
    const peers = await User.find({
      businessAnchorId: { $in: anchorIds.map((id) => new Types.ObjectId(id)) },
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    for (const peer of peers) {
      if (peer?._id) userIdSet.add(String(peer._id));
    }
  }
  return [...userIdSet];
}

async function peersFor(userId, role, transferId) {
  const now = Date.now();
  let cached = partyCache.get(transferId);
  if (!cached || now - cached.at >= PARTY_TTL_MS) {
    const transfer = await PracticeTransfer.findOne({ transferId })
      .select({
        practiceUserId: 1,
        practiceBusinessAnchorId: 1,
        targetLabAnchorId: 1,
        assigneeLabAnchorId: 1,
      })
      .lean();
    if (!transfer) return null;
    cached = { at: now, peers: await partyUserIds(transfer) };
    if (partyCache.size >= MAX_PARTY) {
      const oldest = partyCache.keys().next().value;
      if (oldest) partyCache.delete(oldest);
    }
    partyCache.set(transferId, cached);
  }
  const privileged = role === "admin" || role === "internalLab";
  if (!privileged && !cached.peers.includes(String(userId))) return null;
  return cached.peers;
}

/**
 * 저장을 기다리지 않고 같은 의뢰의 상대 화면에 넘긴다.
 * @param {(userId: string, type: string, data: object) => void} emit
 */
export async function relayCustomAbutmentLive(socket, raw, emit) {
  if (!raw || typeof raw !== "object" || typeof emit !== "function") return;
  const kind = String(raw.kind || "");
  if (kind !== "mesh") {
    let bytes = 0;
    try {
      bytes = JSON.stringify(raw).length;
    } catch {
      return;
    }
    if (bytes > MAX_BYTES) return;
  }
  const transferId = String(raw.transferId || "").trim();
  if (!transferId || transferId.length > 80) return;
  const peers = await peersFor(socket.userId, socket.userRole, transferId);
  if (!peers) return;
  if (kind === "hello") return;
  let savedAt = Number(raw.savedAt);
  if (!Number.isFinite(savedAt)) savedAt = Date.now();
  savedAt = Math.min(Math.max(savedAt, 0), Date.now() + 2000);
  const updatedBy = String(socket.userId || "");
  let event = "";
  let data = null;
  if (kind === "view") {
    const view = sanitizeSharedDesignView(raw.view);
    if (!view) return;
    event = "practice:custom-abutment-view";
    data = { transferId, ...view, savedAt, updatedBy };
    if (raw.persist === true) {
      void PracticeTransfer.updateOne(
        {
          transferId,
          $or: [
            { "production.customAbutmentPreview.sharedView.savedAt": { $exists: false } },
            { "production.customAbutmentPreview.sharedView.savedAt": { $lte: savedAt } },
          ],
        },
        {
          $set: {
            "production.customAbutmentPreview.sharedView": { ...view, savedAt, updatedBy },
          },
        },
      ).catch((err) => console.warn("[custom-abutment] view persist failed", err?.message || err));
    }
  } else if (kind === "chrome") {
    const chrome = sanitizeChrome(raw.chrome);
    if (!chrome) return;
    event = "practice:custom-abutment-chrome";
    data = { transferId, savedAt, updatedBy, ...chrome };
  } else if (kind === "gumball") {
    const tooth = toothKey(raw.tooth);
    if (!tooth) return;
    const edit = sanitizeEdit(raw.edit);
    if (edit === undefined) return;
    event = "practice:custom-abutment-gumball";
    data = { transferId, savedAt, updatedBy, tooth, edit };
  } else if (kind === "design") {
    const meta = toDesignSyncMeta({
      ...(raw.design && typeof raw.design === "object" ? raw.design : {}),
      savedAt,
      updatedBy,
    });
    if (!meta || !Array.isArray(meta.teeth) || meta.teeth.length === 0) return;
    event = "practice:custom-abutment-design";
    data = { transferId, ...meta };
  } else if (kind === "mesh") {
    const mesh = sanitizeLiveMesh(raw);
    if (!mesh) return;
    event = "practice:custom-abutment-mesh";
    data = { transferId, savedAt, updatedBy, ...mesh };
  } else if (kind === "action") {
    const action = sanitizeAction(raw);
    if (!action) return;
    event = "practice:custom-abutment-action";
    data = { transferId, savedAt, updatedBy, ...action };
  } else {
    return;
  }
  data.originSocketId = String(socket.id || "");
  for (const uid of peers) {
    emit(uid, event, data);
  }
}
