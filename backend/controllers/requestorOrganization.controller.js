import RequestorOrganization from "../models/requestorOrganization.model.js";
import User from "../models/user.model.js";
import { Types } from "mongoose";

export async function getMyOrganization(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    let org = null;
    if (req.user.organizationId) {
      org = await RequestorOrganization.findById(req.user.organizationId);
    } else {
      const orgName = String(req.user.organization || "").trim();
      if (orgName) {
        org = await RequestorOrganization.findOne({ name: orgName });
        if (!org && String(req.user.referralCode || "").startsWith("mock_")) {
          org = await RequestorOrganization.create({
            name: orgName,
            owner: req.user._id,
            members: [req.user._id],
            joinRequests: [],
          });
          await User.findByIdAndUpdate(req.user._id, {
            $set: { organizationId: org._id, organization: org.name },
          });
        }
      }
    }

    if (!org) {
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
        },
      });
    }

    const ownerId = String(org.owner);
    const meId = String(req.user._id);

    let membership = "none";
    if (ownerId === meId) {
      membership = "owner";
    } else if (
      Array.isArray(org.members) &&
      org.members.some((m) => String(m) === meId)
    ) {
      membership = "member";
    } else if (
      Array.isArray(org.joinRequests) &&
      org.joinRequests.some(
        (r) => String(r?.user) === meId && String(r?.status) === "pending"
      )
    ) {
      membership = "pending";
    }

    if (req.user.organizationId && membership === "none") {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: null },
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
        },
      });
    }

    if (!req.user.organizationId && membership !== "none") {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: org._id },
      });
    }

    const safeOrg = {
      _id: org._id,
      name: org.name,
      owner: org.owner,
    };

    return res.json({
      success: true,
      data: {
        membership,
        organization: safeOrg,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "내 기공소 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function requestJoinOrganization(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const organizationName = String(req.body?.organizationName || "").trim();
    if (!organizationName) {
      return res.status(400).json({
        success: false,
        message: "organizationName이 필요합니다.",
      });
    }

    const org = await RequestorOrganization.findOne({ name: organizationName });
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "기공소를 찾을 수 없습니다.",
      });
    }

    if (
      req.user.organizationId &&
      String(req.user.organizationId) !== String(org._id)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 다른 기공소에 소속되어 있습니다.",
      });
    }

    const meId = String(req.user._id);
    const ownerId = String(org.owner);
    if (ownerId === meId) {
      return res.status(409).json({
        success: false,
        message: "이미 대표자입니다.",
      });
    }

    if (
      Array.isArray(org.members) &&
      org.members.some((m) => String(m) === meId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 소속되어 있습니다.",
      });
    }

    const existing = Array.isArray(org.joinRequests)
      ? org.joinRequests.find((r) => String(r?.user) === meId)
      : null;

    if (existing) {
      existing.status = "pending";
      await org.save();
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organization: org.name },
      });
      return res.json({ success: true, data: { status: "pending" } });
    }

    org.joinRequests.push({ user: req.user._id, status: "pending" });
    await org.save();

    await User.findByIdAndUpdate(req.user._id, {
      $set: { organization: org.name },
    });

    return res.status(201).json({ success: true, data: { status: "pending" } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소속 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMyJoinRequests(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const orgs = await RequestorOrganization.find({
      "joinRequests.user": req.user._id,
    })
      .select({ name: 1, joinRequests: 1 })
      .lean();

    const meId = String(req.user._id);
    const data = orgs
      .map((org) => {
        const jr = (org.joinRequests || []).find(
          (r) => String(r?.user) === meId
        );
        if (!jr) return null;
        return {
          organizationId: org._id,
          organizationName: org.name,
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
      owner: req.user._id,
    })
      .populate({ path: "joinRequests.user", select: "name email" })
      .lean();

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "기공소를 찾을 수 없습니다.",
      });
    }

    const pending = (org.joinRequests || []).filter(
      (r) => r?.status === "pending"
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

async function resolveOwnedOrg(req) {
  const orgId = req.user?.organizationId;
  if (!orgId) return null;
  const org = await RequestorOrganization.findOne({
    _id: orgId,
    owner: req.user._id,
  });
  return org;
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
    if (!Array.isArray(org.members)) org.members = [];
    if (!org.members.some((m) => String(m) === String(userId))) {
      org.members.push(new Types.ObjectId(userId));
    }
    await org.save();

    await User.findByIdAndUpdate(userId, {
      $set: { organization: org.name, organizationId: org._id },
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
