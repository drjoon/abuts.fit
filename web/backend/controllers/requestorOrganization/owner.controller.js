import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import { resolveOwnedOrg, resolvePrimaryOwnedOrg } from "./utils.js";

export async function getPendingJoinRequestsForOwner(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    if (!req.user.organizationId) {
      return res.status(403).json({
        success: false,
        message: "기공소 정보가 설정되지 않았습니다.",
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: req.user.organizationId,
      $or: [{ owner: req.user._id }, { coOwners: req.user._id }],
    })
      .populate({
        path: "joinRequests.user",
        select: "name email",
        match: { deletedAt: null },
      })
      .lean();

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "기공소를 찾을 수 없습니다.",
      });
    }

    const pending = (org.joinRequests || []).filter(
      (r) => r?.status === "pending" && r?.user
    );

    return res.json({
      success: true,
      data: {
        organizationId: org._id,
        organizationName: org.name,
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
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const org = await resolveOwnedOrg(req);
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 조회할 수 있습니다.",
      });
    }

    const full = await RequestorOrganization.findById(org._id)
      .populate({
        path: "owner",
        select: "name email",
        match: { deletedAt: null },
      })
      .populate({
        path: "coOwners",
        select: "name email",
        match: { deletedAt: null },
      })
      .select({ name: 1, owner: 1, coOwners: 1 })
      .lean();

    const representatives = [];
    if (full?.owner?._id || full?.owner) {
      representatives.push({
        _id: String(full.owner._id || full.owner),
        name: String(full.owner.name || ""),
        email: String(full.owner.email || ""),
      });
    }
    if (Array.isArray(full?.coOwners)) {
      full.coOwners.forEach((c) => {
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
        organizationId: String(full?._id || org._id),
        organizationName: String(full?.name || ""),
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

export async function addCoOwner(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const org = await resolvePrimaryOwnedOrg(req);
    if (!org) {
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

    if (String(targetUser.role) !== "requestor") {
      return res.status(400).json({
        success: false,
        message: "의뢰자 계정만 공동대표로 추가할 수 있습니다.",
      });
    }

    const targetId = String(targetUser._id);
    if (String(org.owner) === targetId) {
      return res.status(409).json({
        success: false,
        message: "이미 주대표입니다.",
      });
    }

    if (
      Array.isArray(org.coOwners) &&
      org.coOwners.some((c) => String(c) === targetId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 공동대표입니다.",
      });
    }

    const existingOrgId = String(targetUser.organizationId || "");
    if (existingOrgId && existingOrgId !== String(org._id)) {
      return res.status(409).json({
        success: false,
        message: "이미 다른 기공소에 소속되어 있습니다.",
      });
    }

    if (!Array.isArray(org.coOwners)) org.coOwners = [];
    org.coOwners.push(new Types.ObjectId(targetId));

    if (!Array.isArray(org.members)) org.members = [];
    if (!org.members.some((m) => String(m) === targetId)) {
      org.members.push(new Types.ObjectId(targetId));
    }

    if (Array.isArray(org.joinRequests)) {
      org.joinRequests = org.joinRequests.filter(
        (r) => String(r?.user) !== targetId
      );
    }

    await org.save();

    await User.findByIdAndUpdate(targetId, {
      $set: {
        organizationId: org._id,
        organization: org.name,
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

export async function removeCoOwner(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const org = await resolvePrimaryOwnedOrg(req);
    if (!org) {
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

    const before = Array.isArray(org.coOwners) ? org.coOwners.length : 0;
    org.coOwners = Array.isArray(org.coOwners)
      ? org.coOwners.filter((c) => String(c) !== String(userId))
      : [];

    const after = org.coOwners.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "공동대표를 찾을 수 없습니다.",
      });
    }

    await org.save();

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
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    if (!req.user.organizationId) {
      return res.status(403).json({
        success: false,
        message: "기공소 정보가 설정되지 않았습니다.",
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: req.user.organizationId,
      $or: [{ owner: req.user._id }, { coOwners: req.user._id }],
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
        path: "coOwners",
        select: "name email",
        match: { deletedAt: null },
      })
      .select({ name: 1, owner: 1, coOwners: 1, members: 1 })
      .lean();

    if (!org) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 조회할 수 있습니다.",
      });
    }

    const ownerId = String((org.owner && org.owner._id) || org.owner || "");
    const coOwnerIds = Array.isArray(org.coOwners)
      ? org.coOwners.map((c) => String((c && c._id) || c || ""))
      : [];
    const members = Array.isArray(org.members) ? org.members : [];
    const staff = members
      .filter((m) => {
        const id = String((m && m._id) || m || "");
        if (!id) return false;
        if (id === ownerId) return false;
        if (coOwnerIds.includes(id)) return false;
        return true;
      })
      .map((m) => ({
        _id: String((m && m._id) || m || ""),
        name: String((m && m.name) || ""),
        email: String((m && m.email) || ""),
      }));

    return res.json({
      success: true,
      data: {
        organizationId: String(org._id),
        organizationName: String(org.name),
        staff,
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

export async function removeStaffMember(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const org = await resolveOwnedOrg(req);
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    if (String(org.owner) === String(userId)) {
      return res.status(409).json({
        success: false,
        message: "대표자는 삭제할 수 없습니다.",
      });
    }

    if (
      Array.isArray(org.coOwners) &&
      org.coOwners.some((c) => String((c && c._id) || c) === String(userId))
    ) {
      return res.status(409).json({
        success: false,
        message: "공동대표는 삭제할 수 없습니다.",
      });
    }

    const before = Array.isArray(org.members) ? org.members.length : 0;
    org.members = Array.isArray(org.members)
      ? org.members.filter((m) => String(m) !== String(userId))
      : [];

    if (Array.isArray(org.joinRequests)) {
      org.joinRequests = org.joinRequests.filter(
        (r) => String(r?.user) !== String(userId)
      );
    }

    const after = org.members.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "직원을 찾을 수 없습니다.",
      });
    }

    await org.save();

    await User.findByIdAndUpdate(userId, {
      $set: { organizationId: null, organization: "" },
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

export async function approveJoinRequest(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const org = await resolveOwnedOrg(req);
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 승인할 수 있습니다.",
      });
    }

    const requestedRole = String(req.body?.role || "staff")
      .trim()
      .toLowerCase();
    if (!["staff", "representative"].includes(requestedRole)) {
      return res.status(400).json({
        success: false,
        message: "role은 representative 또는 staff여야 합니다.",
      });
    }

    const jr = (org.joinRequests || []).find(
      (r) => String(r?.user) === String(userId)
    );
    if (!jr) {
      return res.status(404).json({
        success: false,
        message: "소속 신청을 찾을 수 없습니다.",
      });
    }

    jr.status = "approved";
    jr.approvedRole = requestedRole;

    const userObjectId = new Types.ObjectId(userId);

    if (requestedRole === "representative") {
      if (!Array.isArray(org.coOwners)) org.coOwners = [];
      if (
        !org.coOwners.some((c) => String((c && c._id) || c) === String(userId))
      ) {
        org.coOwners.push(userObjectId);
      }
      if (Array.isArray(org.members)) {
        org.members = org.members.filter((m) => String(m) !== String(userId));
      }
    } else {
      if (!Array.isArray(org.members)) org.members = [];
      if (!org.members.some((m) => String(m) === String(userId))) {
        org.members.push(userObjectId);
      }
    }
    await org.save();

    await User.findByIdAndUpdate(userId, {
      $set: {
        organization: org.name,
        organizationId: org._id,
      },
    });

    return res.json({ success: true, data: { status: "approved" } });
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
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const org = await resolveOwnedOrg(req);
    if (!org) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 거절할 수 있습니다.",
      });
    }

    const jr = (org.joinRequests || []).find(
      (r) => String(r?.user) === String(userId)
    );
    if (!jr) {
      return res.status(404).json({
        success: false,
        message: "소속 신청을 찾을 수 없습니다.",
      });
    }

    jr.status = "rejected";
    await org.save();

    return res.json({ success: true, data: { status: "rejected" } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 신청 거절 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
