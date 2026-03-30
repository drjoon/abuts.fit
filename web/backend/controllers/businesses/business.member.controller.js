import Business from "../../models/business.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
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

    // BusinessAnchor가 SSOT이므로 먼저 조회
    let anchor = await BusinessAnchor.findOne({
      _id: businessId,
      businessType,
    });

    // BusinessAnchor가 없으면 Business 조회 (레거시 호환)
    let business = null;
    if (!anchor) {
      business = await Business.findOne({
        _id: businessId,
        ...buildBusinessTypeFilter(businessType),
      });

      if (!business) {
        return res.status(404).json({
          success: false,
          message: "사업자를 찾을 수 없습니다.",
        });
      }

      // Business에 연결된 BusinessAnchor 조회
      if (business.businessAnchorId) {
        anchor = await BusinessAnchor.findById(business.businessAnchorId);
      }
    }

    // BusinessAnchor가 있으면 연결된 Business 조회
    if (anchor && !business) {
      business = await Business.findOne({
        businessAnchorId: anchor._id,
      });
    }

    const meId = String(req.user._id);

    // BusinessAnchor 기준 검증
    if (anchor) {
      const anchorOwnerId = String(anchor.primaryContactUserId || "");
      if (anchorOwnerId === meId) {
        return res.status(409).json({
          success: false,
          message: "이미 대표자입니다.",
        });
      }

      if (
        Array.isArray(anchor.owners) &&
        anchor.owners.some((o) => String(o) === meId)
      ) {
        return res.status(409).json({
          success: false,
          message: "이미 공동대표입니다.",
        });
      }

      if (
        Array.isArray(anchor.members) &&
        anchor.members.some((m) => String(m) === meId)
      ) {
        return res.status(409).json({
          success: false,
          message: "이미 소속되어 있습니다.",
        });
      }

      const existing = Array.isArray(anchor.joinRequests)
        ? anchor.joinRequests.find((r) => String(r?.user) === meId)
        : null;

      if (existing) {
        existing.status = "pending";
        await anchor.save();

        // Business도 동기화
        if (business) {
          const businessExisting = Array.isArray(business.joinRequests)
            ? business.joinRequests.find((r) => String(r?.user) === meId)
            : null;
          if (businessExisting) {
            businessExisting.status = "pending";
          } else {
            business.joinRequests.push({
              user: req.user._id,
              status: "pending",
            });
          }
          await business.save();
        }

        return res.json({ success: true, data: { status: "pending" } });
      }

      anchor.joinRequests.push({ user: req.user._id, status: "pending" });
      await anchor.save();

      // Business도 동기화
      if (business) {
        business.joinRequests.push({ user: req.user._id, status: "pending" });
        await business.save();
      }

      return res
        .status(201)
        .json({ success: true, data: { status: "pending" } });
    }

    // BusinessAnchor가 없으면 Business만 사용 (레거시)
    if (business) {
      if (
        req.user.businessId &&
        String(req.user.businessId) !== String(business._id)
      ) {
        return res.status(409).json({
          success: false,
          message: "이미 다른 사업자에 소속되어 있습니다.",
        });
      }

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

      return res
        .status(201)
        .json({ success: true, data: { status: "pending" } });
    }

    return res.status(404).json({
      success: false,
      message: "사업자를 찾을 수 없습니다.",
    });
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

    const businessId = readBusinessId(req.params.businessId);
    if (!Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    const anchor = await BusinessAnchor.findOne({
      _id: businessId,
      businessType,
    });
    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const meId = String(req.user._id);
    if (String(anchor.primaryContactUserId) === meId) {
      return res.status(409).json({
        success: false,
        message: "대표자는 소속 신청을 취소할 수 없습니다.",
      });
    }

    if (
      Array.isArray(anchor.members) &&
      anchor.members.some((m) => String(m) === meId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 소속되어 있습니다.",
      });
    }

    const before = Array.isArray(anchor.joinRequests)
      ? anchor.joinRequests.length
      : 0;
    anchor.joinRequests = Array.isArray(anchor.joinRequests)
      ? anchor.joinRequests.filter(
          (r) => !(String(r?.user) === meId && String(r?.status) === "pending"),
        )
      : [];

    const after = anchor.joinRequests.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "취소할 소속 신청이 없습니다.",
      });
    }

    await anchor.save();

    const currentBusinessName = String(req.user.business || "").trim();
    if (
      currentBusinessName &&
      currentBusinessName === String(anchor.name || "").trim()
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { business: "", businessAnchorId: null },
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

    const businessId = readBusinessId(req.params.businessId);
    if (!Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    const anchor = await BusinessAnchor.findOne({
      _id: businessId,
      businessType,
    });
    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const meId = String(req.user._id);
    if (String(anchor.primaryContactUserId) === meId) {
      return res.status(409).json({
        success: false,
        message: "대표자는 소속을 취소할 수 없습니다.",
      });
    }

    const isMember =
      Array.isArray(anchor.members) &&
      anchor.members.some((m) => String(m) === meId);

    const hasJoinRequest =
      Array.isArray(anchor.joinRequests) &&
      anchor.joinRequests.some((r) => String(r?.user) === meId);

    if (!isMember && !hasJoinRequest) {
      return res.status(404).json({
        success: false,
        message: "취소할 소속 정보가 없습니다.",
      });
    }

    if (isMember) {
      anchor.members = Array.isArray(anchor.members)
        ? anchor.members.filter((m) => String(m) !== meId)
        : [];
    }

    if (hasJoinRequest) {
      anchor.joinRequests = Array.isArray(anchor.joinRequests)
        ? anchor.joinRequests.filter((r) => String(r?.user) !== meId)
        : [];
    }

    await anchor.save();

    if (String(req.user.businessAnchorId || "") === String(anchor._id)) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { businessAnchorId: null, business: "" },
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
