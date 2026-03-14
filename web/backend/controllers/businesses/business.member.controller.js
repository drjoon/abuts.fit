import Business from "../../models/business.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import {
  assertBusinessRole,
  buildBusinessTypeFilter,
} from "./businessRole.util.js";

function readBusinessId(value) {
  return String(value || "").trim();
}

export async function requestJoinBusiness(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    const businessId = readBusinessId(req.body?.businessId);
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessId가 필요합니다.",
      });
    }

    if (!Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    const business = await Business.findOne({
      _id: businessId,
      ...typeFilter,
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    if (
      req.user.businessId &&
      String(req.user.businessId) !== String(business._id)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 다른 사업자에 소속되어 있습니다.",
      });
    }

    const meId = String(req.user._id);
    const ownerId = String(business.owner);
    if (ownerId === meId) {
      return res.status(409).json({
        success: false,
        message: "이미 대표자입니다.",
      });
    }

    if (
      Array.isArray(business.members) &&
      business.members.some((m) => String(m) === meId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 소속되어 있습니다.",
      });
    }

    const existing = Array.isArray(business.joinRequests)
      ? business.joinRequests.find((r) => String(r?.user) === meId)
      : null;

    if (existing) {
      existing.status = "pending";
      await business.save();
      return res.json({ success: true, data: { status: "pending" } });
    }

    business.joinRequests.push({ user: req.user._id, status: "pending" });
    await business.save();

    return res.status(201).json({ success: true, data: { status: "pending" } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function cancelJoinRequest(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    const businessId = readBusinessId(req.params.businessId);
    if (!Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    const business = await Business.findOne({
      _id: businessId,
      ...typeFilter,
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const meId = String(req.user._id);
    if (String(business.owner) === meId) {
      return res.status(409).json({
        success: false,
        message: "대표자는 소속 신청을 취소할 수 없습니다.",
      });
    }

    if (
      Array.isArray(business.members) &&
      business.members.some((m) => String(m) === meId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 소속되어 있습니다.",
      });
    }

    const before = Array.isArray(business.joinRequests)
      ? business.joinRequests.length
      : 0;
    business.joinRequests = Array.isArray(business.joinRequests)
      ? business.joinRequests.filter(
          (r) => !(String(r?.user) === meId && String(r?.status) === "pending"),
        )
      : [];

    const after = business.joinRequests.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "취소할 소속 신청이 없습니다.",
      });
    }

    await business.save();

    const currentBusinessName = String(req.user.business || "").trim();
    if (currentBusinessName && currentBusinessName === String(business.name || "").trim()) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { business: "", businessId: null },
      });
    }

    return res.json({ success: true, data: { canceled: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 신청 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function leaveBusiness(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    const businessId = readBusinessId(req.params.businessId);
    if (!Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    const business = await Business.findOne({
      _id: businessId,
      ...typeFilter,
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const meId = String(req.user._id);
    if (String(business.owner) === meId) {
      return res.status(409).json({
        success: false,
        message: "대표자는 소속을 취소할 수 없습니다.",
      });
    }

    const isMember =
      Array.isArray(business.members) && business.members.some((m) => String(m) === meId);

    const hasJoinRequest =
      Array.isArray(business.joinRequests) &&
      business.joinRequests.some((r) => String(r?.user) === meId);

    if (!isMember && !hasJoinRequest) {
      return res.status(404).json({
        success: false,
        message: "취소할 소속 정보가 없습니다.",
      });
    }

    if (isMember) {
      business.members = Array.isArray(business.members)
        ? business.members.filter((m) => String(m) !== meId)
        : [];
    }

    if (hasJoinRequest) {
      business.joinRequests = Array.isArray(business.joinRequests)
        ? business.joinRequests.filter((r) => String(r?.user) !== meId)
        : [];
    }

    await business.save();

    if (String(req.user.businessId || "") === String(business._id)) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { businessId: null, business: "" },
      });
    }

    return res.json({ success: true, data: { left: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMyJoinRequests(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;
    const typeFilter = buildBusinessTypeFilter(businessType);

    const businesses = await Business.find({
      ...typeFilter,
      "joinRequests.user": req.user._id,
    })
      .select({ name: 1, joinRequests: 1 })
      .lean();

    const meId = String(req.user._id);
    const data = businesses
      .map((business) => {
        const jr = (business.joinRequests || []).find(
          (r) => String(r?.user) === meId,
        );
        if (!jr) return null;
        return {
          businessId: business._id,
          businessName: business.name,
          status: jr.status,
          createdAt: jr.createdAt,
        };
      })
      .filter(Boolean);

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "내 소속 신청 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
