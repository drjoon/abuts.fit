// related files:
// - web/backend/modules/bg/bg.routes.js
// - web/backend/controllers/ai/lotCapture.controller.js
// - bg/pc2/lot-server/src/index.js
// - web/backend/controllers/requests/common.requests.controller.js
// change-log:
// - 2026-11-26: 대기 큐에서 R&D 보관 샘플·더미를 빼 워크시트와 맞춘다.
// - 2026-11-26: PC2 lot-server(8012) 작업자용 세척.패킹 대기 큐·스크류 로트 BG API.
import Request from "../../models/request.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { ensureCanonicalPackingScrewLotItems } from "../../utils/labPracticeScrewSupply.js";

function extractLotSuffix3(value) {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
}

/**
 * 세척.패킹 작업·각인 매칭 후보.
 * 워크시트 패킹 탭과 같이 R&D 보관 샘플·더미는 제외한다.
 */
export function buildActivePackingMatchFilter() {
  return {
    status: { $ne: "취소" },
    manufacturerStage: "세척.패킹",
    source: { $nin: ["dummy_sample"] },
    requestCategory: { $nin: ["rnd_sample", "dummy_sample"] },
    $nor: [
      {
        source: "manufacturer_sample",
        "rnd.doneAt": { $ne: null },
      },
    ],
  };
}

function getDiameterBucketIndex(diameter) {
  if (diameter == null || !Number.isFinite(Number(diameter))) return 3;
  const d = Number(diameter);
  if (d <= 6) return 0;
  if (d <= 8) return 1;
  if (d <= 10) return 2;
  return 3;
}

function normalizePackingScrewLot(value) {
  return String(value || "")
    .trim()
    .slice(0, 120);
}

function normalizePackingScrewLotItems(itemsRaw, { withDefault = false } = {}) {
  const list = Array.isArray(itemsRaw) ? itemsRaw : [];
  const items = [];
  for (const row of list) {
    const type = String(row?.type || "")
      .trim()
      .toUpperCase()
      .slice(0, 30);
    const lotNumber = normalizePackingScrewLot(row?.lotNumber);
    if (!type) continue;
    items.push({ type, lotNumber });
  }
  if (withDefault) {
    return ensureCanonicalPackingScrewLotItems(items);
  }
  return items;
}

function toPackingScrewLotMap(itemsRaw) {
  const items = normalizePackingScrewLotItems(itemsRaw, { withDefault: false });
  const lots = {};
  for (const row of items) {
    lots[row.type] = row.lotNumber;
  }
  return lots;
}

function toKstYmd(input) {
  if (input == null || input === "") return "";
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function summarizeRequest(doc) {
  const caseInfos = doc?.caseInfos || {};
  const maxDiameter = Number(caseInfos.maxDiameter);
  const totalLength = Number(caseInfos.totalLength);
  const taperAngle = Number(caseInfos.taperAngle);
  const connectionDiameter = Number(caseInfos.connectionDiameter);
  const labName = String(
    doc?.businessAnchorId?.name ||
      doc?.requestor?.business ||
      doc?.requestor?.name ||
      "",
  ).trim();
  const manufacturingDate =
    toKstYmd(doc?.productionSchedule?.actualMachiningComplete) ||
    toKstYmd(caseInfos?.reviewByStage?.machining?.updatedAt) ||
    toKstYmd(doc?.timeline?.actualCompletion) ||
    "";
  return {
    _id: String(doc._id || ""),
    requestId: String(doc.requestId || ""),
    lotSuffix: extractLotSuffix3(doc?.lotNumber?.value),
    lotNumber: String(doc?.lotNumber?.value || ""),
    patientName: String(caseInfos.patientName || ""),
    clinicName: String(caseInfos.clinicName || ""),
    tooth: String(caseInfos.tooth || ""),
    maxDiameter: Number.isFinite(maxDiameter) ? maxDiameter : null,
    totalLength: Number.isFinite(totalLength) ? totalLength : null,
    taperAngle: Number.isFinite(taperAngle) ? taperAngle : null,
    connectionDiameter: Number.isFinite(connectionDiameter)
      ? connectionDiameter
      : null,
    material: String(caseInfos.material || ""),
    screwType: String(
      doc?.screwTracking?.type || caseInfos.screwType || "",
    ).trim(),
    mailboxCode: String(doc?.mailboxAddress || "").trim(),
    labName,
    implantManufacturer: String(caseInfos.implantManufacturer || "").trim(),
    implantBrand: String(caseInfos.implantBrand || "").trim(),
    implantFamily: String(caseInfos.implantFamily || "").trim(),
    implantType: String(caseInfos.implantType || "").trim(),
    manufacturingDate,
    hexVerificationSample: Boolean(caseInfos.hexVerificationSample),
    printed: Boolean(doc?.shippingLabelPrinted?.printed),
    createdAt: doc?.createdAt || null,
  };
}

/**
 * GET /api/bg/packing/queue
 * 세척.패킹 대기 목록 + 직경(6/8/10/12) 건수.
 */
export const listPackingQueue = asyncHandler(async (_req, res) => {
  const rows = await Request.find(buildActivePackingMatchFilter())
    .select({
      requestId: 1,
      lotNumber: 1,
      caseInfos: 1,
      screwTracking: 1,
      shippingLabelPrinted: 1,
      mailboxAddress: 1,
      createdAt: 1,
      businessAnchorId: 1,
      requestor: 1,
      productionSchedule: 1,
      timeline: 1,
    })
    .populate("businessAnchorId", "name")
    .populate("requestor", "name business")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const items = rows.map(summarizeRequest);
  const labels = ["6", "8", "10", "12"];
  const counts = [0, 0, 0, 0];
  for (const item of items) {
    const idx = getDiameterBucketIndex(item.maxDiameter);
    counts[idx] += 1;
  }

  return res.status(200).json(
    new ApiResponse(200, {
      total: items.length,
      labels,
      counts,
      items,
    }),
  );
});

/**
 * GET /api/bg/packing/screw-lot-settings
 */
export const getPackingScrewLotSettingsBg = asyncHandler(async (_req, res) => {
  const settings = await SystemSettings.findOne({ key: "global" })
    .select({ packingScrewLotSettings: 1 })
    .lean();
  const items = normalizePackingScrewLotItems(settings?.packingScrewLotSettings, {
    withDefault: true,
  });
  return res.status(200).json(
    new ApiResponse(200, {
      items,
      lots: toPackingScrewLotMap(items),
    }),
  );
});

/**
 * PUT /api/bg/packing/screw-lot-settings
 */
export const savePackingScrewLotSettingsBg = asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body?.items)) {
    throw new ApiError(400, "items 배열이 필요합니다.");
  }
  const nextItems = ensureCanonicalPackingScrewLotItems(
    normalizePackingScrewLotItems(req.body.items, { withDefault: false }),
  );
  const updated = await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $set: { packingScrewLotSettings: nextItems } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      select: { packingScrewLotSettings: 1 },
    },
  ).lean();
  const savedItems = normalizePackingScrewLotItems(
    updated?.packingScrewLotSettings || nextItems,
    { withDefault: true },
  );
  return res.status(200).json(
    new ApiResponse(200, {
      items: savedItems,
      lots: toPackingScrewLotMap(savedItems),
    }),
  );
});
