// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/utils/roundBarAbutment.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-08-21: 미제공(요청중) 어벗 관리자 대시보드 집계 — 대기/CNC·환봉 도입 + 치과·기공소·임플란트 상세.
import RoundBarAbutmentRequest from "../models/roundBarAbutmentRequest.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { Types } from "mongoose";
import {
  IMPLANT_ADD_REQUEST_OPTION,
  MANUFACTURER_ADD_REQUEST_BRAND,
  ROUND_BAR_HEX_TYPE,
  isImplantAddRequest,
  normalizeAdoptedKind,
} from "../utils/roundBarAbutment.js";
import { isPendingRoundBarAbutment } from "../utils/labFeeSchedule.js";

/** 임플란트 추가 요청(메모) brand 자리표시 — FE `MANUFACTURER_ADD_REQUEST_BRAND`와 동일 */
// (imported MANUFACTURER_ADD_REQUEST_BRAND)

const DETAIL_ITEM_LIMIT = 200;
const TRANSFER_SCAN_LIMIT = 400;

const normalizeKeyPart = (value) => String(value || "").trim().toLowerCase();

const implantMatchKey = ({ practiceAnchorId, manufacturer }) =>
  `${normalizeKeyPart(practiceAnchorId)}|${normalizeKeyPart(manufacturer)}`;

const formatImplantLabel = (row) => {
  const manufacturer = String(row?.manufacturer || "").trim();
  const brand = String(row?.brand || "").trim();
  if (isImplantAddRequest(row) || brand === MANUFACTURER_ADD_REQUEST_BRAND) {
    return manufacturer || IMPLANT_ADD_REQUEST_OPTION;
  }
  return [manufacturer, brand, row?.family, row?.type]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" / ");
};

const classifyRequestStatus = (row) => {
  if (!Boolean(row?.adopted)) return "pending";
  const kind = normalizeAdoptedKind(row?.adoptedKind);
  if (kind === "round_bar") return "adopted_round_bar";
  return "adopted_cnc";
};

const resolveLabName = (transfer) => {
  const named = String(transfer?.targetLabName || "").trim();
  if (named) return named;
  if (String(transfer?.matchingMode || "").trim() === "auto") {
    return "어벗츠기공소";
  }
  return "";
};

/**
 * 미제공(요청중)·도입된 임플란트 추가 요청 집계.
 * 관련 기공의뢰 전송에서 기공소·치아를 붙여 상세에 노출한다.
 */
export async function buildUnsupportedAbutmentDashboardStats() {
  const [countRows, requestDocs, transferDocs] = await Promise.all([
    RoundBarAbutmentRequest.aggregate([
      {
        $group: {
          _id: {
            adopted: "$adopted",
            adoptedKind: { $ifNull: ["$adoptedKind", ""] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    RoundBarAbutmentRequest.find({})
      .sort({ adopted: 1, createdAt: -1 })
      .limit(DETAIL_ITEM_LIMIT)
      .lean(),
    PracticeTransfer.find({
      status: { $nin: ["canceled", "cancelled", "취소"] },
      toothWorks: {
        $elemMatch: {
          customAbutment: true,
          $or: [
            { implantAddRequest: true },
            { implantBrand: MANUFACTURER_ADD_REQUEST_BRAND },
            { implantType: IMPLANT_ADD_REQUEST_OPTION },
            { roundBar: true },
            // 레거시: 예전 추가요청이 헥스(사이즈 미정)+추가요청 brand로만 저장된 경우
            {
              implantBrand: MANUFACTURER_ADD_REQUEST_BRAND,
              implantType: ROUND_BAR_HEX_TYPE,
            },
          ],
        },
      },
    })
      .select({
        transferId: 1,
        practiceBusinessAnchorId: 1,
        targetLabName: 1,
        targetLabAnchorId: 1,
        matchingMode: 1,
        toothWorks: 1,
        createdAt: 1,
        status: 1,
      })
      .sort({ createdAt: -1 })
      .limit(TRANSFER_SCAN_LIMIT)
      .lean(),
  ]);

  let pending = 0;
  let adoptedCnc = 0;
  let adoptedRoundBar = 0;
  for (const row of countRows) {
    const count = Number(row?.count || 0) || 0;
    if (!row?._id?.adopted) {
      pending += count;
      continue;
    }
    const kind = normalizeAdoptedKind(row?._id?.adoptedKind);
    if (kind === "round_bar") adoptedRoundBar += count;
    else adoptedCnc += count;
  }

  /** practiceAnchorId|manufacturer → 기공의뢰 사용 이력 */
  const usagesByKey = new Map();
  for (const transfer of transferDocs) {
    const practiceAnchorId = String(
      transfer?.practiceBusinessAnchorId || "",
    ).trim();
    if (!practiceAnchorId) continue;
    const toothWorks = Array.isArray(transfer?.toothWorks)
      ? transfer.toothWorks
      : [];
    const pendingTeeth = toothWorks.filter(
      (tooth) =>
        Boolean(tooth?.customAbutment) && isPendingRoundBarAbutment(tooth),
    );
    if (pendingTeeth.length === 0) continue;

    const labName = resolveLabName(transfer);
    const labAnchorId = String(transfer?.targetLabAnchorId || "").trim();
    const transferId = String(transfer?.transferId || "").trim();
    const transferMongoId = String(transfer?._id || "").trim();
    const createdAt = transfer?.createdAt || null;

    for (const tooth of pendingTeeth) {
      const manufacturer = String(
        tooth?.implantManufacturer || tooth?.manufacturer || "",
      ).trim();
      const key = implantMatchKey({ practiceAnchorId, manufacturer });
      const teeth = String(tooth?.toothNumber || tooth?.tooth || "").trim();
      const existing = usagesByKey.get(key) || [];
      const dup = existing.find(
        (row) =>
          row.transferMongoId === transferMongoId &&
          row.labAnchorId === labAnchorId &&
          row.labName === labName,
      );
      if (dup) {
        if (teeth && !dup.teeth.includes(teeth)) dup.teeth.push(teeth);
        continue;
      }
      existing.push({
        transferId,
        transferMongoId,
        labName: labName || "-",
        labAnchorId,
        matchingMode: String(transfer?.matchingMode || "").trim() || null,
        createdAt,
        teeth: teeth ? [teeth] : [],
        implantManufacturer: manufacturer,
        implantBrand: String(tooth?.implantBrand || "").trim(),
        implantFamily: String(tooth?.implantFamily || "").trim(),
        implantType: String(tooth?.implantType || "").trim(),
      });
      usagesByKey.set(key, existing);
    }
  }

  const matchedUsageKeys = new Set();
  const items = requestDocs.map((doc) => {
    const practiceAnchorId = doc.practiceAnchorId
      ? String(doc.practiceAnchorId)
      : "";
    const manufacturer = String(doc.manufacturer || "").trim();
    const brand = String(doc.brand || "").trim();
    const family = String(doc.family || "").trim();
    const type =
      String(doc.type || "").trim() || ROUND_BAR_HEX_TYPE;
    const status = classifyRequestStatus(doc);
    const key = implantMatchKey({ practiceAnchorId, manufacturer });
    const usages = usagesByKey.get(key) || [];
    if (usages.length > 0) matchedUsageKeys.add(key);

    const labs = [];
    const labSeen = new Set();
    for (const usage of usages) {
      const labKey = `${usage.labAnchorId}|${usage.labName}`;
      if (labSeen.has(labKey)) continue;
      labSeen.add(labKey);
      labs.push({
        labName: usage.labName,
        labAnchorId: usage.labAnchorId,
      });
    }

    return {
      id: String(doc._id || ""),
      status,
      practiceAnchorId,
      practiceName: String(doc.practiceName || "").trim() || "-",
      manufacturer,
      brand,
      family,
      type,
      implantLabel: formatImplantLabel({ manufacturer, brand, family, type }),
      isManufacturerAddRequest: isImplantAddRequest({
        brand,
        type,
        implantAddRequest: brand === MANUFACTURER_ADD_REQUEST_BRAND,
      }),
      adopted: Boolean(doc.adopted),
      adoptedKind: normalizeAdoptedKind(doc.adoptedKind),
      adoptedAt: doc.adoptedAt || null,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null,
      labs,
      transfers: usages.slice(0, 20),
      transferCount: usages.length,
    };
  });

  // 요청 문서 없이 의뢰만 있는 요청중 CA (레거시·누락 대비)
  const orphanEntries = [];
  for (const [key, usages] of usagesByKey.entries()) {
    if (matchedUsageKeys.has(key) || usages.length === 0) continue;
    orphanEntries.push({ key, usages });
  }
  const orphanPracticeIds = [
    ...new Set(
      orphanEntries
        .map(({ key }) => String(key.split("|")[0] || "").trim())
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  ];
  const orphanPracticeNameById = new Map();
  if (orphanPracticeIds.length > 0) {
    const anchors = await BusinessAnchor.find({
      _id: { $in: orphanPracticeIds.map((id) => new Types.ObjectId(id)) },
    })
      .select({ _id: 1, name: 1 })
      .lean();
    for (const anchor of anchors) {
      orphanPracticeNameById.set(
        String(anchor._id),
        String(anchor.name || "").trim(),
      );
    }
  }
  for (const { key, usages } of orphanEntries) {
    const sample = usages[0];
    const practiceAnchorId = String(key.split("|")[0] || "").trim();
    const manufacturer = String(sample.implantManufacturer || "").trim();
    const brand = String(sample.implantBrand || "").trim();
    const family = String(sample.implantFamily || "").trim();
    const type =
      String(sample.implantType || "").trim() || ROUND_BAR_HEX_TYPE;
    const labs = [];
    const labSeen = new Set();
    for (const usage of usages) {
      const labKey = `${usage.labAnchorId}|${usage.labName}`;
      if (labSeen.has(labKey)) continue;
      labSeen.add(labKey);
      labs.push({
        labName: usage.labName,
        labAnchorId: usage.labAnchorId,
      });
    }
    items.push({
      id: `transfer-only:${key}`,
      status: "pending",
      practiceAnchorId,
      practiceName:
        orphanPracticeNameById.get(practiceAnchorId) ||
        practiceAnchorId ||
        "-",
      manufacturer,
      brand,
      family,
      type,
      implantLabel: formatImplantLabel({ manufacturer, brand, family, type }),
      isManufacturerAddRequest: isImplantAddRequest({
        brand,
        type,
        implantAddRequest: brand === MANUFACTURER_ADD_REQUEST_BRAND,
      }),
      adopted: false,
      adoptedKind: "",
      adoptedAt: null,
      createdAt: sample.createdAt || null,
      updatedAt: sample.createdAt || null,
      labs,
      transfers: usages.slice(0, 20),
      transferCount: usages.length,
      source: "transfer_only",
    });
    pending += 1;
  }

  items.sort((a, b) => {
    const statusRank = (status) => {
      if (status === "pending") return 0;
      if (status === "adopted_cnc") return 1;
      return 2;
    };
    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    pending,
    adoptedCnc,
    adoptedRoundBar,
    total: pending + adoptedCnc + adoptedRoundBar,
    items: items.slice(0, DETAIL_ITEM_LIMIT),
  };
}
