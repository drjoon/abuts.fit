import RequestorOrganization from "../models/requestorOrganization.model.js";
import User from "../models/user.model.js";
import { Types } from "mongoose";
import s3Utils from "../utils/s3.utils.js";
import File from "../models/file.model.js";

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
        if (String(req.user.referralCode || "").startsWith("mock_")) {
          org = await RequestorOrganization.findOne({ name: orgName });
          if (!org) {
            org = await RequestorOrganization.create({
              name: orgName,
              owner: req.user._id,
              coOwners: [],
              members: [req.user._id],
              joinRequests: [],
            });
            await User.findByIdAndUpdate(req.user._id, {
              $set: { organizationId: org._id, organization: org.name },
            });
          }
        } else {
          const matches = await RequestorOrganization.find({ name: orgName })
            .select({ _id: 1 })
            .limit(2)
            .lean();
          if (Array.isArray(matches) && matches.length === 1) {
            org = await RequestorOrganization.findById(matches[0]._id);
          } else {
            await User.findByIdAndUpdate(req.user._id, {
              $set: { organization: "", organizationId: null },
            });
          }
        }
      }
    }

    if (!org) {
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
        },
      });
    }

    const ownerId = String(org.owner);
    const meId = String(req.user._id);
    const isCoOwner =
      Array.isArray(org.coOwners) &&
      org.coOwners.some((c) => String(c) === meId);

    let membership = "none";
    if (ownerId === meId || isCoOwner) {
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

    if (
      req.user.organizationId &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: null, organization: "" },
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
        },
      });
    }

    if (
      !req.user.organizationId &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: org._id },
      });
    }

    const safeOrg = {
      _id: org._id,
      name: org.name,
      owner: org.owner,
    };

    const businessNumber = String(org?.extracted?.businessNumber || "").trim();
    const hasBusinessNumber = !!businessNumber;
    const businessVerified = !!org?.verification?.verified;

    return res.json({
      success: true,
      data: {
        membership,
        organization: safeOrg,
        hasBusinessNumber,
        businessVerified,
        extracted: org?.extracted || {},
        businessLicense: org?.businessLicense || {},
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

export async function searchOrganizations(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const orgs = await RequestorOrganization.find({
      $or: [{ name: regex }, { "extracted.representativeName": regex }],
    })
      .select({ name: 1, extracted: 1 })
      .limit(20)
      .lean();

    const data = (orgs || []).map((o) => ({
      _id: o._id,
      name: o.name,
      representativeName: o?.extracted?.representativeName || "",
      businessNumber: o?.extracted?.businessNumber || "",
      address: o?.extracted?.address || "",
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공소 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateMyOrganization(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const normalizeBusinessNumber = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (digits.length !== 10) return "";
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    };

    const normalizePhoneNumber = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (!digits.startsWith("0")) return "";
      if (digits.startsWith("02")) {
        if (digits.length === 9)
          return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
        if (digits.length === 10)
          return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
        return "";
      }
      if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      if (digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
      }
      return "";
    };

    const isValidEmail = (input) => {
      const v = String(input || "").trim();
      if (!v) return false;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    };

    const isValidAddress = (input) => {
      const v = String(input || "").trim();
      return v.length >= 5;
    };

    if (!req.user.organizationId) {
      return res.status(403).json({
        success: false,
        message: "기공소 정보가 설정되지 않았습니다.",
      });
    }

    const org = await RequestorOrganization.findById(req.user.organizationId);
    const meId = String(req.user._id);
    const canEdit =
      org &&
      (String(org.owner) === meId ||
        (Array.isArray(org.coOwners) &&
          org.coOwners.some((c) => String(c) === meId)));
    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 수정할 수 있습니다.",
      });
    }

    const nextName = String(req.body?.name || "").trim();
    const representativeName = String(
      req.body?.representativeName || ""
    ).trim();
    const businessItem = String(req.body?.businessItem || "").trim();
    const phoneNumberRaw = String(req.body?.phoneNumber || "").trim();
    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    const businessType = String(req.body?.businessType || "").trim();
    const email = String(req.body?.email || "").trim();
    const address = String(req.body?.address || "").trim();

    const phoneNumber = phoneNumberRaw
      ? normalizePhoneNumber(phoneNumberRaw)
      : "";
    const businessNumber = businessNumberRaw
      ? normalizeBusinessNumber(businessNumberRaw)
      : "";

    if (phoneNumberRaw && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "전화번호 형식이 올바르지 않습니다.",
      });
    }

    if (businessNumberRaw && !businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "세금계산서 이메일 형식이 올바르지 않습니다.",
      });
    }

    if (address && !isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "주소 형식이 올바르지 않습니다.",
      });
    }

    const patch = {};
    if (nextName) patch.name = nextName;

    const extractedPatch = {};
    if (representativeName)
      extractedPatch.representativeName = representativeName;
    if (businessItem) extractedPatch.businessItem = businessItem;
    if (phoneNumber) extractedPatch.phoneNumber = phoneNumber;
    if (businessNumber) extractedPatch.businessNumber = businessNumber;
    if (businessType) extractedPatch.businessType = businessType;
    if (email) extractedPatch.email = email;
    if (address) extractedPatch.address = address;

    if (Object.keys(extractedPatch).length > 0) {
      patch.extracted = {
        ...(org.extracted ? org.extracted.toObject?.() || org.extracted : {}),
        ...extractedPatch,
      };
    }

    if (Object.keys(patch).length === 0) {
      return res.json({ success: true, data: { updated: false } });
    }

    await RequestorOrganization.findByIdAndUpdate(org._id, { $set: patch });

    if (nextName && String(req.user.organization || "") !== nextName) {
      await User.updateMany(
        { organizationId: org._id },
        { $set: { organization: nextName } }
      );
    }

    return res.json({ success: true, data: { updated: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공소 정보 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearMyBusinessLicense(req, res) {
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

    const org = await RequestorOrganization.findById(req.user.organizationId);
    const meId = String(req.user._id);
    const canEdit =
      org &&
      (String(org.owner) === meId ||
        (Array.isArray(org.coOwners) &&
          org.coOwners.some((c) => String(c) === meId)));
    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    const key = String(org?.businessLicense?.s3Key || "").trim();
    if (key) {
      try {
        await s3Utils.deleteFileFromS3(key);
      } catch {}
    }

    const fileId = String(org?.businessLicense?.fileId || "").trim();
    if (fileId) {
      try {
        await File.findByIdAndDelete(fileId);
      } catch {}
    }

    await RequestorOrganization.findByIdAndUpdate(req.user.organizationId, {
      $set: {
        businessLicense: {
          fileId: null,
          s3Key: "",
          originalName: "",
          uploadedAt: null,
        },
        extracted: {
          companyName: "",
          businessNumber: "",
          address: "",
          phoneNumber: "",
          email: "",
          representativeName: "",
          businessType: "",
          businessItem: "",
        },
        verification: {
          verified: false,
          provider: "",
          message: "",
          checkedAt: null,
        },
      },
    });

    return res.json({ success: true, data: { cleared: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자등록증 삭제 중 오류가 발생했습니다.",
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

    const org = await RequestorOrganization.findById(organizationId);
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
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 organizationId입니다.",
      });
    }

    const org = await RequestorOrganization.findById(organizationId);
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
          (r) => !(String(r?.user) === meId && String(r?.status) === "pending")
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
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 organizationId입니다.",
      });
    }

    const org = await RequestorOrganization.findById(organizationId);
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
      $or: [{ owner: req.user._id }, { coOwners: req.user._id }],
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
  const meId = req.user?._id;
  const org = await RequestorOrganization.findOne({
    _id: orgId,
    $or: [{ owner: meId }, { coOwners: meId }],
  });
  return org;
}

async function resolvePrimaryOwnedOrg(req) {
  const orgId = req.user?.organizationId;
  if (!orgId) return null;
  const org = await RequestorOrganization.findOne({
    _id: orgId,
    owner: req.user._id,
  });
  return org;
}

export async function getCoOwners(req, res) {
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
      .populate({ path: "owner", select: "name email" })
      .populate({ path: "coOwners", select: "name email" })
      .select({ name: 1, owner: 1, coOwners: 1 })
      .lean();

    const owner = full?.owner
      ? {
          _id: String(full.owner._id || full.owner),
          name: String(full.owner.name || ""),
          email: String(full.owner.email || ""),
        }
      : null;

    const coOwners = Array.isArray(full?.coOwners)
      ? full.coOwners.map((c) => ({
          _id: String(c?._id || c),
          name: String(c?.name || ""),
          email: String(c?.email || ""),
        }))
      : [];

    return res.json({
      success: true,
      data: {
        organizationId: String(full?._id || org._id),
        organizationName: String(full?.name || ""),
        owner,
        coOwners,
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
        position: "vice_principal",
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

    await User.findByIdAndUpdate(userId, {
      $set: { position: "staff" },
    });

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
      .populate({ path: "members", select: "name email" })
      .populate({ path: "owner", select: "name email" })
      .populate({ path: "coOwners", select: "name email" })
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
      $set: {
        organization: org.name,
        organizationId: org._id,
        position: "staff",
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
