// change-log:
// - 2026-10-15: 법인→어벗츠기공소 정액 청구 단가 조회·수정(관리자). 변경 이력 보관.
// related files:
// - web/backend/services/corpPlatformFee.service.js
// - web/backend/models/systemSettings.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/features/settings/tabs/AdminCorpFeesTab.tsx
import SystemSettings from "../../models/systemSettings.model.js";
import { loadAbutsLabFeeSchedule } from "../../utils/abutsLabFeeSchedule.js";
import {
  CORP_FEE_HISTORY_LIMIT,
  buildCorpFeeHistoryEntry,
  buildCorpProductRows,
  normalizeCorpPlatformFees,
  validateCorpPlatformFeesPatch,
} from "../../services/corpPlatformFee.service.js";

async function buildResponseData(doc) {
  const fees = normalizeCorpPlatformFees(doc?.corpPlatformFees);
  const catalog = await loadAbutsLabFeeSchedule();
  return {
    corpPlatformFees: {
      ...fees,
      productUnitFees: buildCorpProductRows(catalog.items, fees.productUnitFees),
    },
  };
}

function actorLabelFromReq(req) {
  const u = req.user || {};
  return String(u.email || u.name || u._id || "").trim();
}

export async function getCorpPlatformFees(req, res) {
  try {
    const doc = await SystemSettings.findOne({ key: "global" })
      .select({ corpPlatformFees: 1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: await buildResponseData(doc),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "법인 청구 단가를 조회하지 못했습니다.",
      error: error.message,
    });
  }
}

export async function updateCorpPlatformFees(req, res) {
  try {
    const checked = validateCorpPlatformFeesPatch(req.body);
    if (!checked.ok) {
      return res.status(400).json({ success: false, message: checked.message });
    }

    const existing = await SystemSettings.findOne({ key: "global" })
      .select({ corpPlatformFees: 1 })
      .lean();
    const prev = normalizeCorpPlatformFees(existing?.corpPlatformFees);
    const next = { ...prev, ...checked.value };
    const now = new Date();
    const actor = actorLabelFromReq(req);

    const entry = buildCorpFeeHistoryEntry({ next, actorLabel: actor, at: now });
    await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $setOnInsert: { key: "global" },
        $set: {
          "corpPlatformFees.platformUsageMonthlyFee": next.platformUsageMonthlyFee,
          "corpPlatformFees.cncRentalMonthlyFee": next.cncRentalMonthlyFee,
          "corpPlatformFees.productUnitFees": next.productUnitFees,
          "corpPlatformFees.note": next.note,
          "corpPlatformFees.updatedAt": now,
          "corpPlatformFees.updatedBy": actor,
        },
        $push: {
          "corpPlatformFees.history": {
            $each: [entry],
            $slice: -CORP_FEE_HISTORY_LIMIT,
          },
        },
      },
      { upsert: true },
    );

    const saved = await SystemSettings.findOne({ key: "global" })
      .select({ corpPlatformFees: 1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: await buildResponseData(saved),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "법인 청구 단가를 저장하지 못했습니다.",
      error: error.message,
    });
  }
}
