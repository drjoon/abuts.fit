// related files:
// - web/backend/models/implantBrandProducerMatch.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/ImplantBrandProducerMatchDialog.tsx
import crypto from "crypto";
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import ImplantBrandProducerMatch from "../../models/implantBrandProducerMatch.model.js";
import { listImplantBrandRows } from "../../utils/implantCanonical.js";

function asId(value) {
  const id = String(value || "").trim();
  if (!id) return null;
  if (!Types.ObjectId.isValid(id)) return undefined;
  return id;
}

async function manufacturerRows() {
  const anchors = await BusinessAnchor.find({ businessType: "manufacturer" })
    .select({
      name: 1,
      productionControl: 1,
      operatingStatus: 1,
    })
    .sort({ name: 1 })
    .lean();
  const ids = anchors.map((row) => row._id);
  const users = ids.length
    ? await User.find({
        role: "manufacturer",
        businessAnchorId: { $in: ids },
        active: true,
        approvedAt: { $ne: null },
        deletedAt: null,
      })
        .select({ businessAnchorId: 1, subRole: 1 })
        .lean()
    : [];
  const ownerByAnchor = new Map();
  for (const user of users) {
    const key = String(user.businessAnchorId || "");
    const current = ownerByAnchor.get(key);
    if (!current || user.subRole === "owner") {
      ownerByAnchor.set(key, String(user._id));
    }
  }
  return anchors.map((row) => ({
    anchorId: String(row._id),
    ownerUserId: ownerByAnchor.get(String(row._id)) || "",
    name: String(row.name || "").trim() || "제조사",
    operatingStatus: row.operatingStatus === "paused" ? "paused" : "running",
    productionControl: row.productionControl === "self" ? "self" : "platform",
    approved: ownerByAnchor.has(String(row._id)),
  }));
}

export async function getImplantProducerMatches(_req, res) {
  try {
    const [brands, stored, manufacturers] = await Promise.all([
      Promise.resolve(listImplantBrandRows()),
      ImplantBrandProducerMatch.find({})
        .select({
          brandKey: 1,
          defaultManufacturerAnchorId: 1,
          alternateManufacturerAnchorId: 1,
        })
        .lean(),
      manufacturerRows(),
    ]);
    const byKey = new Map(stored.map((row) => [row.brandKey, row]));
    return res.status(200).json({
      success: true,
      data: {
        brands: brands.map((brand) => {
          const saved = byKey.get(brand.brandKey);
          return {
            ...brand,
            defaultManufacturerAnchorId: saved?.defaultManufacturerAnchorId
              ? String(saved.defaultManufacturerAnchorId)
              : "",
            alternateManufacturerAnchorId: saved?.alternateManufacturerAnchorId
              ? String(saved.alternateManufacturerAnchorId)
              : "",
          };
        }),
        manufacturers,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "매칭을 불러오지 못했습니다.",
    });
  }
}

export async function saveImplantProducerMatches(req, res) {
  try {
    const manufacturers = await manufacturerRows();
    const allowed = new Set(manufacturers.map((row) => row.anchorId));
    const catalog = new Map(
      listImplantBrandRows().map((row) => [row.brandKey, row]),
    );
    const matches = Array.isArray(req.body?.matches) ? req.body.matches : [];
    const operating = Array.isArray(req.body?.operating) ? req.body.operating : [];
    const platformAnchorId = asId(req.body?.platformAnchorId);

    if (platformAnchorId === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "플랫폼 제조사 ID가 올바르지 않습니다." });
    }
    if (platformAnchorId && !allowed.has(platformAnchorId)) {
      return res
        .status(400)
        .json({ success: false, message: "플랫폼 제조사를 찾을 수 없습니다." });
    }

    for (const row of matches) {
      const brand = catalog.get(String(row?.brandKey || "").trim());
      if (!brand) continue;
      const defaultId = asId(row?.defaultManufacturerAnchorId);
      const alternateId = asId(row?.alternateManufacturerAnchorId);
      if (defaultId === undefined || alternateId === undefined) {
        return res
          .status(400)
          .json({ success: false, message: "제조사 ID가 올바르지 않습니다." });
      }
      if (
        (defaultId && !allowed.has(defaultId)) ||
        (alternateId && !allowed.has(alternateId))
      ) {
        return res
          .status(400)
          .json({ success: false, message: "승인 목록에 없는 제조사입니다." });
      }
      await ImplantBrandProducerMatch.findOneAndUpdate(
        { brandKey: brand.brandKey },
        {
          $set: {
            implantManufacturer: brand.implantManufacturer,
            implantBrand: brand.implantBrand,
            defaultManufacturerAnchorId: defaultId,
            alternateManufacturerAnchorId: alternateId,
          },
        },
        { upsert: true, new: true },
      );
    }

    for (const row of operating) {
      const anchorId = asId(row?.anchorId);
      const status = String(row?.operatingStatus || "").trim();
      if (!anchorId || !allowed.has(anchorId)) continue;
      if (status !== "running" && status !== "paused") continue;
      await BusinessAnchor.updateOne(
        { _id: anchorId, businessType: "manufacturer" },
        { $set: { operatingStatus: status } },
      );
    }

    if (platformAnchorId) {
      await BusinessAnchor.updateMany(
        {
          businessType: "manufacturer",
          _id: { $ne: platformAnchorId },
          productionControl: "platform",
        },
        { $set: { productionControl: "self" } },
      );
      await BusinessAnchor.updateOne(
        { _id: platformAnchorId, businessType: "manufacturer" },
        { $set: { productionControl: "platform" } },
      );
    }

    return getImplantProducerMatches(req, res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "매칭 저장에 실패했습니다.",
    });
  }
}

export async function getManufacturerSignupLink(_req, res) {
  try {
    let settings = await SystemSettings.findOne({ key: "global" });
    if (!settings) {
      settings = await SystemSettings.create({ key: "global" });
    }
    if (!String(settings.manufacturerSignupToken || "").trim()) {
      settings.manufacturerSignupToken = crypto.randomBytes(24).toString("hex");
      await settings.save();
    }
    const token = String(settings.manufacturerSignupToken).trim();
    return res.status(200).json({
      success: true,
      data: { path: `/signup/manufacturer?k=${token}` },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "가입 링크를 만들지 못했습니다.",
    });
  }
}
