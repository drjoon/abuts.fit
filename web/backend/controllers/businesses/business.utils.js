// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import {
  buildOrgBusinessTypeQuery,
  isCompatibleOrgBusinessType,
} from "../../utils/orgBusinessType.util.js";

export async function resolveOwnedBusiness(req, businessType) {
  const meId = req.user?._id;
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      $or: [{ primaryContactUserId: meId }, { owners: meId }],
    });
    if (byAnchor && isCompatibleOrgBusinessType(businessType, byAnchor)) {
      return byAnchor;
    }
  }

  return await BusinessAnchor.findOne({
    ...buildOrgBusinessTypeQuery(businessType),
    $or: [{ primaryContactUserId: meId }, { owners: meId }],
  }).sort({ updatedAt: -1, createdAt: -1 });
}

export async function resolvePrimaryOwnedBusiness(req, businessType) {
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      primaryContactUserId: req.user._id,
    });
    if (byAnchor && isCompatibleOrgBusinessType(businessType, byAnchor)) {
      return byAnchor;
    }
  }

  return await BusinessAnchor.findOne({
    ...buildOrgBusinessTypeQuery(businessType),
    primaryContactUserId: req.user._id,
  }).sort({ updatedAt: -1, createdAt: -1 });
}

/**
 * 신규 소속 시 BA.requestSettings → User.requestSettings 1회 시드(이미 있으면 유지).
 */
export function buildRequestSettingsSeedFromAnchor(anchor) {
  const rs = anchor?.requestSettings || {};
  const seed = {};
  const designSoftware = String(rs.designSoftware || "").trim();
  if (designSoftware) {
    seed["requestSettings.designSoftware"] = designSoftware;
    if (designSoftware === "ExoCAD") {
      const exo = String(rs.exoCadVersion || "").trim();
      if (exo === "le_3_0" || exo === "ge_3_2") {
        seed["requestSettings.exoCadVersion"] = exo;
      }
    } else {
      seed["requestSettings.exoCadVersion"] = null;
    }
  }
  if (typeof rs.anodizingEnabled === "boolean") {
    seed["requestSettings.anodizingEnabled"] = rs.anodizingEnabled;
  }
  const rg = String(rs.retentionGroove || "").trim().toLowerCase();
  if (rg === "deep" || rg === "none" || rg === "shallow") {
    seed["requestSettings.retentionGroove"] = rg === "deep" ? "deep" : "none";
  }
  if (Array.isArray(rs.hexByImplantManufacturer) && rs.hexByImplantManufacturer.length) {
    seed["requestSettings.hexByImplantManufacturer"] = rs.hexByImplantManufacturer;
  }
  seed["requestSettings.updatedAt"] = new Date();
  return seed;
}

export async function seedUserRequestSettingsFromAnchor(userId, anchor) {
  if (!userId || !anchor) return false;
  const seed = buildRequestSettingsSeedFromAnchor(anchor);
  if (!Object.keys(seed).length) return false;

  const emptyFilter = {
    _id: userId,
    $or: [
      { "requestSettings.designSoftware": { $exists: false } },
      { "requestSettings.designSoftware": null },
      { "requestSettings.designSoftware": "" },
    ],
  };
  const result = await User.updateOne(emptyFilter, { $set: seed });
  return Number(result?.modifiedCount || 0) > 0;
}
