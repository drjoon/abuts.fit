// 기공소 AI 디자인 — 디자인 프리셋(내면 파라미터) 조회·저장. 기공소 BA에 둔다.
// related files:
// - web/backend/modules/labDesignPresets/labDesignPreset.routes.js
// - web/backend/utils/labDesignPresets.js
// - web/frontend/src/shared/practice/labDesignPresetApi.ts
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { assertLabAnchor } from "../../utils/labTradingPartner.util.js";
import { normalizeLabDesignPresets } from "../../utils/labDesignPresets.js";

async function labAnchorId(req) {
  const id = String(req.user?.businessAnchorId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new ApiError(403, "기공소 계정만 쓸 수 있습니다.");
  }
  if (req.user?.role !== "internalLab" && !(await assertLabAnchor(id))) {
    throw new ApiError(403, "기공소 계정만 쓸 수 있습니다.");
  }
  return id;
}

function view(anchor) {
  const stored = normalizeLabDesignPresets(anchor?.labDesignPresets);
  return {
    presets: stored?.presets ?? null,
    defaultId: stored?.defaultId ?? "",
    updatedAt: anchor?.labDesignPresets?.updatedAt ?? null,
  };
}

// GET /api/lab-design-presets
export const getLabDesignPresets = asyncHandler(async (req, res) => {
  const id = await labAnchorId(req);
  const anchor = await BusinessAnchor.findById(id).select({ labDesignPresets: 1 }).lean();
  return res.status(200).json(new ApiResponse(200, view(anchor)));
});

// PUT /api/lab-design-presets  { presets, defaultId }
export const saveLabDesignPresets = asyncHandler(async (req, res) => {
  const id = await labAnchorId(req);
  const next = normalizeLabDesignPresets(req.body);
  if (!next) throw new ApiError(400, "프리셋이 하나 이상 있어야 합니다.");
  const anchor = await BusinessAnchor.findByIdAndUpdate(
    id,
    { $set: { labDesignPresets: { ...next, updatedAt: new Date() } } },
    { new: true },
  )
    .select({ labDesignPresets: 1 })
    .lean();
  return res.status(200).json(new ApiResponse(200, view(anchor)));
});
