// related files:
// - web/backend/middlewares/auth.middleware.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/socket.js
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/utils/internalDepartments.util.js
//
// 어벗츠(admin) 임직원은 DB role이 admin이다.
// 로그인·API에서는 부서에 맞는 화면 역할로만 본다. DB role·소속 앵커는 바꾸지 않는다.

import BusinessAnchor from "../models/businessAnchor.model.js";
import { resolveDepartmentLabel } from "./internalDepartments.util.js";

/** @type {Readonly<Record<string, "admin" | "salesTeam" | "internalLab">>} */
export const ADMIN_DEPARTMENT_WORKSPACE = Object.freeze({
  마케팅영업부: "salesTeam",
  기공사업부: "internalLab",
  플랫폼관리부: "admin",
  경영본부: "admin",
});

/**
 * @param {unknown} departmentName
 * @returns {"admin" | "salesTeam" | "internalLab"}
 */
export function workspaceRoleForDepartmentName(departmentName) {
  const name = String(departmentName || "").trim();
  if (!name) return "admin";
  return ADMIN_DEPARTMENT_WORKSPACE[name] || "admin";
}

/**
 * 부서 이름과 기공사업부 앵커가 이미 있을 때의 세션 사용자.
 * DB에 저장하지 않는 사본을 돌려준다.
 *
 * @param {Record<string, unknown> | null | undefined} user
 * @param {{ departmentName?: unknown, internalLabAnchor?: { _id?: unknown, name?: unknown } | null }} [context]
 */
export function projectAdminDepartmentWorkspace(user, context = {}) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return user;
  if (String(user.role || "") !== "admin") return user;

  const departmentName = String(context.departmentName || "").trim();
  const workspace = workspaceRoleForDepartmentName(departmentName);
  if (workspace === "admin") return user;

  if (workspace === "salesTeam") {
    return {
      ...user,
      role: "salesTeam",
      accountRole: "admin",
      departmentName,
    };
  }

  const lab = context.internalLabAnchor;
  const labId = lab?._id;
  if (!labId) return user;

  const labName = String(lab?.name || "").trim() || "기공사업부";
  return {
    ...user,
    role: "internalLab",
    accountRole: "admin",
    accountBusinessAnchorId: user.businessAnchorId || null,
    businessAnchorId: labId,
    business: labName,
    departmentName,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} user
 */
export async function applyAdminDepartmentWorkspace(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return user;
  if (String(user.role || "") !== "admin") return user;
  if (!user.internalDepartmentId || !user.businessAnchorId) return user;

  const anchor = await BusinessAnchor.findById(user.businessAnchorId)
    .select({ businessType: 1, internalDepartments: 1 })
    .lean();
  if (!anchor || String(anchor.businessType || "") !== "admin") return user;

  const departmentName = resolveDepartmentLabel(
    anchor,
    user.internalDepartmentId,
  );
  const workspace = workspaceRoleForDepartmentName(departmentName);
  if (workspace === "admin") return user;

  const internalLabAnchor =
    workspace === "internalLab"
      ? await BusinessAnchor.findOne({ businessType: "internalLab" })
          .select({ name: 1 })
          .lean()
      : null;

  return projectAdminDepartmentWorkspace(user, {
    departmentName,
    internalLabAnchor,
  });
}
