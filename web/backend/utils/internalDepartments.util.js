// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/businesses/business.department.controller.js
// - web/backend/controllers/auth/auth.controller.js

export const DEFAULT_ADMIN_DEPARTMENT_NAMES = [
  "플랫폼관리부",
  "마케팅영업부",
  "기공사업부",
];

export function anchorUsesInternalDepartments(anchor) {
  return (
    anchor &&
    String(anchor.businessType || "") === "admin" &&
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

export async function ensureAdminDefaultDepartments(anchorDoc) {
  if (!anchorDoc || String(anchorDoc.businessType || "") !== "admin") {
    return anchorDoc;
  }
  if (
    Array.isArray(anchorDoc.internalDepartments) &&
    anchorDoc.internalDepartments.length > 0
  ) {
    return anchorDoc;
  }

  anchorDoc.internalDepartments = DEFAULT_ADMIN_DEPARTMENT_NAMES.map(
    (name, index) => ({
      name,
      sortOrder: index,
      createdAt: new Date(),
    }),
  );
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
