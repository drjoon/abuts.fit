// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/request.model.js
// - web/backend/controllers/businesses/labPracticeScrewSupply.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferScrewSupply.controller.js
// - web/frontend/src/shared/practice/screwSupply.ts
//
// 스크류 공급 SSOT.
// abuts = 어벗츠 정품, manufacturer = 그 임플란트 제조사 호환.
// 기공소 BusinessAnchor.labPracticeScrewSupplies 가 치과별 다음 기본값.
// 이번 기공의뢰(PracticeTransfer.screwSupply)·제조 의뢰(caseInfos.screwSupply)는
// 그 건에 고른 값. 비어 있으면 쌍 기본값, 그것도 없으면 abuts.

import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import Request from "../models/request.model.js";
import { normalizeImplantManufacturerKey } from "./designSoftwareHex.js";
import { resolvePerformingLabAnchorId } from "./practiceTransferAutoMatchCore.js";

export const SCREW_SUPPLY_ABUTS = "abuts";
export const SCREW_SUPPLY_MANUFACTURER = "manufacturer";

/** 세척.패킹 로트 타입. 어벗츠 정품은 커넥션 스크류 A–E. */
export const ABUTS_PACKING_SCREW_TYPES = Object.freeze(["A", "B", "C", "D", "E"]);
/** 제조사 호환 스크류. 로트 타입은 픽스처 제조사 풀네임. */
export const FIXTURE_MANUFACTURER_SCREW_TYPES = Object.freeze([
  "DENTIUM",
  "OSSTEM",
  "MEGAGEN",
  "NEOBIOTECH",
  "DIO",
  "DENTIS",
]);
export const DEFAULT_PACKING_SCREW_TYPES = Object.freeze([
  ...ABUTS_PACKING_SCREW_TYPES,
  ...FIXTURE_MANUFACTURER_SCREW_TYPES,
]);

export function canonicalFixtureManufacturerScrewType(value) {
  const key = normalizeImplantManufacturerKey(value);
  if (FIXTURE_MANUFACTURER_SCREW_TYPES.includes(key)) return key;
  return "";
}

/**
 * 패킹 로트·표시에 쓰는 스크류 타입.
 * abuts → A–E. manufacturer → DENTIUM 등 풀네임.
 */
export function resolvePackingScrewType({
  screwSupply,
  implantManufacturer,
  connectionScrewType,
} = {}) {
  const supply = normalizeScrewSupply(screwSupply) || SCREW_SUPPLY_ABUTS;
  if (supply === SCREW_SUPPLY_MANUFACTURER) {
    return canonicalFixtureManufacturerScrewType(implantManufacturer);
  }
  const letter = String(connectionScrewType || "")
    .trim()
    .toUpperCase();
  if (ABUTS_PACKING_SCREW_TYPES.includes(letter)) return letter;
  return "";
}

/** 저장된 로트는 유지하고, 없는 기본 타입만 빈 로트로 뒤에 붙인다. */
export function ensureCanonicalPackingScrewLotItems(items) {
  const list = Array.isArray(items) ? items : [];
  const byType = new Map();
  for (const row of list) {
    const type = String(row?.type || "")
      .trim()
      .toUpperCase();
    if (!type || byType.has(type)) continue;
    byType.set(type, {
      type,
      lotNumber: String(row?.lotNumber || ""),
    });
  }
  const ordered = [];
  for (const type of DEFAULT_PACKING_SCREW_TYPES) {
    ordered.push(byType.get(type) || { type, lotNumber: "" });
    byType.delete(type);
  }
  for (const row of byType.values()) ordered.push(row);
  return ordered;
}

export function normalizeScrewSupply(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "manufacturer" || raw === "maker") return SCREW_SUPPLY_MANUFACTURER;
  if (raw === "abuts" || raw === "abutment") return SCREW_SUPPLY_ABUTS;
  return null;
}

/** 치과명 비교 키. 공백·대소문자 차이만 같은 치과로 본다. */
export function toPracticeNameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function rowAnchorId(row) {
  return String(row?.practiceAnchorId || "").trim();
}

export function findLabPracticeScrewSupply(rows, input = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const practiceAnchorId = String(input.practiceAnchorId || "").trim();
  if (practiceAnchorId) {
    const byId = list.find((row) => rowAnchorId(row) === practiceAnchorId);
    const fromId = normalizeScrewSupply(byId?.screwSupply);
    if (fromId) return fromId;
  }
  const key = toPracticeNameKey(input.practiceName || input.practiceNameKey);
  if (!key) return null;
  const byName = list.find(
    (row) => toPracticeNameKey(row?.practiceNameKey) === key,
  );
  return normalizeScrewSupply(byName?.screwSupply);
}

export function resolveScrewSupply(explicit, preference) {
  return normalizeScrewSupply(explicit) || normalizeScrewSupply(preference) || SCREW_SUPPLY_ABUTS;
}

export function upsertLabPracticeScrewSupplyList(rows, input = {}) {
  const screwSupply = normalizeScrewSupply(input.screwSupply);
  const list = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  if (!screwSupply) return list;

  const practiceAnchorId = String(input.practiceAnchorId || "").trim();
  const practiceNameKey = toPracticeNameKey(input.practiceName || input.practiceNameKey);
  if (!practiceAnchorId && !practiceNameKey) return list;

  const idIdx = practiceAnchorId
    ? list.findIndex((row) => rowAnchorId(row) === practiceAnchorId)
    : -1;
  const nameIdx = practiceNameKey
    ? list.findIndex((row) => toPracticeNameKey(row?.practiceNameKey) === practiceNameKey)
    : -1;
  const idx = idIdx >= 0 ? idIdx : nameIdx;
  const now = input.updatedAt instanceof Date ? input.updatedAt : new Date();
  const prev = idx >= 0 ? list[idx] : {};
  const nextRow = {
    ...prev,
    screwSupply,
    updatedAt: now,
  };
  if (practiceAnchorId) nextRow.practiceAnchorId = practiceAnchorId;
  if (practiceNameKey) nextRow.practiceNameKey = practiceNameKey;
  if (!nextRow.practiceNameKey) nextRow.practiceNameKey = toPracticeNameKey(prev.practiceNameKey);

  if (idx >= 0) list[idx] = nextRow;
  else list.push(nextRow);

  if (idIdx >= 0 && nameIdx >= 0 && idIdx !== nameIdx) {
    list.splice(nameIdx, 1);
  }
  return list;
}

export function toLabPracticeScrewSupplyPublic(row) {
  const screwSupply = normalizeScrewSupply(row?.screwSupply);
  if (!screwSupply) return null;
  const practiceAnchorId = rowAnchorId(row) || null;
  const practiceNameKey = toPracticeNameKey(row?.practiceNameKey);
  return {
    practiceAnchorId,
    practiceNameKey,
    screwSupply,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function persistLabPracticeScrewSupply({
  labAnchorId,
  practiceAnchorId,
  practiceName,
  screwSupply,
}) {
  const supply = normalizeScrewSupply(screwSupply);
  const labId = String(labAnchorId || "").trim();
  if (!supply || !Types.ObjectId.isValid(labId)) return null;
  const anchorId = String(practiceAnchorId || "").trim();
  const nameKey = toPracticeNameKey(practiceName);
  if (!Types.ObjectId.isValid(anchorId) && !nameKey) return null;

  const anchor = await BusinessAnchor.findById(labId)
    .select({ labPracticeScrewSupplies: 1 })
    .lean();
  if (!anchor) return null;

  const next = upsertLabPracticeScrewSupplyList(anchor.labPracticeScrewSupplies, {
    practiceAnchorId: Types.ObjectId.isValid(anchorId) ? anchorId : "",
    practiceName: nameKey,
    screwSupply: supply,
  });
  await BusinessAnchor.updateOne(
    { _id: labId },
    { $set: { labPracticeScrewSupplies: next } },
  );
  return toLabPracticeScrewSupplyPublic(
    findStoredRow(next, {
      practiceAnchorId: anchorId,
      practiceName: nameKey,
    }),
  );
}

function findStoredRow(rows, input) {
  const list = Array.isArray(rows) ? rows : [];
  const practiceAnchorId = String(input.practiceAnchorId || "").trim();
  if (practiceAnchorId) {
    const byId = list.find((row) => rowAnchorId(row) === practiceAnchorId);
    if (byId) return byId;
  }
  const key = toPracticeNameKey(input.practiceName || input.practiceNameKey);
  if (!key) return null;
  return list.find((row) => toPracticeNameKey(row?.practiceNameKey) === key) || null;
}

/**
 * 이번 기공의뢰·연동 제조 의뢰·기공소-치과 기본값을 같은 스크류로 맞춘다.
 */
export async function syncPracticeTransferScrewSupply({
  transfer,
  screwSupply,
  practiceName,
}) {
  const supply = normalizeScrewSupply(screwSupply);
  if (!supply || !transfer?._id) return null;
  const practiceAnchorId = transfer.practiceBusinessAnchorId || null;
  const labAnchorId = resolvePerformingLabAnchorId(transfer);
  const relatedIds = Array.isArray(transfer.production?.relatedRequestIds)
    ? transfer.production.relatedRequestIds
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : [];
  const requestOr = [
    { "partnerBilling.relatedPracticeTransferId": transfer._id },
  ];
  if (relatedIds.length) {
    requestOr.push({
      _id: { $in: relatedIds.map((id) => new Types.ObjectId(id)) },
    });
  }

  const [, , preference] = await Promise.all([
    PracticeTransfer.updateOne(
      { _id: transfer._id },
      { $set: { screwSupply: supply } },
    ),
    Request.updateMany(
      { $or: requestOr },
      { $set: { "caseInfos.screwSupply": supply } },
    ),
    labAnchorId
      ? persistLabPracticeScrewSupply({
          labAnchorId,
          practiceAnchorId,
          practiceName,
          screwSupply: supply,
        })
      : null,
  ]);
  return { screwSupply: supply, preference };
}
