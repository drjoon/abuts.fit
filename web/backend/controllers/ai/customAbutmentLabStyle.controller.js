// 기공소 커스텀어벗 디자인 스타일 프로필(파라미터 세트).
// 치종 기본 → 기공소 스타일 → 치과 취향 → 케이스. 단면 형상은 다루지 않는다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentLabStyle.ts
// - web/backend/models/businessAnchor.model.js
// - web/backend/modules/ai/ai.routes.js

import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";

const SCOPE_KEYS = ["all", "anterior", "posterior"];
const PARAM_KEYS = new Set([
  "occlusalClearanceMm",
  "postTopPlaneCode",
  "postLingualBevelMm",
  "postLabialBevelMm",
  "postWidthScale",
  "marginFilletRadiusMm",
  "marginShoulderMm",
  "marginDepthMm",
  "marginSubgMinMm",
  "marginSubgMaxMm",
  "marginScallopMm",
  "marginSizeScale",
  "crownContactMm",
  "minCrownThicknessMm",
  "axisToOpposing",
  "axisMaxDeg",
  "axisTargetDeg",
  "axisSourceCode",
]);

function cleanScopes(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const scope of SCOPE_KEYS) {
    const row = raw[scope];
    if (!row || typeof row !== "object") continue;
    const params = {};
    for (const [key, value] of Object.entries(row)) {
      if (!PARAM_KEYS.has(key)) continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      params[key] = n;
    }
    if (Object.keys(params).length > 0) out[scope] = params;
  }
  return out;
}

function styleView(doc) {
  if (!doc || typeof doc !== "object") {
    return { activeId: "uri-altoran", profiles: [], updatedAt: null };
  }
  const profiles = Array.isArray(doc.profiles)
    ? doc.profiles
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const id = String(row.id || "").trim();
          const name = String(row.name || "").trim();
          if (!id || !name) return null;
          return {
            id,
            name,
            note: row.note ? String(row.note) : undefined,
            scopes: cleanScopes(row.scopes),
          };
        })
        .filter(Boolean)
    : [];
  return {
    activeId: String(doc.activeId || "").trim() || "uri-altoran",
    profiles,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

async function findTransfer(raw) {
  const id = String(raw || "").trim();
  if (!id) return null;
  const select = {
    transferId: 1,
    practiceBusinessAnchorId: 1,
    targetLabAnchorId: 1,
    assigneeLabAnchorId: 1,
  };
  if (Types.ObjectId.isValid(id)) {
    const byId = await PracticeTransfer.findById(id).select(select).lean();
    if (byId) return byId;
  }
  return PracticeTransfer.findOne({ transferId: id }).select(select).lean();
}

/** 수행 기공소 앵커. 저장은 그 기공소 계정만. */
async function resolveLabStyleAnchor(req, transferIdRaw) {
  const own = String(req.user?.businessAnchorId || "").trim();
  const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
  const t = await findTransfer(transferIdRaw);
  if (t) {
    const labAnchorId = t.assigneeLabAnchorId || t.targetLabAnchorId || null;
    if (!labAnchorId) {
      return { labAnchorId: null, canSave: false };
    }
    const parties = [
      String(t.practiceBusinessAnchorId || ""),
      String(t.targetLabAnchorId || ""),
      String(t.assigneeLabAnchorId || ""),
    ];
    if (!parties.includes(own) && !privileged) {
      return { labAnchorId: null, canSave: false };
    }
    return {
      labAnchorId: String(labAnchorId),
      canSave: own === String(labAnchorId) || privileged,
    };
  }
  if (Types.ObjectId.isValid(own)) {
    return { labAnchorId: own, canSave: true };
  }
  return { labAnchorId: null, canSave: false };
}

/**
 * @route GET /api/ai/custom-abutment-lab-style?transferId=
 */
export async function getCustomAbutmentLabStyle(req, res) {
  try {
    const { labAnchorId, canSave } = await resolveLabStyleAnchor(req, req.query?.transferId);
    if (!labAnchorId) {
      return res.json({
        success: true,
        data: { style: styleView(null), canSave: false },
      });
    }
    const anchor = await BusinessAnchor.findById(labAnchorId)
      .select({ customAbutmentLabStyle: 1 })
      .lean();
    return res.json({
      success: true,
      data: { style: styleView(anchor?.customAbutmentLabStyle), canSave },
    });
  } catch (error) {
    console.error("[AI] getCustomAbutmentLabStyle error", error);
    return res.status(500).json({ success: false, message: "디자인 스타일을 불러오지 못했습니다." });
  }
}

/**
 * @route PUT /api/ai/custom-abutment-lab-style
 * body: { transferId?, activeId?, profiles? }
 */
export async function saveCustomAbutmentLabStyle(req, res) {
  try {
    const { labAnchorId, canSave } = await resolveLabStyleAnchor(req, req.body?.transferId);
    if (!labAnchorId || !canSave) {
      return res.status(403).json({ success: false, message: "수행 기공소만 저장할 수 있습니다." });
    }
    const next = styleView({
      activeId: req.body?.activeId,
      profiles: req.body?.profiles,
      updatedAt: new Date(),
    });
    await BusinessAnchor.updateOne(
      { _id: labAnchorId },
      {
        $set: {
          customAbutmentLabStyle: {
            activeId: next.activeId,
            profiles: next.profiles,
            updatedAt: new Date(),
          },
        },
      },
    );
    return res.json({ success: true, data: { style: next, canSave: true } });
  } catch (error) {
    console.error("[AI] saveCustomAbutmentLabStyle error", error);
    return res.status(500).json({ success: false, message: "디자인 스타일을 저장하지 못했습니다." });
  }
}
