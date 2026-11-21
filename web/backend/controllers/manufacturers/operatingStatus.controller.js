// related files:
// - web/backend/modules/manufacturer/manufacturer.routes.js
// - web/backend/models/businessAnchor.model.js
import BusinessAnchor from "../../models/businessAnchor.model.js";

async function loadManufacturerAnchor(req) {
  const anchorId = req.user?.businessAnchorId;
  if (!anchorId) return null;
  return BusinessAnchor.findOne({
    _id: anchorId,
    businessType: "manufacturer",
  });
}

export async function getManufacturerOperatingStatus(req, res) {
  const anchor = await loadManufacturerAnchor(req);
  if (!anchor) {
    return res
      .status(404)
      .json({ success: false, message: "제조사 사업자를 찾을 수 없습니다." });
  }
  return res.status(200).json({
    success: true,
    data: {
      operatingStatus: anchor.operatingStatus === "paused" ? "paused" : "running",
      productionControl:
        anchor.productionControl === "self" ? "self" : "platform",
    },
  });
}

export async function updateManufacturerOperatingStatus(req, res) {
  if (req.user?.subRole && req.user.subRole !== "owner") {
    return res
      .status(403)
      .json({ success: false, message: "대표만 가동을 바꿀 수 있습니다." });
  }
  const next = String(req.body?.operatingStatus || "").trim();
  if (next !== "running" && next !== "paused") {
    return res
      .status(400)
      .json({ success: false, message: "가동 상태가 올바르지 않습니다." });
  }
  const anchor = await loadManufacturerAnchor(req);
  if (!anchor) {
    return res
      .status(404)
      .json({ success: false, message: "제조사 사업자를 찾을 수 없습니다." });
  }
  anchor.operatingStatus = next;
  await anchor.save();
  return res.status(200).json({
    success: true,
    data: { operatingStatus: anchor.operatingStatus },
  });
}
