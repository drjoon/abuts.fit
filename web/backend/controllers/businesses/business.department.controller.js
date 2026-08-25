// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/utils/internalDepartments.util.js
// - web/frontend/src/features/settings/tabs/DepartmentsTab.tsx
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import { resolveOwnedBusiness } from "./business.utils.js";
import { assertBusinessRole } from "./businessRole.util.js";
import {
  ensureAdminDefaultDepartments,
  findDepartmentById,
  normalizeDepartmentName,
  serializeDepartments,
} from "../../utils/internalDepartments.util.js";

async function resolveAdminOwnedAnchor(req, businessType) {
  if (businessType !== "admin") {
    return { error: "부서 관리는 어벗츠(admin) 사업자만 지원합니다." };
  }
  const anchor = await resolveOwnedBusiness(req, businessType);
  if (!anchor) {
    return { error: "대표자 계정만 부서를 관리할 수 있습니다." };
  }
  await ensureAdminDefaultDepartments(anchor);
  return { anchor };
}

export async function listDepartments(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const resolved = await resolveAdminOwnedAnchor(req, businessType);
    if (resolved.error) {
      return res.status(businessType === "admin" ? 403 : 400).json({
        success: false,
        message: resolved.error,
      });
    }

    return res.json({
      success: true,
      data: {
        departments: serializeDepartments(resolved.anchor),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "부서 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function createDepartment(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const resolved = await resolveAdminOwnedAnchor(req, businessType);
    if (resolved.error) {
      return res.status(403).json({
        success: false,
        message: resolved.error,
      });
    }

    const name = normalizeDepartmentName(req.body?.name);
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "부서 이름을 입력해주세요.",
      });
    }

    const anchor = resolved.anchor;
    if (!Array.isArray(anchor.internalDepartments)) {
      anchor.internalDepartments = [];
    }

    const duplicate = anchor.internalDepartments.some(
      (row) => normalizeDepartmentName(row?.name) === name,
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "같은 이름의 부서가 이미 있습니다.",
      });
    }

    const sortOrder = anchor.internalDepartments.length;
    anchor.internalDepartments.push({
      name,
      sortOrder,
      createdAt: new Date(),
    });
    await anchor.save();

    const created =
      anchor.internalDepartments[anchor.internalDepartments.length - 1];

    return res.status(201).json({
      success: true,
      data: {
        department: {
          _id: String(created._id),
          name: normalizeDepartmentName(created.name),
          sortOrder: Number(created.sortOrder ?? 0),
          createdAt: created.createdAt
            ? new Date(created.createdAt).toISOString()
            : null,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "부서 추가 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateDepartment(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const departmentId = String(req.params.departmentId || "").trim();
    if (!Types.ObjectId.isValid(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 부서 ID입니다.",
      });
    }

    const resolved = await resolveAdminOwnedAnchor(req, businessType);
    if (resolved.error) {
      return res.status(403).json({
        success: false,
        message: resolved.error,
      });
    }

    const name = normalizeDepartmentName(req.body?.name);
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "부서 이름을 입력해주세요.",
      });
    }

    const anchor = resolved.anchor;
    const row = findDepartmentById(anchor, departmentId);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "부서를 찾을 수 없습니다.",
      });
    }

    const duplicate = (anchor.internalDepartments || []).some(
      (entry) =>
        String(entry?._id || "") !== departmentId &&
        normalizeDepartmentName(entry?.name) === name,
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "같은 이름의 부서가 이미 있습니다.",
      });
    }

    row.name = name;
    await anchor.save();

    return res.json({
      success: true,
      data: {
        department: {
          _id: departmentId,
          name,
          sortOrder: Number(row.sortOrder ?? 0),
          createdAt: row.createdAt
            ? new Date(row.createdAt).toISOString()
            : null,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "부서 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteDepartment(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const departmentId = String(req.params.departmentId || "").trim();
    if (!Types.ObjectId.isValid(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 부서 ID입니다.",
      });
    }

    const resolved = await resolveAdminOwnedAnchor(req, businessType);
    if (resolved.error) {
      return res.status(403).json({
        success: false,
        message: resolved.error,
      });
    }

    const anchor = resolved.anchor;
    const exists = findDepartmentById(anchor, departmentId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "부서를 찾을 수 없습니다.",
      });
    }

    const assignedCount = await User.countDocuments({
      businessAnchorId: anchor._id,
      internalDepartmentId: new Types.ObjectId(departmentId),
      deletedAt: null,
    });
    if (assignedCount > 0) {
      return res.status(409).json({
        success: false,
        message: "소속 임직원이 있는 부서는 삭제할 수 없습니다.",
      });
    }

    anchor.internalDepartments = (anchor.internalDepartments || []).filter(
      (row) => String(row?._id || "") !== departmentId,
    );
    await anchor.save();

    return res.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "부서 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function assignStaffDepartment(req, res) {
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

    const resolved = await resolveAdminOwnedAnchor(req, businessType);
    if (resolved.error) {
      return res.status(403).json({
        success: false,
        message: resolved.error,
      });
    }

    const departmentIdRaw = req.body?.departmentId;
    const departmentId =
      departmentIdRaw == null || departmentIdRaw === ""
        ? ""
        : String(departmentIdRaw).trim();

    const anchor = resolved.anchor;
    if (departmentId) {
      if (!Types.ObjectId.isValid(departmentId)) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 부서 ID입니다.",
        });
      }
      if (!findDepartmentById(anchor, departmentId)) {
        return res.status(404).json({
          success: false,
          message: "부서를 찾을 수 없습니다.",
        });
      }
    }

    const target = await User.findById(userId).select({
      businessAnchorId: 1,
      deletedAt: 1,
    });
    if (!target || target.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    if (String(target.businessAnchorId || "") !== String(anchor._id)) {
      return res.status(403).json({
        success: false,
        message: "같은 사업자 소속 임직원만 부서를 변경할 수 있습니다.",
      });
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        internalDepartmentId: departmentId
          ? new Types.ObjectId(departmentId)
          : null,
      },
    });

    return res.json({
      success: true,
      data: {
        userId,
        departmentId: departmentId || null,
        departmentName: departmentId
          ? findDepartmentById(anchor, departmentId)?.name || ""
          : "",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "부서 할당 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function loadAnchorDepartmentsForStaff(anchorId) {
  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ businessType: 1, internalDepartments: 1 })
    .lean();
  if (!anchor || String(anchor.businessType || "") !== "admin") {
    return { usesDepartments: false, departments: [], departmentMap: new Map() };
  }
  if (
    !Array.isArray(anchor.internalDepartments) ||
    anchor.internalDepartments.length === 0
  ) {
    return { usesDepartments: false, departments: [], departmentMap: new Map() };
  }
  const departmentMap = new Map(
    anchor.internalDepartments.map((row) => [
      String(row._id),
      normalizeDepartmentName(row.name),
    ]),
  );
  return {
    usesDepartments: true,
    departments: serializeDepartments(anchor),
    departmentMap,
  };
}

export function enrichMemberWithDepartment(member, departmentMap) {
  const deptId = member?.internalDepartmentId
    ? String(member.internalDepartmentId)
    : "";
  return {
    _id: String(member._id || member.id || ""),
    name: String(member.name || ""),
    email: String(member.email || ""),
    internalDepartmentId: deptId || null,
    departmentName: deptId ? departmentMap.get(deptId) || "" : "",
  };
}
