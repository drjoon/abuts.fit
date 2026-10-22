// related files:
// - web/backend/utils/labPracticeScrewSupply.js
// - web/backend/modules/businesses/business.routes.js
// - web/frontend/src/features/requestSettings/useLabPracticeScrewSupply.ts
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  normalizeScrewSupply,
  persistLabPracticeScrewSupply,
  toLabPracticeScrewSupplyPublic,
  toPracticeNameKey,
} from "../../utils/labPracticeScrewSupply.js";

export async function getMyLabPracticeScrewSupplies(req, res) {
  const labId = String(req.user?.businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(labId)) {
    return res.status(200).json({ success: true, data: { supplies: [] } });
  }
  const anchor = await BusinessAnchor.findById(labId)
    .select({ labPracticeScrewSupplies: 1 })
    .lean();
  const supplies = (Array.isArray(anchor?.labPracticeScrewSupplies)
    ? anchor.labPracticeScrewSupplies
    : []
  )
    .map((row) => toLabPracticeScrewSupplyPublic(row))
    .filter(Boolean);
  return res.status(200).json({ success: true, data: { supplies } });
}

export async function putMyLabPracticeScrewSupply(req, res) {
  const labId = String(req.user?.businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(labId)) {
    return res.status(400).json({
      success: false,
      message: "사업체 정보가 없어 스크류 기본값을 저장할 수 없습니다.",
    });
  }
  const screwSupply = normalizeScrewSupply(req.body?.screwSupply);
  if (!screwSupply) {
    return res.status(400).json({
      success: false,
      message: "스크류는 어벗츠 또는 제조사 중 하나여야 합니다.",
    });
  }
  const practiceName = String(req.body?.practiceName || "").trim();
  const practiceAnchorId = String(req.body?.practiceAnchorId || "").trim();
  if (!toPracticeNameKey(practiceName) && !Types.ObjectId.isValid(practiceAnchorId)) {
    return res.status(400).json({
      success: false,
      message: "치과 정보가 필요합니다.",
    });
  }
  const preference = await persistLabPracticeScrewSupply({
    labAnchorId: labId,
    practiceAnchorId,
    practiceName,
    screwSupply,
  });
  if (!preference) {
    return res.status(404).json({
      success: false,
      message: "사업체를 찾지 못했습니다.",
    });
  }
  return res.status(200).json({
    success: true,
    data: { screwSupply, preference },
  });
}
