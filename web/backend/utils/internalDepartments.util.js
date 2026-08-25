// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/businesses/business.department.controller.js
// - web/backend/controllers/auth/auth.controller.js

import {
  resolveOrgKindForDefaults,
} from "./orgBusinessType.util.js";

export const INTERNAL_DEPARTMENT_BUSINESS_TYPES = [
  "admin",
  "practice",
  "requestor",
];

export const DEFAULT_ADMIN_DEPARTMENT_NAMES = [
  "플랫폼관리부",
  "마케팅영업부",
  "기공사업부",
];

export function supportsInternalDepartments(anchor) {
  if (!anchor) return false;
  const businessType = String(anchor.businessType || "");
  if (businessType === "practice") return true;
  return INTERNAL_DEPARTMENT_BUSINESS_TYPES.includes(businessType);
}

export function getDefaultDepartmentNames(anchor) {
  const businessType = String(anchor?.businessType || "");
  if (businessType === "admin") {
    return [...DEFAULT_ADMIN_DEPARTMENT_NAMES];
  }
  if (businessType === "practice") {
    return ["치과"];
  }
  if (businessType === "requestor") {
    const kind = resolveOrgKindForDefaults(anchor);
    if (kind === "lab") return ["기공소"];
    return ["치과"];
  }
  return [];
}

export function anchorUsesInternalDepartments(anchor) {
  return (
    supportsInternalDepartments(anchor) &&
    Array.isArray(anchor.internalDepartments) &&
    anchor.internalDepartments.length > 0
  );
}

export function normalizeDepartmentName(value) {
  return String(value || "").trim();
}

export function findDepartmentById(anchor, departmentId) {
  const id = String(departmentId || "").trim();
  if (!id || !anchor || !Array.isArray(anchor.internalDepartments)) {
    return null;
  }
  return (
    anchor.internalDepartments.find((row) => String(row?._id || "") === id) ||
    null
  );
}

export function resolveDepartmentLabel(anchor, departmentId) {
  const row = findDepartmentById(anchor, departmentId);
  return row ? normalizeDepartmentName(row.name) : "";
}

/** @deprecated use ensureDefaultDepartments */
export async function ensureAdminDefaultDepartments(anchorDoc) {
  return ensureDefaultDepartments(anchorDoc);
}

export async function ensureDefaultDepartments(anchorDoc) {
  if (!supportsInternalDepartments(anchorDoc)) {
    return anchorDoc;
  }
  if (
    Array.isArray(anchorDoc.internalDepartments) &&
    anchorDoc.internalDepartments.length > 0
  ) {
    return anchorDoc;
  }

  const names = getDefaultDepartmentNames(anchorDoc);
  if (names.length === 0) {
    return anchorDoc;
  }

  anchorDoc.internalDepartments = names.map((name, index) => ({
    name,
    sortOrder: index,
    createdAt: new Date(),
  }));
  await anchorDoc.save();
  return anchorDoc;
}

export function sortDepartments(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const orderDiff =
      Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return normalizeDepartmentName(a?.name).localeCompare(
      normalizeDepartmentName(b?.name),
      "ko",
    );
  });
}

export function serializeDepartments(anchor) {
  return sortDepartments(anchor?.internalDepartments).map((row) => ({
    _id: String(row._id),
    name: normalizeDepartmentName(row.name),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  }));
}
