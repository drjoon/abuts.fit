// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import {
  resolveAffiliatedBusiness,
  resolveOwnedBusiness,
  resolvePrimaryOwnedBusiness,
  seedUserRequestSettingsFromAnchor,
} from "./business.utils.js";
import { assertBusinessRole } from "./businessRole.util.js";
import {
  enrichMemberWithDepartment,
  loadAnchorDepartmentsForStaff,
  resolveApprovedDepartmentId,
  resolveApprovedDepartmentIds,
} from "./business.department.controller.js";
import {
  createOwnerStaffAccounts,
  resetOwnedStaffPassword,
} from "../../services/staffBulkRegister.service.js";
import { toStaffListFields } from "../../services/staffBulkRegister.core.js";
import { invalidateAuthUserCache } from "../../middlewares/auth.middleware.js";
import { emitAppEventToUser } from "../../socket.js";
import {
  collectMemberDepartmentIds,
  ensureDefaultDepartments,
  getDefaultDepartmentSpecs,
  rejectUnlessStaffDirectoryManager,
  setUserDepartmentIds,
} from "../../utils/internalDepartments.util.js";

export async function getPendingJoinRequestsForOwner(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const myBusinessAnchorId = String(req.user?.businessAnchorId || "").trim();
    if (!myBusinessAnchorId || !Types.ObjectId.isValid(myBusinessAnchorId)) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const anchor = await resolveOwnedBusiness(req, businessType);
    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const populated = await BusinessAnchor.findById(anchor._id)
      .populate({
        path: "joinRequests.user",
        select: "name email",
        match: { deletedAt: null },
      })
      .lean();

    const pending = (populated?.joinRequests || []).filter(
      (r) => r?.status === "pending" && r?.user,
    );

    return res.json({
      success: true,
      data: {
        businessId: populated?._id || anchor._id,
        businessName: populated?.name || anchor.name,
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

    const anchor = await resolveAffiliatedBusiness(req, businessType);
    if (!anchor) {
      return res.status(403).json({
        success: false,
        message: "소속된 사업자가 없습니다.",
      });
    }

    const full = await BusinessAnchor.findById(anchor._id)
      .populate({
        path: "primaryContactUserId",
        select: "name email loginId internalDepartmentId internalDepartmentIds",
        match: { deletedAt: null },
      })
      .populate({
        path: "owners",
        select: "name email loginId internalDepartmentId internalDepartmentIds",
        match: { deletedAt: null },
      })
      .select({ name: 1, primaryContactUserId: 1, owners: 1, businessType: 1 })
      .lean();

    const { usesDepartments, departmentMap } = await loadAnchorDepartmentsForStaff(
      full?._id || anchor._id,
    );

    const representatives = [];
    const seen = new Set();
    const pushRep = (row) => {
      if (!row) return;
      const id = String(row._id || row);
      if (!id || seen.has(id)) return;
      seen.add(id);
      representatives.push(
        usesDepartments
          ? enrichMemberWithDepartment(row, departmentMap)
          : {
              _id: id,
              name: String(row.name || ""),
              ...toStaffListFields(row),
            },
      );
    };

    pushRep(full?.primaryContactUserId);
    if (Array.isArray(full?.owners)) {
      full.owners.forEach((c) => pushRep(c));
    }

    return res.json({
      success: true,
      data: {
        businessId: String(full?._id || anchor._id),
        businessName: String(full?.name || ""),
        representatives,
        usesDepartments,
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

    const anchor = await resolvePrimaryOwnedBusiness(req, businessType);
    if (!anchor) {
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
      targetUser = await User.findById(userIdRaw).select({
        role: 1,
        email: 1,
        businessAnchorId: 1,
      });
    } else if (emailRaw) {
      targetUser = await User.findOne({ email: emailRaw }).select({
        role: 1,
        email: 1,
        businessAnchorId: 1,
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
    if (String(anchor.primaryContactUserId) === targetId) {
      return res.status(409).json({
        success: false,
        message: "이미 주대표입니다.",
      });
    }

    if (
      Array.isArray(anchor.owners) &&
      anchor.owners.some((c) => String(c) === targetId)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 공동대표입니다.",
      });
    }

    const existingBusinessAnchorId = String(targetUser.businessAnchorId || "");
    if (
      existingBusinessAnchorId &&
      existingBusinessAnchorId !== String(anchor._id)
    ) {
      return res.status(409).json({
        success: false,
        message: "이미 다른 사업자에 소속되어 있습니다.",
      });
    }

    if (!Array.isArray(anchor.owners)) anchor.owners = [];
    anchor.owners.push(new Types.ObjectId(targetId));

    if (!Array.isArray(anchor.members)) anchor.members = [];
    if (!anchor.members.some((m) => String(m) === targetId)) {
      anchor.members.push(new Types.ObjectId(targetId));
    }

    if (Array.isArray(anchor.joinRequests)) {
      anchor.joinRequests = anchor.joinRequests.filter(
        (r) => String(r?.user) !== targetId,
      );
    }

    await anchor.save();

    await User.findByIdAndUpdate(targetId, {
      $set: {
        businessAnchorId: anchor._id,
        business: anchor.name,
      },
    });
    await seedUserRequestSettingsFromAnchor(targetId, anchor);
    const ensured = await ensureDefaultDepartments(anchor);
    const specs = getDefaultDepartmentSpecs(ensured).filter((row) => row.key);
    if (specs.length > 0) {
      const defaultIds = specs
        .map((spec) =>
          (ensured.internalDepartments || []).find(
            (row) =>
              String(row?.key || "") === spec.key ||
              String(row?.name || "").trim() === spec.name,
          ),
        )
        .map((row) => row?._id)
        .filter(Boolean);
      const target = await User.findById(targetId).select({
        internalDepartmentId: 1,
        internalDepartmentIds: 1,
      });
      if (target && collectMemberDepartmentIds(target).length === 0 && defaultIds.length) {
        await setUserDepartmentIds(targetId, defaultIds);
        invalidateAuthUserCache(targetId);
      }
    }

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

    const anchor = await resolvePrimaryOwnedBusiness(req, businessType);
    if (!anchor) {
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

    const before = Array.isArray(anchor.owners) ? anchor.owners.length : 0;
    anchor.owners = Array.isArray(anchor.owners)
      ? anchor.owners.filter((c) => String(c) !== String(userId))
      : [];

    const after = anchor.owners.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "공동대표를 찾을 수 없습니다.",
      });
    }

    await anchor.save();

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

    const anchorDoc = await resolveAffiliatedBusiness(req, businessType);
    if (!anchorDoc) {
      return res.status(403).json({
        success: false,
        message: "소속된 사업자가 없습니다.",
      });
    }

    const anchor = await BusinessAnchor.findById(anchorDoc._id)
      .populate({
        path: "members",
        select: "name email loginId internalDepartmentId internalDepartmentIds",
        match: { deletedAt: null },
      })
      .populate({
        path: "primaryContactUserId",
        select: "name email loginId internalDepartmentId internalDepartmentIds",
        match: { deletedAt: null },
      })
      .populate({
        path: "owners",
        select: "name email loginId internalDepartmentId internalDepartmentIds",
        match: { deletedAt: null },
      })
      .select({
        name: 1,
        primaryContactUserId: 1,
        owners: 1,
        members: 1,
        businessType: 1,
        requestorKind: 1,
      })
      .lean();

    if (!anchor) {
      return res.status(403).json({
        success: false,
        message: "소속된 사업자가 없습니다.",
      });
    }

    const { usesDepartments, departmentMap, departments } =
      await loadAnchorDepartmentsForStaff(anchor._id);

    const ownerId = String(
      (anchor.primaryContactUserId && anchor.primaryContactUserId._id) ||
        anchor.primaryContactUserId ||
        "",
    );
    const ownerIds = Array.isArray(anchor.owners)
      ? anchor.owners.map((c) => String((c && c._id) || c || ""))
      : [];
    const representatives = [];
    const seenRepIds = new Set();
    if (ownerId) {
      seenRepIds.add(ownerId);
      const row = anchor.primaryContactUserId;
      representatives.push(
        usesDepartments
          ? enrichMemberWithDepartment(row, departmentMap)
          : {
              _id: ownerId,
              name: String((row && row.name) || ""),
              ...toStaffListFields(row),
            },
      );
    }
    if (Array.isArray(anchor.owners)) {
      anchor.owners.forEach((c) => {
        const id = String((c && c._id) || c || "");
        if (!id || seenRepIds.has(id)) return;
        seenRepIds.add(id);
        representatives.push(
          usesDepartments
            ? enrichMemberWithDepartment(c, departmentMap)
            : {
                _id: id,
                name: String((c && c.name) || ""),
                ...toStaffListFields(c),
              },
        );
      });
    }

    const allRepIds = new Set([ownerId, ...ownerIds].filter(Boolean));

    const staffMembers = [];
    if (Array.isArray(anchor.members)) {
      anchor.members.forEach((m) => {
        const id = String((m && m._id) || m || "");
        if (!id || allRepIds.has(id)) return;
        staffMembers.push(
          usesDepartments
            ? enrichMemberWithDepartment(m, departmentMap)
            : {
                _id: id,
                name: String((m && m.name) || ""),
                ...toStaffListFields(m),
              },
        );
      });
    }

    return res.json({
      success: true,
      data: {
        businessId: String(anchor._id),
        businessName: String(anchor.name || ""),
        representatives,
        staffMembers,
        usesDepartments,
        departments,
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

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const myBusinessAnchorId = String(req.user?.businessAnchorId || "").trim();
    if (!myBusinessAnchorId || !Types.ObjectId.isValid(myBusinessAnchorId)) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const anchor = await resolveOwnedBusiness(req, businessType);

    if (!anchor) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 승인할 수 있습니다.",
      });
    }

    const joinRequest = (anchor.joinRequests || []).find(
      (r) => String(r?.user) === userId && r?.status === "pending",
    );

    if (!joinRequest) {
      return res.status(404).json({
        success: false,
        message: "대기 중인 소속 신청을 찾을 수 없습니다.",
      });
    }

    let departmentId = null;
    let departmentName = "";
    const deptResolved = await resolveApprovedDepartmentId(
      anchor._id,
      req.body?.departmentId,
    );
    if (deptResolved.error) {
      return res.status(400).json({
        success: false,
        message: deptResolved.error,
      });
    }
    if (deptResolved.departmentId) {
      departmentId = deptResolved.departmentId;
      departmentName = deptResolved.departmentName || "";
    }

    joinRequest.status = "approved";

    if (!Array.isArray(anchor.members)) anchor.members = [];
    if (!anchor.members.some((m) => String(m) === userId)) {
      anchor.members.push(new Types.ObjectId(userId));
    }

    await anchor.save();

    const userUpdate = {
      businessAnchorId: anchor._id,
      business: anchor.name,
      subRole: "staff",
      onboardingWizardCompleted: true,
    };
    if (departmentId) {
      userUpdate.internalDepartmentId = departmentId;
      userUpdate.internalDepartmentIds = [departmentId];
    }

    // 직원으로 승인 및 온보딩 완료 처리
    await User.findByIdAndUpdate(userId, {
      $set: userUpdate,
    });
    await seedUserRequestSettingsFromAnchor(userId, anchor);

    return res.json({
      success: true,
      data: {
        approved: true,
        departmentId: departmentId ? String(departmentId) : null,
        departmentName,
      },
    });
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

    const anchor = await resolveOwnedBusiness(req, businessType);
    if (!anchor) {
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

    const joinRequest = (anchor.joinRequests || []).find(
      (r) => String(r?.user) === userId && r?.status === "pending",
    );

    if (!joinRequest) {
      return res.status(404).json({
        success: false,
        message: "대기 중인 소속 신청을 찾을 수 없습니다.",
      });
    }

    joinRequest.status = "rejected";
    await anchor.save();

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

    const anchor = await resolveAffiliatedBusiness(req, businessType);
    if (!anchor) {
      return res.status(403).json({
        success: false,
        message: "소속된 사업자가 없습니다.",
      });
    }
    if (rejectUnlessStaffDirectoryManager(res, req.user, anchor)) {
      return;
    }

    const userId = String(req.params.userId || "").trim();
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    if (String(anchor.primaryContactUserId) === userId) {
      return res.status(409).json({
        success: false,
        message: "주대표는 삭제할 수 없습니다.",
      });
    }

    const isOwner =
      Array.isArray(anchor.owners) &&
      anchor.owners.some((c) => String(c) === userId);
    if (isOwner) {
      return res.status(409).json({
        success: false,
        message:
          "공동대표는 삭제할 수 없습니다. 먼저 공동대표에서 제외해주세요.",
      });
    }

    const before = Array.isArray(anchor.members) ? anchor.members.length : 0;
    anchor.members = Array.isArray(anchor.members)
      ? anchor.members.filter((m) => String(m) !== userId)
      : [];

    const after = anchor.members.length;
    if (before === after) {
      return res.status(404).json({
        success: false,
        message: "직원을 찾을 수 없습니다.",
      });
    }

    await anchor.save();

    const removed = await User.findById(userId).select({ loginId: 1 }).lean();
    const update = {
      $set: { businessAnchorId: null, business: "" },
    };
    // 대표가 만든 아이디 계정은 로그인되지 않게 하고, 같은 이름을 다시 등록할 수 있게 한다.
    // 아이디만 지워도 합성 이메일이 남아 같은 이름 재등록이 막힌다.
    if (String(removed?.loginId || "").trim()) {
      update.$set.active = false;
      update.$set.email = `retired-${userId}@staff.abuts.fit`;
      update.$unset = { loginId: "" };
    }
    await User.findByIdAndUpdate(userId, update);
    invalidateAuthUserCache(userId);
    emitAppEventToUser(userId, "auth:session-revoked", { reason: "removed" });

    return res.json({ success: true, data: { removed: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직원 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function bulkCreateStaff(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const anchor = await resolveAffiliatedBusiness(req, businessType);
    if (!anchor) {
      return res.status(403).json({
        success: false,
        message: "소속된 사업자가 없습니다.",
      });
    }
    if (rejectUnlessStaffDirectoryManager(res, req.user, anchor)) {
      return;
    }

    const owner = await User.findById(req.user._id)
      .select({
        role: 1,
        requestorKind: 1,
        practiceHasInHouseLab: 1,
        requestorServices: 1,
      })
      .lean();
    if (!owner) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 직원을 등록할 수 있습니다.",
      });
    }

    const deptContext = await loadAnchorDepartmentsForStaff(anchor._id);
    const rawGroups = Array.isArray(req.body?.groups) ? req.body.groups : null;
    let groups = null;
    let departmentId = null;
    let departmentIds = [];
    let departmentNames = [];
    let text = String(req.body?.text || "");

    if (rawGroups) {
      groups = [];
      for (const item of rawGroups) {
        const groupText = String(item?.text || "");
        if (!groupText.trim()) continue;
        let groupDepartmentId = null;
        let departmentName = "";
        if (deptContext.usesDepartments) {
          const deptResolved = await resolveApprovedDepartmentId(
            anchor._id,
            item?.departmentId,
          );
          if (deptResolved.error) {
            return res.status(400).json({
              success: false,
              message:
                deptResolved.error === "승인할 부서를 선택해주세요."
                  ? "배치할 부서를 선택해주세요."
                  : deptResolved.error,
            });
          }
          groupDepartmentId = deptResolved.departmentId || null;
          departmentName = deptResolved.departmentName || "";
        }
        groups.push({
          departmentId: groupDepartmentId,
          departmentName,
          text: groupText,
        });
      }
      if (!groups.length) {
        return res.status(400).json({
          success: false,
          message: "등록할 직원 이름을 적어 주세요.",
        });
      }
      text = "";
    } else if (deptContext.usesDepartments) {
      const requestedIds = Array.isArray(req.body?.departmentIds)
        ? req.body.departmentIds
        : req.body?.departmentId == null || req.body?.departmentId === ""
          ? []
          : [req.body.departmentId];
      const deptResolved = await resolveApprovedDepartmentIds(
        anchor._id,
        requestedIds,
      );
      if (deptResolved.error) {
        return res.status(400).json({
          success: false,
          message:
            deptResolved.error === "승인할 부서를 선택해주세요."
              ? "배치할 부서를 선택해주세요."
              : deptResolved.error,
        });
      }
      departmentIds = deptResolved.departmentIds || [];
      departmentNames = deptResolved.departmentNames || [];
      departmentId = departmentIds[0] || null;
    }

    const result = await createOwnerStaffAccounts({
      anchor,
      owner,
      password: String(req.body?.password || ""),
      text,
      departmentId,
      departmentIds,
      departmentNames,
      groups,
    });

    return res.status(result.status).json({
      success: result.status < 400,
      message: result.message || undefined,
      data: {
        created: result.created || [],
        failed: result.failed || [],
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직원 등록 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function resetStaffPassword(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const anchor = await resolveAffiliatedBusiness(req, businessType);
    if (!anchor) {
      return res.status(403).json({
        success: false,
        message: "소속된 사업자가 없습니다.",
      });
    }
    if (rejectUnlessStaffDirectoryManager(res, req.user, anchor)) {
      return;
    }

    const result = await resetOwnedStaffPassword({
      anchor,
      userId: req.params.userId,
      password: String(req.body?.password || ""),
    });
    if (result.status >= 400) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }
    return res.json({ success: true, data: { reset: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "비밀번호를 다시 정하지 못했습니다.",
      error: error.message,
    });
  }
}
