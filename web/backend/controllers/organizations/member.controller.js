import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import {
  assertOrganizationRole,
  buildOrganizationTypeFilter,
} from "./organizationRole.util.js";

export async function requestJoinOrganization(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const organizationId = String(req.body?.organizationId || "").trim();
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "organizationId가 필요합니다.",
      });
    }

    if (!Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 organizationId입니다.",
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: organizationId,
      ...orgTypeFilter,
    });
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
      return res.json({ success: true, data: { status: "pending" } });
    }

    org.joinRequests.push({ user: req.user._id, status: "pending" });
    await org.save();

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
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const organizationId = String(req.params.organizationId || "").trim();
    if (!Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 organizationId입니다.",
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: organizationId,
      ...orgTypeFilter,
    });
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "기공소를 찾을 수 없습니다.",
      });
    }

    const meId = String(req.user._id);
    if (String(org.owner) === meId) {
      return res.status(409).json({
        success: false,
        message: "대표자는 소속 신청을 취소할 수 없습니다.",
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

    const before = Array.isArray(org.joinRequests)
      ? org.joinRequests.length
      : 0;
    org.joinRequests = Array.isArray(org.joinRequests)
      ? org.joinRequests.filter(
          (r) => !(String(r?.user) === meId && String(r?.status) === "pending"),
        )
      : [];

    const after = org.joinRequests.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "취소할 소속 신청이 없습니다.",
      });
    }

    await org.save();

    const currentOrgName = String(req.user.organization || "").trim();
    if (currentOrgName && currentOrgName === String(org.name || "").trim()) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organization: "", organizationId: null },
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

export async function leaveOrganization(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const organizationId = String(req.params.organizationId || "").trim();
    if (!Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 organizationId입니다.",
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: organizationId,
      ...orgTypeFilter,
    });
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "기공소를 찾을 수 없습니다.",
      });
    }

    const meId = String(req.user._id);
    if (String(org.owner) === meId) {
      return res.status(409).json({
        success: false,
        message: "대표자는 소속을 취소할 수 없습니다.",
      });
    }

    const isMember =
      Array.isArray(org.members) && org.members.some((m) => String(m) === meId);

    const hasJoinRequest =
      Array.isArray(org.joinRequests) &&
      org.joinRequests.some((r) => String(r?.user) === meId);

    if (!isMember && !hasJoinRequest) {
      return res.status(404).json({
        success: false,
        message: "취소할 소속 정보가 없습니다.",
      });
    }

    if (isMember) {
      org.members = Array.isArray(org.members)
        ? org.members.filter((m) => String(m) !== meId)
        : [];
    }

    if (hasJoinRequest) {
      org.joinRequests = Array.isArray(org.joinRequests)
        ? org.joinRequests.filter((r) => String(r?.user) !== meId)
        : [];
    }

    await org.save();

    if (String(req.user.organizationId || "") === String(org._id)) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: null, organization: "" },
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
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const orgs = await RequestorOrganization.find({
      ...orgTypeFilter,
      "joinRequests.user": req.user._id,
    })
      .select({ name: 1, joinRequests: 1 })
      .lean();

    const meId = String(req.user._id);
    const data = orgs
      .map((org) => {
        const jr = (org.joinRequests || []).find(
          (r) => String(r?.user) === meId,
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
