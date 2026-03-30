import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { generateRandomPassword } from "./admin.shared.controller.js";
import { emitReferralMembershipChanged } from "../../services/requestSnapshotTriggers.service.js";

export async function getAllUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
        { originalEmail: { $regex: req.query.search, $options: "i" } },
        { business: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1;
    }

    const users = await User.find(filter)
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const userIds = users
      .map((u) => u?._id)
      .filter((id) => Types.ObjectId.isValid(String(id)));
    const businessIds = users
      .map((u) => u?.businessId)
      .filter((id) => Types.ObjectId.isValid(String(id)));
    const businesses = businessIds.length
      ? await BusinessAnchor.find({ _id: { $in: businessIds } })
          .select({
            name: 1,
            businessLicense: 1,
            metadata: 1,
            verification: 1,
          })
          .lean()
      : [];
    const businessMap = new Map(
      businesses.map((org) => [String(org._id), org]),
    );

    const requestCounts = await Request.aggregate([
      {
        $match: {
          requestor: { $in: userIds },
          status: { $ne: "취소" },
        },
      },
      {
        $group: {
          _id: "$requestor",
          count: { $sum: 1 },
        },
      },
    ]);
    const countMap = new Map(
      requestCounts.map((r) => [String(r._id), Number(r.count || 0)]),
    );

    const usersWithStats = users.map((u) => {
      const businessInfo = businessMap.get(String(u.businessId || ""));
      const hasLicense =
        Boolean(businessInfo?.businessLicense?.s3Key) ||
        Boolean(businessInfo?.businessLicense?.fileId);
      const unresolvedBusiness =
        hasLicense && businessInfo?.verification?.verified === false;
      return {
        ...u,
        totalRequests: countMap.get(String(u._id)) || 0,
        businessInfo: businessInfo || null,
        unresolvedBusiness,
      };
    });

    const total = await User.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function createUser(req, res) {
  try {
    const name = String(req.body?.name || "").trim() || "사용자";
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const role = String(req.body?.role || "requestor").trim();
    const business = String(req.body?.business || "").trim();
    const passwordRaw = String(req.body?.password || "");
    const autoActivate = Boolean(req.body?.autoActivate);

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "이메일은 필수입니다." });
    }

    const validRoles = [
      "requestor",
      "manufacturer",
      "admin",
      "salesman",
      "devops",
    ];
    if (!validRoles.includes(role)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 역할입니다." });
    }

    const existing = await User.findOne({ email }).select({ _id: 1 }).lean();
    if (existing?._id) {
      return res
        .status(409)
        .json({ success: false, message: "이미 존재하는 이메일입니다." });
    }

    const tempPassword = passwordRaw || generateRandomPassword();
    const approvedAt = autoActivate ? new Date() : null;
    const active = autoActivate ? true : false;

    const user = new User({
      name,
      email,
      password: tempPassword,
      role,
      business,
      requestorRole: role === "requestor" ? "owner" : null,
      manufacturerRole: role === "manufacturer" ? "owner" : null,
      adminRole: role === "admin" ? "owner" : null,
      approvedAt,
      active,
    });
    await user.save();

    const fresh = await User.findById(user._id).select("-password").lean();
    return res.status(201).json({
      success: true,
      data: {
        user: fresh,
        tempPassword: passwordRaw ? null : tempPassword,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function approveUser(req, res) {
  try {
    const userId = req.params.id;
    if (!Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    if (!user.approvedAt) user.approvedAt = new Date();
    user.active = true;
    await user.save();
    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        approvedAt: user.approvedAt,
        active: user.active,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자 승인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function rejectUser(req, res) {
  try {
    const userId = req.params.id;
    if (!Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    user.active = false;
    user.approvedAt = null;
    await user.save();
    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        approvedAt: user.approvedAt,
        active: user.active,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자 거절 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getUserById(req, res) {
  try {
    const userId = req.params.id;
    if (!Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    const businessInfo = user?.businessId
      ? await BusinessAnchor.findById(user.businessId)
          .select({
            name: 1,
            businessLicense: 1,
            extracted: 1,
            verification: 1,
          })
          .lean()
      : null;
    const hasLicense =
      Boolean(businessInfo?.businessLicense?.s3Key) ||
      Boolean(businessInfo?.businessLicense?.fileId);
    const unresolvedBusiness =
      hasLicense && businessInfo?.verification?.verified === false;
    res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        businessInfo: businessInfo || null,
        unresolvedBusiness,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateUser(req, res) {
  try {
    const userId = req.params.id;
    const updateData = req.body;
    if (!Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
    }
    delete updateData.password;
    delete updateData.email;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    if (
      userId === req.user.id &&
      updateData.role &&
      req.user.role === "admin" &&
      updateData.role !== "admin"
    ) {
      return res.status(400).json({
        success: false,
        message: "자기 자신의 관리자 권한을 제거할 수 없습니다.",
      });
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true },
    ).select("-password");
    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    res.status(200).json({
      success: true,
      message: "사용자 정보가 성공적으로 수정되었습니다.",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 정보 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function toggleUserActive(req, res) {
  try {
    const userId = req.params.id;
    if (!Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "자기 자신을 비활성화할 수 없습니다.",
      });
    }
    user.active = !user.active;
    if (user.active && !user.approvedAt) user.approvedAt = new Date();
    await user.save();
    res.status(200).json({
      success: true,
      message: `사용자가 ${user.active ? "활성화" : "비활성화"}되었습니다.`,
      data: { userId: user._id, active: user.active },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 활성화/비활성화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function changeUserRole(req, res) {
  try {
    const userId = req.params.id;
    const {
      role,
      requestorRole = null,
      manufacturerRole = null,
      adminRole = null,
    } = req.body || {};
    if (!Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
    }
    const validRoles = ["requestor", "manufacturer", "admin", "salesman"];
    if (!validRoles.includes(role)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 역할입니다." });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    const isSelf = user._id.equals(req.user._id);
    if (isSelf && role !== user.role) {
      return res.status(400).json({
        success: false,
        message: "자기 자신의 역할을 변경할 수 없습니다.",
      });
    }
    if (isSelf) {
      if (
        (user.role === "admin" && adminRole && adminRole !== user.adminRole) ||
        (user.role === "manufacturer" &&
          manufacturerRole &&
          manufacturerRole !== user.manufacturerRole) ||
        (user.role === "requestor" &&
          requestorRole &&
          requestorRole !== user.requestorRole)
      ) {
        return res.status(400).json({
          success: false,
          message: "자기 자신의 서브역할을 변경할 수 없습니다.",
        });
      }
    }
    user.role = role;
    if (role === "admin") {
      user.adminRole = adminRole || "owner";
      user.manufacturerRole = null;
      user.requestorRole = null;
    } else if (role === "manufacturer") {
      user.manufacturerRole = manufacturerRole || "owner";
      user.adminRole = null;
      user.requestorRole = null;
    } else if (role === "devops") {
      user.adminRole = null;
      user.manufacturerRole = null;
      user.requestorRole = null;
    } else {
      user.requestorRole = requestorRole || "owner";
      user.adminRole = null;
      user.manufacturerRole = null;
    }
    await user.save();
    res.status(200).json({
      success: true,
      message: "사용자 역할이 성공적으로 변경되었습니다.",
      data: { userId: user._id, role: user.role },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 역할 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

const ensureValidDeleteTarget = async ({ userId, adminId }) => {
  if (!Types.ObjectId.isValid(userId)) {
    return {
      status: 400,
      body: { success: false, message: "유효하지 않은 사용자 ID입니다." },
    };
  }
  if (String(userId) === String(adminId)) {
    return {
      status: 400,
      body: { success: false, message: "자기 자신을 삭제할 수 없습니다." },
    };
  }
  const user = await User.findById(userId);
  if (!user) {
    return {
      status: 404,
      body: { success: false, message: "사용자를 찾을 수 없습니다." },
    };
  }
  return { user };
};

const deleteUserCore = async ({ user, includeBusiness }) => {
  const deletedUserSummary = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    businessId: user.businessId || null,
    businessAnchorId: user.businessAnchorId || null,
  };
  const userId = user._id;
  const businessId = user.businessId;
  const businessAnchorId = user.businessAnchorId;
  const referredByAnchorId = user.referredByAnchorId;

  if (businessId) {
    await BusinessAnchor.updateMany(
      {},
      {
        $pull: {
          owners: userId,
          members: userId,
          joinRequests: { user: userId },
        },
      },
    );
  }

  let deletedBusiness = null;
  let deletedBusinessAnchor = null;

  if (includeBusiness) {
    if (!businessId || !Types.ObjectId.isValid(String(businessId))) {
      throw new Error("사업자가 연결되지 않은 계정입니다.");
    }

    const business = await BusinessAnchor.findById(businessId);
    if (!business) {
      throw new Error("연결된 사업자를 찾을 수 없습니다.");
    }

    const linkedUsers = await User.countDocuments({
      _id: { $ne: userId },
      businessId: business._id,
    });
    if (linkedUsers > 0) {
      throw new Error(
        "다른 계정도 이 사업자에 연결되어 있어 사업자 포함 삭제를 진행할 수 없습니다.",
      );
    }

    if (
      Array.isArray(business.joinRequests) &&
      business.joinRequests.some(
        (row) => String(row?.user || "") !== String(userId),
      )
    ) {
      throw new Error(
        "다른 계정의 가입 신청이 남아 있어 사업자 포함 삭제를 진행할 수 없습니다.",
      );
    }

    deletedBusiness = {
      _id: business._id,
      name: business.name,
      businessAnchorId: String(business._id),
    };

    if (businessAnchorId && Types.ObjectId.isValid(String(businessAnchorId))) {
      const anchorLinkedUsers = await User.countDocuments({
        _id: { $ne: userId },
        businessAnchorId,
      });
      const childAnchors = await BusinessAnchor.countDocuments({
        referredByAnchorId: businessAnchorId,
      });

      if (
        anchorLinkedUsers > 0 ||
        anchorLinkedBusinesses > 0 ||
        childAnchors > 0
      ) {
        throw new Error(
          "다른 데이터가 이 business anchor를 참조하고 있어 사업자 포함 삭제를 완료할 수 없습니다.",
        );
      }

      const anchor = await BusinessAnchor.findById(businessAnchorId)
        .select({ _id: 1, name: 1 })
        .lean();
      if (anchor?._id) {
        deletedBusinessAnchor = {
          _id: anchor._id,
          name: anchor.name,
        };
        await BusinessAnchor.deleteOne({ _id: businessAnchorId });
      }
    }

    await BusinessAnchor.deleteOne({ _id: business._id });
  }
  await User.updateOne(
    { _id: userId },
    { $set: { active: false, deletedAt: new Date() } },
  );
  await User.deleteOne({ _id: userId });

  if (
    includeBusiness &&
    Types.ObjectId.isValid(String(referredByAnchorId || ""))
  ) {
    emitReferralMembershipChanged(
      String(referredByAnchorId),
      "admin-delete-user-with-business",
    );
  }

  return {
    deletedUser: deletedUserSummary,
    deletedBusiness,
    deletedBusinessAnchor,
  };
};

export async function deleteUserWithBusiness(req, res) {
  try {
    const userId = req.params.id;
    const adminId = req.user.id;
    const validation = await ensureValidDeleteTarget({ userId, adminId });
    if (!validation.user) {
      return res.status(validation.status).json(validation.body);
    }

    const result = await deleteUserCore({
      user: validation.user,
      includeBusiness: true,
    });

    return res.status(200).json({
      success: true,
      message: "사용자와 연결된 사업자가 성공적으로 삭제되었습니다.",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자 포함 계정 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteUser(req, res) {
  try {
    const userId = req.params.id;
    const adminId = req.user.id;
    const validation = await ensureValidDeleteTarget({ userId, adminId });
    if (!validation.user) {
      return res.status(validation.status).json(validation.body);
    }
    const result = await deleteUserCore({
      user: validation.user,
      includeBusiness: false,
    });
    res.status(200).json({
      success: true,
      message: "사용자가 성공적으로 삭제되었습니다.",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
