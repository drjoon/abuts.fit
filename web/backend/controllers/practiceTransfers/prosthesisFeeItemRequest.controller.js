// related files:
// - web/backend/models/prosthesisFeeItemRequest.model.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/modules/admin/admin.routes.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// change-log:
// - 2026-09-05: 치과→기공소 커스텀 보철 수가 요청 + Off 시드.
// - 2026-09-05: 생성 시 시드 제거 — 관리자 승인(지정/전체 기공소) 후 Off 시드.
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ProsthesisFeeItemRequest from "../../models/prosthesisFeeItemRequest.model.js";
import {
  canonicalizeFeeItemName,
  MAX_LAB_FEE_ITEMS,
  normalizeLabFeeItem,
  normalizeLabFeeItems,
  normalizeLabFeeRemakeSchedule,
  normalizeLabFeeSchedule,
  normalizeLabFeeScheduleEnabled,
  legacyLabFeeScheduleFromItems,
  isLabFeeScheduleConfigured,
  labFeeItemHasChargePrice,
} from "../../utils/labFeeSchedule.js";
import { requestorKindCapableAnchorFilter } from "../../utils/requestorCapabilities.js";
import { emitAppEventToRoles } from "../../socket.js";

const ARCH_BULK_PRESET_TYPES = new Set(["전체틀니", "부분틀니", "랩어라운드"]);

const ALLOWED_SOURCES = new Set([
  "extra_request",
  "select_all",
  "prosthesis_type_settings",
  "other",
]);

export function isArchBulkPresetProsthesisType(name) {
  return ARCH_BULK_PRESET_TYPES.has(canonicalizeFeeItemName(name));
}

export function isCustomProsthesisFeeRequestName(name) {
  const canon = canonicalizeFeeItemName(name);
  if (!canon) return false;
  if (isArchBulkPresetProsthesisType(canon)) return false;
  return true;
}

const toLabTargets = (doc) => {
  const fromArray = Array.isArray(doc?.labTargets) ? doc.labTargets : [];
  const mapped = fromArray
    .map((row) => {
      const labAnchorId = row?.labAnchorId ? String(row.labAnchorId).trim() : "";
      if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) return null;
      return {
        labAnchorId,
        labName: String(row?.labName || "").trim(),
      };
    })
    .filter(Boolean);
  if (mapped.length > 0) return mapped;
  const legacyId = doc?.labAnchorId ? String(doc.labAnchorId).trim() : "";
  if (legacyId && Types.ObjectId.isValid(legacyId)) {
    return [
      {
        labAnchorId: legacyId,
        labName: String(doc?.labName || "").trim(),
      },
    ];
  }
  return [];
};

const toResponse = (doc) => {
  if (!doc) return null;
  const labTargets = toLabTargets(doc);
  const primary = labTargets[0] || null;
  return {
    id: String(doc._id),
    practiceAnchorId: doc.practiceAnchorId
      ? String(doc.practiceAnchorId)
      : null,
    practiceName: String(doc.practiceName || "").trim(),
    labAnchorId: primary?.labAnchorId || null,
    labName: primary?.labName || "",
    labTargets,
    name: String(doc.name || "").trim(),
    nameKey: String(doc.nameKey || "").trim(),
    status: String(doc.status || "pending"),
    source: String(doc.source || "extra_request"),
    applyScope: doc.applyScope ? String(doc.applyScope) : null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    approvedAt: doc.approvedAt || null,
    adoptedAt: doc.adoptedAt || null,
  };
};

/**
 * body.labs | body.labTargets | 단일 labAnchorId 를 정규화.
 * @returns {Promise<Array<{ labAnchorId: string, labName: string }>>}
 */
async function resolveLabTargetsFromBody(body) {
  const rawList = Array.isArray(body?.labs)
    ? body.labs
    : Array.isArray(body?.labTargets)
      ? body.labTargets
      : Array.isArray(body?.labAnchorIds)
        ? body.labAnchorIds.map((id) => ({ labAnchorId: id }))
        : null;

  const candidates = [];
  if (rawList) {
    for (const row of rawList) {
      if (typeof row === "string") {
        candidates.push({ labAnchorId: row, labName: "" });
        continue;
      }
      candidates.push({
        labAnchorId: String(row?.labAnchorId || row?._id || "").trim(),
        labName: String(row?.labName || row?.name || "").trim(),
      });
    }
  } else {
    const singleId = String(body?.labAnchorId || "").trim();
    if (singleId) {
      candidates.push({
        labAnchorId: singleId,
        labName: String(body?.labName || "").trim(),
      });
    }
  }

  const seen = new Set();
  const unique = [];
  for (const row of candidates) {
    const id = String(row.labAnchorId || "").trim();
    if (!id || !Types.ObjectId.isValid(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push({ labAnchorId: id, labName: String(row.labName || "").trim() });
  }
  if (unique.length === 0) return [];

  const missingNameIds = unique
    .filter((row) => !row.labName)
    .map((row) => row.labAnchorId);
  if (missingNameIds.length > 0) {
    const labs = await BusinessAnchor.find({
      _id: { $in: missingNameIds },
    })
      .select({ name: 1, metadata: 1 })
      .lean();
    const nameById = new Map(
      (Array.isArray(labs) ? labs : []).map((lab) => [
        String(lab._id),
        String(lab?.name || lab?.metadata?.companyName || "").trim(),
      ]),
    );
    for (const row of unique) {
      if (!row.labName) row.labName = nameById.get(row.labAnchorId) || "";
    }
  }
  return unique;
}

/**
 * 기공소 수가에 동명 항목이 없으면 Off·0원·perSet로 append 후 저장.
 * @returns {Promise<boolean>} 시드했는지
 */
export async function seedOffLabFeeItemForProsthesisRequest({
  labAnchorId,
  name,
}) {
  const labId = String(labAnchorId || "").trim();
  const displayName = String(name || "").trim();
  const nameKey = canonicalizeFeeItemName(displayName);
  if (!labId || !Types.ObjectId.isValid(labId) || !nameKey) return false;

  const lab = await BusinessAnchor.findById(labId).select({
    labFeeSchedule: 1,
  });
  if (!lab) return false;

  const existingItems = normalizeLabFeeItems(lab.labFeeSchedule);
  if (
    existingItems.some(
      (item) => canonicalizeFeeItemName(item?.name) === nameKey,
    )
  ) {
    return false;
  }
  if (existingItems.length >= MAX_LAB_FEE_ITEMS) return false;

  const seeded = normalizeLabFeeItem(
    {
      id: `practice-req-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: displayName,
      unit: "perSet",
      enabled: false,
      price: 0,
      remake: 0,
      tiers: [],
    },
    existingItems.length,
  );
  if (!seeded?.name) return false;

  const items = [...existingItems, seeded].slice(0, MAX_LAB_FEE_ITEMS);
  const remakeFallback = normalizeLabFeeRemakeSchedule(lab.labFeeSchedule);
  const enabledFallback = normalizeLabFeeScheduleEnabled(lab.labFeeSchedule);
  const legacy = legacyLabFeeScheduleFromItems(items, {
    ...normalizeLabFeeSchedule(lab.labFeeSchedule),
    remake: remakeFallback,
    enabled: enabledFallback,
  });
  const active = isLabFeeScheduleConfigured(lab.labFeeSchedule);

  lab.labFeeSchedule = {
    ...legacy.schedule,
    remake: { ...remakeFallback, ...legacy.remake },
    enabled: { ...enabledFallback, ...legacy.enabled },
    items,
    active,
    updatedAt: new Date(),
  };
  await lab.save();
  return true;
}

async function listAllLabAnchorIds() {
  const kindFilter = requestorKindCapableAnchorFilter("lab");
  const labs = await BusinessAnchor.find({
    businessType: "requestor",
    status: { $ne: "merged" },
    ...(kindFilter || {}),
  })
    .select({ _id: 1 })
    .lean();
  return (Array.isArray(labs) ? labs : [])
    .map((row) => String(row?._id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id));
}

/**
 * 승인으로 시드된 Off·0원 동명 항목만 제거(수가 On·단가 있으면 유지).
 * @returns {Promise<boolean>}
 */
export async function removeSeededOffLabFeeItemForProsthesisRequest({
  labAnchorId,
  name,
}) {
  const labId = String(labAnchorId || "").trim();
  const displayName = String(name || "").trim();
  const nameKey = canonicalizeFeeItemName(displayName);
  if (!labId || !Types.ObjectId.isValid(labId) || !nameKey) return false;

  const lab = await BusinessAnchor.findById(labId).select({
    labFeeSchedule: 1,
  });
  if (!lab) return false;

  const existingItems = normalizeLabFeeItems(lab.labFeeSchedule);
  const nextItems = existingItems.filter((item) => {
    if (canonicalizeFeeItemName(item?.name) !== nameKey) return true;
    if (item?.enabled !== false) return true;
    if (labFeeItemHasChargePrice(item)) return true;
    return false;
  });
  if (nextItems.length === existingItems.length) return false;

  const remakeFallback = normalizeLabFeeRemakeSchedule(lab.labFeeSchedule);
  const enabledFallback = normalizeLabFeeScheduleEnabled(lab.labFeeSchedule);
  const legacy = legacyLabFeeScheduleFromItems(nextItems, {
    ...normalizeLabFeeSchedule(lab.labFeeSchedule),
    remake: remakeFallback,
    enabled: enabledFallback,
  });
  const active = isLabFeeScheduleConfigured({
    ...(lab.labFeeSchedule || {}),
    items: nextItems,
  });

  lab.labFeeSchedule = {
    ...legacy.schedule,
    remake: { ...remakeFallback, ...legacy.remake },
    enabled: { ...enabledFallback, ...legacy.enabled },
    items: nextItems,
    active,
    updatedAt: new Date(),
  };
  await lab.save();
  return true;
}

/**
 * 승인 되돌리기 시 시드된 Off 항목 제거(응답 후 fire-and-forget).
 */
export async function unseedApprovedProsthesisFeeItemRequest(requestDoc) {
  if (!requestDoc) return { removed: 0, targets: 0 };
  const name = String(requestDoc.name || "").trim();
  const scope = String(requestDoc.applyScope || "").trim();
  if (!name) return { removed: 0, targets: 0 };

  let labIds = [];
  if (scope === "all_labs") {
    labIds = await listAllLabAnchorIds();
  } else {
    const targets = toLabTargets(requestDoc);
    labIds = targets
      .map((row) => String(row.labAnchorId || "").trim())
      .filter((id) => Types.ObjectId.isValid(id));
  }
  if (labIds.length === 0) return { removed: 0, targets: 0 };

  let removed = 0;
  const chunkSize = 8;
  for (let i = 0; i < labIds.length; i += chunkSize) {
    const chunk = labIds.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((labAnchorId) =>
        removeSeededOffLabFeeItemForProsthesisRequest({
          labAnchorId,
          name,
        }).catch((err) => {
          console.error(
            "[prosthesisFeeItemRequest] unseed failed",
            labAnchorId,
            err,
          );
          return false;
        }),
      ),
    );
    removed += results.filter(Boolean).length;
  }
  return { removed, targets: labIds.length };
}

/**
 * 승인 범위에 맞는 기공소 수가에 Off 항목 시드(응답 후 fire-and-forget).
 */
export async function seedApprovedProsthesisFeeItemRequest(requestDoc) {
  if (!requestDoc) return { seeded: 0, targets: 0 };
  const name = String(requestDoc.name || "").trim();
  const scope = String(requestDoc.applyScope || "").trim();
  if (!name || (scope !== "lab" && scope !== "all_labs")) {
    return { seeded: 0, targets: 0 };
  }

  let labIds = [];
  if (scope === "lab") {
    const targets = toLabTargets(requestDoc);
    labIds = targets
      .map((row) => String(row.labAnchorId || "").trim())
      .filter((id) => Types.ObjectId.isValid(id));
  } else {
    labIds = await listAllLabAnchorIds();
  }

  let seeded = 0;
  const chunkSize = 8;
  for (let i = 0; i < labIds.length; i += chunkSize) {
    const chunk = labIds.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((labAnchorId) =>
        seedOffLabFeeItemForProsthesisRequest({ labAnchorId, name }).catch(
          (err) => {
            console.error(
              "[prosthesisFeeItemRequest] approve seed failed",
              labAnchorId,
              err,
            );
            return false;
          },
        ),
      ),
    );
    seeded += results.filter(Boolean).length;
  }
  return { seeded, targets: labIds.length };
}

/**
 * 기공소가 수가 항목을 On·단가로 저장하면 관련 approved 요청을 adopted로.
 */
export async function adoptProsthesisFeeItemRequestsForLabItems({
  labAnchorId,
  items,
  adoptedBy,
}) {
  const labId = String(labAnchorId || "").trim();
  if (!labId || !Types.ObjectId.isValid(labId)) return 0;

  const list = Array.isArray(items) ? items : [];
  const adoptedKeys = new Set();
  for (const item of list) {
    if (!item || item.enabled === false) continue;
    if (!labFeeItemHasChargePrice(item)) continue;
    const key = canonicalizeFeeItemName(item.name);
    if (key) adoptedKeys.add(key);
  }
  if (adoptedKeys.size === 0) return 0;

  const result = await ProsthesisFeeItemRequest.updateMany(
    {
      status: { $in: ["approved", "pending"] },
      nameKey: { $in: [...adoptedKeys] },
      $or: [
        { labAnchorId: new Types.ObjectId(labId) },
        { "labTargets.labAnchorId": new Types.ObjectId(labId) },
        { applyScope: "all_labs" },
        { labAnchorId: null, labTargets: { $size: 0 } },
        { labAnchorId: null, labTargets: { $exists: false } },
      ],
    },
    {
      $set: {
        status: "adopted",
        adoptedAt: new Date(),
        ...(adoptedBy && Types.ObjectId.isValid(String(adoptedBy))
          ? { adoptedBy }
          : {}),
      },
    },
  );
  return Number(result?.modifiedCount || 0);
}

export async function createProsthesisFeeItemRequest(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const practiceAnchorId = String(req.user?.businessAnchorId || "").trim();
    if (!practiceAnchorId || !Types.ObjectId.isValid(practiceAnchorId)) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다.",
      });
    }

    const rawName = String(
      req.body?.name || req.body?.content || "",
    ).trim();
    const nameKey = canonicalizeFeeItemName(rawName);
    if (!nameKey) {
      return res.status(400).json({
        success: false,
        message: "요청 내용을 입력해주세요.",
      });
    }
    if (!isCustomProsthesisFeeRequestName(rawName)) {
      return res.status(400).json({
        success: false,
        message: "전체틀니·부분틀니·랩어라운드는 요청 대상이 아닙니다.",
      });
    }

    const sourceRaw = String(req.body?.source || "extra_request").trim();
    const source = ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : "extra_request";

    const labTargets = await resolveLabTargetsFromBody(req.body || {});
    const labAnchorId = labTargets[0]?.labAnchorId || null;
    const labName = labTargets[0]?.labName || "";

    const practice = await BusinessAnchor.findById(practiceAnchorId)
      .select({ name: 1, metadata: 1 })
      .lean();
    if (!practice) {
      return res.status(404).json({
        success: false,
        message: "치과 사업자 정보를 찾을 수 없습니다.",
      });
    }
    const practiceName =
      String(practice.name || practice.metadata?.companyName || "").trim() ||
      String(req.user?.business || req.user?.name || "").trim();

    const filter = {
      practiceAnchorId: new Types.ObjectId(practiceAnchorId),
      nameKey,
    };

    let requestDoc = await ProsthesisFeeItemRequest.findOne(filter).sort({
      createdAt: -1,
    });

    if (requestDoc && requestDoc.status === "adopted") {
      // 이미 채택된 동명 요청은 새 pending으로 생성
      requestDoc = null;
    }

    if (requestDoc) {
      requestDoc.name = rawName;
      requestDoc.practiceName = practiceName;
      requestDoc.source = source;
      requestDoc.requestedBy = req.user?._id || requestDoc.requestedBy;
      requestDoc.labTargets = labTargets;
      requestDoc.labAnchorId = labAnchorId || null;
      requestDoc.labName = labName;
      if (
        requestDoc.status === "dismissed" ||
        requestDoc.status === "approved"
      ) {
        requestDoc.status = "pending";
        requestDoc.applyScope = undefined;
        requestDoc.approvedAt = null;
        requestDoc.approvedBy = null;
        requestDoc.adoptedAt = null;
        requestDoc.adoptedBy = null;
      }
      await requestDoc.save();
    } else {
      requestDoc = await ProsthesisFeeItemRequest.create({
        practiceAnchorId,
        practiceName,
        requestedBy: req.user?._id || null,
        labAnchorId: labAnchorId || null,
        labName,
        labTargets,
        name: rawName,
        nameKey,
        status: "pending",
        source,
      });
    }

    res.status(200).json({
      success: true,
      data: { request: toResponse(requestDoc) },
    });

    void Promise.resolve().then(() => {
      emitAppEventToRoles(["admin"], "prosthesis-fee-item:request", {
        requestId: String(requestDoc._id),
        practiceAnchorId,
        practiceName,
        labAnchorId: labAnchorId || null,
        labName: labName || "",
        labTargets,
        name: rawName,
      });
    });
  } catch (e) {
    console.error("[prosthesisFeeItemRequest] create error", e);
    return res.status(500).json({
      success: false,
      message: "보철물 요청을 저장하지 못했습니다.",
    });
  }
}

/**
 * PATCH /api/admin/prosthesis-fee-item-requests/:id
 * body: { name }
 * 대기 요청 명칭 변경(승인 전).
 */
export async function renameProsthesisFeeItemRequest(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "잘못된 요청입니다." });
    }

    const rawName = String(req.body?.name || req.body?.content || "").trim();
    const nameKey = canonicalizeFeeItemName(rawName);
    if (!nameKey) {
      return res.status(400).json({
        success: false,
        message: "보철물 이름을 입력해주세요.",
      });
    }
    if (!isCustomProsthesisFeeRequestName(rawName)) {
      return res.status(400).json({
        success: false,
        message: "전체틀니·부분틀니·랩어라운드는 사용할 수 없습니다.",
      });
    }

    const requestDoc = await ProsthesisFeeItemRequest.findById(id);
    if (!requestDoc) {
      return res.status(404).json({
        success: false,
        message: "요청을 찾을 수 없습니다.",
      });
    }
    if (requestDoc.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "대기 중인 요청만 이름을 변경할 수 있습니다.",
      });
    }

    requestDoc.name = rawName;
    requestDoc.nameKey = nameKey;
    await requestDoc.save();

    return res.status(200).json({
      success: true,
      data: { request: toResponse(requestDoc) },
    });
  } catch (e) {
    console.error("[prosthesisFeeItemRequest] rename error", e);
    return res.status(500).json({
      success: false,
      message: "이름을 변경하지 못했습니다.",
    });
  }
}

/**
 * POST /api/admin/prosthesis-fee-item-requests/:id/approve
 * body: { applyScope: "lab" | "all_labs", name?, labAnchorId?, labName?, labs? }
 */
export async function approveProsthesisFeeItemRequest(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "잘못된 요청입니다." });
    }

    const applyScopeRaw = String(req.body?.applyScope || "").trim();
    const applyScope =
      applyScopeRaw === "lab" || applyScopeRaw === "all_labs"
        ? applyScopeRaw
        : null;
    if (!applyScope) {
      return res.status(400).json({
        success: false,
        message: "적용 범위(지정 기공소 / 모든 기공소)를 선택해주세요.",
      });
    }

    const requestDoc = await ProsthesisFeeItemRequest.findById(id);
    if (!requestDoc) {
      return res.status(404).json({
        success: false,
        message: "요청을 찾을 수 없습니다.",
      });
    }
    if (requestDoc.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "대기 중인 요청만 승인할 수 있습니다.",
      });
    }

    const renameRaw = String(req.body?.name || req.body?.content || "").trim();
    if (renameRaw) {
      const renameKey = canonicalizeFeeItemName(renameRaw);
      if (!renameKey) {
        return res.status(400).json({
          success: false,
          message: "보철물 이름을 입력해주세요.",
        });
      }
      if (!isCustomProsthesisFeeRequestName(renameRaw)) {
        return res.status(400).json({
          success: false,
          message: "전체틀니·부분틀니·랩어라운드는 사용할 수 없습니다.",
        });
      }
      requestDoc.name = renameRaw;
      requestDoc.nameKey = renameKey;
    }

    if (applyScope === "lab") {
      const bodyTargets = await resolveLabTargetsFromBody(req.body || {});
      const existingTargets = toLabTargets(requestDoc);
      const nextTargets =
        bodyTargets.length > 0 ? bodyTargets : existingTargets;
      if (nextTargets.length === 0) {
        return res.status(400).json({
          success: false,
          message: "지정 기공소 승인은 대상 기공소가 필요합니다.",
        });
      }
      requestDoc.labTargets = nextTargets;
      requestDoc.labAnchorId = nextTargets[0].labAnchorId;
      requestDoc.labName = nextTargets[0].labName || "";
    }

    requestDoc.applyScope = applyScope;
    requestDoc.status = "approved";
    requestDoc.approvedAt = new Date();
    requestDoc.approvedBy = req.user?._id || null;
    await requestDoc.save();

    res.status(200).json({
      success: true,
      data: { request: toResponse(requestDoc) },
    });

    void seedApprovedProsthesisFeeItemRequest(requestDoc)
      .then((result) => {
        emitAppEventToRoles(["admin"], "prosthesis-fee-item:approved", {
          requestId: String(requestDoc._id),
          applyScope,
          seeded: result?.seeded || 0,
          targets: result?.targets || 0,
          name: String(requestDoc.name || ""),
        });
      })
      .catch((err) => {
        console.error("[prosthesisFeeItemRequest] approve seed error", err);
      });
  } catch (e) {
    console.error("[prosthesisFeeItemRequest] approve error", e);
    return res.status(500).json({
      success: false,
      message: "요청을 승인하지 못했습니다.",
    });
  }
}

/**
 * POST /api/admin/prosthesis-fee-item-requests/:id/dismiss
 */
export async function dismissProsthesisFeeItemRequest(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "잘못된 요청입니다." });
    }

    const requestDoc = await ProsthesisFeeItemRequest.findById(id);
    if (!requestDoc) {
      return res.status(404).json({
        success: false,
        message: "요청을 찾을 수 없습니다.",
      });
    }
    if (requestDoc.status !== "pending" && requestDoc.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "대기·승인 요청만 반려할 수 있습니다.",
      });
    }

    const wasApproved = requestDoc.status === "approved";
    const snapshotForUnseed = wasApproved
      ? {
          name: String(requestDoc.name || ""),
          applyScope: requestDoc.applyScope,
          labTargets: Array.isArray(requestDoc.labTargets)
            ? requestDoc.labTargets
            : [],
          labAnchorId: requestDoc.labAnchorId,
          labName: requestDoc.labName,
        }
      : null;

    requestDoc.status = "dismissed";
    requestDoc.applyScope = undefined;
    requestDoc.approvedAt = null;
    requestDoc.approvedBy = null;
    requestDoc.adoptedAt = null;
    requestDoc.adoptedBy = null;
    await requestDoc.save();

    res.status(200).json({
      success: true,
      data: { request: toResponse(requestDoc) },
    });

    if (snapshotForUnseed) {
      void unseedApprovedProsthesisFeeItemRequest(snapshotForUnseed).catch(
        (err) => {
          console.error("[prosthesisFeeItemRequest] dismiss unseed error", err);
        },
      );
    }
  } catch (e) {
    console.error("[prosthesisFeeItemRequest] dismiss error", e);
    return res.status(500).json({
      success: false,
      message: "요청을 반려하지 못했습니다.",
    });
  }
}

/**
 * POST /api/admin/prosthesis-fee-item-requests/:id/revert
 * 승인·반려(·수가 On) → 대기로 되돌림.
 */
export async function revertProsthesisFeeItemRequest(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "잘못된 요청입니다." });
    }

    const requestDoc = await ProsthesisFeeItemRequest.findById(id);
    if (!requestDoc) {
      return res.status(404).json({
        success: false,
        message: "요청을 찾을 수 없습니다.",
      });
    }

    const prevStatus = String(requestDoc.status || "").trim();
    if (
      prevStatus !== "approved" &&
      prevStatus !== "dismissed" &&
      prevStatus !== "adopted"
    ) {
      return res.status(400).json({
        success: false,
        message: "승인·반려·수가 On 상태만 되돌릴 수 있습니다.",
      });
    }

    const shouldUnseed =
      prevStatus === "approved" || prevStatus === "adopted";
    const snapshotForUnseed = shouldUnseed
      ? {
          name: String(requestDoc.name || ""),
          applyScope: requestDoc.applyScope,
          labTargets: Array.isArray(requestDoc.labTargets)
            ? requestDoc.labTargets
            : [],
          labAnchorId: requestDoc.labAnchorId,
          labName: requestDoc.labName,
        }
      : null;

    requestDoc.status = "pending";
    requestDoc.applyScope = undefined;
    requestDoc.approvedAt = null;
    requestDoc.approvedBy = null;
    requestDoc.adoptedAt = null;
    requestDoc.adoptedBy = null;
    await requestDoc.save();

    res.status(200).json({
      success: true,
      data: { request: toResponse(requestDoc) },
    });

    if (snapshotForUnseed) {
      void unseedApprovedProsthesisFeeItemRequest(snapshotForUnseed)
        .then((result) => {
          emitAppEventToRoles(["admin"], "prosthesis-fee-item:reverted", {
            requestId: String(requestDoc._id),
            prevStatus,
            removed: result?.removed || 0,
            targets: result?.targets || 0,
            name: String(requestDoc.name || ""),
          });
        })
        .catch((err) => {
          console.error("[prosthesisFeeItemRequest] revert unseed error", err);
        });
    }
  } catch (e) {
    console.error("[prosthesisFeeItemRequest] revert error", e);
    return res.status(500).json({
      success: false,
      message: "요청을 되돌리지 못했습니다.",
    });
  }
}
