import Business from "../../models/business.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import {
  resolveOwnedBusiness,
  resolvePrimaryOwnedBusiness,
} from "./business.utils.js";
import { assertBusinessRole } from "./businessRole.util.js";

function readUserBusinessId(user) {
  return String(user?.businessId || "").trim();
}

export async function getPendingJoinRequestsForOwner(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const myBusinessId = readUserBusinessId(req.user);
    if (!myBusinessId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const business = await Business.findOne({
      _id: myBusinessId,
      ...buildBusinessTypeFilter(businessType),
      $or: [{ owner: req.user._id }, { owners: req.user._id }],
    })
      .populate({
        path: "joinRequests.user",
        select: "name email",
        match: { deletedAt: null },
      })
      .lean();

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const pending = (business.joinRequests || []).filter(
      (r) => r?.status === "pending" && r?.user,
    );

    return res.json({
      success: true,
      data: {
        businessId: business._id,
        businessName: business.name,
        joinRequests: pending,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "대기 소속 신청 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getRepresentatives(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const business = await resolveOwnedBusiness(req, businessType);
    if (!business) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 조회할 수 있습니다.",
      });
    }

    const full = await Business.findById(business._id)
      .populate({
        path: "owner",
        select: "name email",
        match: { deletedAt: null },
      })
      .populate({
        path: "owners",
        select: "name email",
        match: { deletedAt: null },
      })
      .select({ name: 1, owner: 1, owners: 1 })
      .lean();

    const representatives = [];
    if (full?.owner?._id || full?.owner) {
      representatives.push({
        _id: String(full.owner._id || full.owner),
        name: String(full.owner.name || ""),
        email: String(full.owner.email || ""),
      });
    }
    if (Array.isArray(full?.owners)) {
      full.owners.forEach((c) => {
        if (!c) return;
        representatives.push({
          _id: String(c._id || c),
          name: String(c.name || ""),
          email: String(c.email || ""),
        });
      });
    }

    return res.json({
      success: true,
      data: {
        businessId: String(full?._id || business._id),
        businessName: String(full?.name || ""),
        representatives,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "공동대표 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function addOwner(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const business = await resolvePrimaryOwnedBusiness(req, businessType);
    if (!business) {
      return res.status(403).json({
        success: false,
        message: "주대표 계정만 공동대표를 추가할 수 있습니다.",
      });
    }

    const userIdRaw = String(req.body?.userId || "").trim();
    const emailRaw = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    let targetUser = null;
    if (userIdRaw && Types.ObjectId.isValid(userIdRaw)) {
      targetUser = await User.findById(userIdRaw).select({ role: 1, email: 1 });
    } else if (emailRaw) {
      targetUser = await User.findOne({ email: emailRaw }).select({
        role: 1,
        email: 1,
      });
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    if (String(targetUser.role) !== businessType) {
      return res.status(400).json({
        success: false,
        message: "같은 역할의 계정만 공동대표로 추가할 수 있습니다.",
      });
    }

    const targetId = String(targetUser._id);
    if (String(business.owner) === targetId) {
      return res.status(409).json({
        success: false,
        message: "이미 주대표입니다.",
      });
    }

    if (
      Array.isArray(business.owners) &&
      business.owners.some((c) => String(c) === targetId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 공동대표입니다.",
      });
    }

    const existingBusinessId = String(targetUser.businessId || "");
    if (existingBusinessId && existingBusinessId !== String(business._id)) {
      return res.status(409).json({
        success: false,
        message: "이미 다른 사업자에 소속되어 있습니다.",
      });
    }

    if (!Array.isArray(business.owners)) business.owners = [];
    business.owners.push(new Types.ObjectId(targetId));

    if (!Array.isArray(business.members)) business.members = [];
    if (!business.members.some((m) => String(m) === targetId)) {
      business.members.push(new Types.ObjectId(targetId));
    }

    if (Array.isArray(business.joinRequests)) {
      business.joinRequests = business.joinRequests.filter(
        (r) => String(r?.user) !== targetId,
      );
    }

    await business.save();

    await User.findByIdAndUpdate(targetId, {
      $set: {
        businessId: business._id,
        business: business.name,
      },
    });

    return res.status(201).json({ success: true, data: { added: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "공동대표 추가 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function removeOwner(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const business = await resolvePrimaryOwnedBusiness(req, businessType);
    if (!business) {
      return res.status(403).json({
        success: false,
        message: "주대표 계정만 공동대표를 삭제할 수 있습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const before = Array.isArray(business.owners) ? business.owners.length : 0;
    business.owners = Array.isArray(business.owners)
      ? business.owners.filter((c) => String(c) !== String(userId))
      : [];

    const after = business.owners.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "공동대표를 찾을 수 없습니다.",
      });
    }

    await business.save();

    return res.json({ success: true, data: { removed: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "공동대표 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMyStaffMembers(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const myBusinessId = readUserBusinessId(req.user);
    if (!myBusinessId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const business = await Business.findOne({
      _id: myBusinessId,
      ...buildBusinessTypeFilter(businessType),
      $or: [{ owner: req.user._id }, { owners: req.user._id }],
    })
      .populate({
        path: "members",
        select: "name email",
        match: { deletedAt: null },
      })
      .populate({
        path: "owner",
        select: "name email",
        match: { deletedAt: null },
      })
      .populate({
        path: "owners",
        select: "name email",
        match: { deletedAt: null },
      })
      .select({ name: 1, owner: 1, owners: 1, members: 1 })
      .lean();

    if (!business) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 조회할 수 있습니다.",
      });
    }

    const ownerId = String(
      (business.owner && business.owner._id) || business.owner || "",
    );
    const ownerIds = Array.isArray(business.owners)
      ? business.owners.map((c) => String((c && c._id) || c || ""))
      : [];
    const representatives = [];
    if (ownerId) {
      representatives.push({
        _id: ownerId,
        name: String((business.owner && business.owner.name) || ""),
        email: String((business.owner && business.owner.email) || ""),
      });
    }
    if (Array.isArray(business.owners)) {
      business.owners.forEach((c) => {
        const id = String((c && c._id) || c || "");
        if (!id) return;
        representatives.push({
          _id: id,
          name: String((c && c.name) || ""),
          email: String((c && c.email) || ""),
        });
      });
    }

    const allRepIds = new Set([ownerId, ...ownerIds].filter(Boolean));

    const staffMembers = [];
    if (Array.isArray(business.members)) {
      business.members.forEach((m) => {
        const id = String((m && m._id) || m || "");
        if (!id || allRepIds.has(id)) return;
        staffMembers.push({
          _id: id,
          name: String((m && m.name) || ""),
          email: String((m && m.email) || ""),
        });
      });
    }

    return res.json({
      success: true,
      data: {
        businessId: String(business._id),
        businessName: String(business.name || ""),
        representatives,
        staffMembers,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직원 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function approveJoinRequest(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const business = await resolveOwnedBusiness(req, businessType);
    if (!business) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 승인할 수 있습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const joinRequest = (business.joinRequests || []).find(
      (r) => String(r?.user) === userId && r?.status === "pending",
    );

    if (!joinRequest) {
      return res.status(404).json({
        success: false,
        message: "대기 중인 소속 신청을 찾을 수 없습니다.",
      });
    }

    joinRequest.status = "approved";

    if (!Array.isArray(business.members)) business.members = [];
    if (!business.members.some((m) => String(m) === userId)) {
      business.members.push(new Types.ObjectId(userId));
    }

    await business.save();

    await User.findByIdAndUpdate(userId, {
      $set: {
        businessId: business._id,
        business: business.name,
      },
    });

    return res.json({ success: true, data: { approved: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 신청 승인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function rejectJoinRequest(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const business = await resolveOwnedBusiness(req, businessType);
    if (!business) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 거절할 수 있습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const joinRequest = (business.joinRequests || []).find(
      (r) => String(r?.user) === userId && r?.status === "pending",
    );

    if (!joinRequest) {
      return res.status(404).json({
        success: false,
        message: "대기 중인 소속 신청을 찾을 수 없습니다.",
      });
    }

    joinRequest.status = "rejected";
    await business.save();

    return res.json({ success: true, data: { rejected: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 신청 거절 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function removeMember(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const business = await resolveOwnedBusiness(req, businessType);
    if (!business) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 직원을 삭제할 수 있습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    if (String(business.owner) === userId) {
      return res.status(409).json({
        success: false,
        message: "주대표는 삭제할 수 없습니다.",
      });
    }

    const isOwner =
      Array.isArray(business.owners) &&
      business.owners.some((c) => String(c) === userId);
    if (isOwner) {
      return res.status(409).json({
        success: false,
        message:
          "공동대표는 삭제할 수 없습니다. 먼저 공동대표에서 제외해주세요.",
      });
    }

    const before = Array.isArray(business.members)
      ? business.members.length
      : 0;
    business.members = Array.isArray(business.members)
      ? business.members.filter((m) => String(m) !== userId)
      : [];

    const after = business.members.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "직원을 찾을 수 없습니다.",
      });
    }

    await business.save();

    await User.findByIdAndUpdate(userId, {
      $set: { businessId: null, business: "" },
    });

    return res.json({ success: true, data: { removed: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직원 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
