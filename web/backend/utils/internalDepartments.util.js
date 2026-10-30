// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/controllers/businesses/business.department.controller.js
// - web/backend/controllers/auth/auth.controller.js
// - web/frontend/src/features/settings/tabs/StaffTab.tsx
// - web/frontend/src/shared/business/departmentAccess.ts

import User from "../models/user.model.js";
import { Types } from "mongoose";
import { BUSINESS_ALLOWED_ROLES } from "../controllers/businesses/businessRole.util.js";
import {
  resolveOrgKindForDefaults,
} from "./orgBusinessType.util.js";

export const INTERNAL_DEPARTMENT_BUSINESS_TYPES = [...BUSINESS_ALLOWED_ROLES];

export const DEPARTMENT_KEY_MANAGEMENT = "management";
export const DEPARTMENT_KEY_CLINICAL = "clinical";
export const DEPARTMENT_KEY_LAB = "lab";
export const DEPARTMENT_KEY_PRODUCTION = "production";
export const DEPARTMENT_KEY_SALES = "sales";
export const DEPARTMENT_KEY_DEVELOPMENT = "development";

export const OPERATIONS_DEPARTMENT_KEYS = Object.freeze([
  DEPARTMENT_KEY_CLINICAL,
  DEPARTMENT_KEY_LAB,
  DEPARTMENT_KEY_PRODUCTION,
  DEPARTMENT_KEY_SALES,
  DEPARTMENT_KEY_DEVELOPMENT,
]);

export const MANAGEMENT_DEPARTMENT_NAME = "경영팀";
export const CLINICAL_DEPARTMENT_NAME = "진료팀";
export const LAB_DEPARTMENT_NAME = "기공팀";
export const PRODUCTION_DEPARTMENT_NAME = "생산팀";
export const SALES_DEPARTMENT_NAME = "영업팀";
export const DEVELOPMENT_DEPARTMENT_NAME = "개발팀";

export const DEFAULT_ADMIN_DEPARTMENT_NAMES = [
  "플랫폼관리부",
  "마케팅영업부",
  "기공사업부",
];

const LEGACY_SINGLE_DEPARTMENT_NAMES = Object.freeze({
  practice: ["치과"],
  lab: ["기공소"],
  manufacturer: ["제조사"],
  salesman: ["딜러"],
  devops: ["개발운영사"],
  internalLab: ["어벗츠기공소"],
});

export function supportsInternalDepartments(anchor) {
  if (!anchor) return false;
  const businessType = String(anchor.businessType || "");
  return INTERNAL_DEPARTMENT_BUSINESS_TYPES.includes(businessType);
}

export function isPracticeOrLabOrg(anchor) {
  const kind = resolveOrgKindForDefaults(anchor);
  return kind === "practice" || kind === "lab";
}

/** 관리자 작업영역 부서는 유지. 그 외 조직은 경영팀+실무팀. */
export function usesPairedDefaultDepartments(anchor) {
  if (!supportsInternalDepartments(anchor)) return false;
  return String(anchor?.businessType || "") !== "admin";
}

function operationsSpecForAnchor(anchor) {
  const businessType = String(anchor?.businessType || "");
  const kind = resolveOrgKindForDefaults(anchor);
  if (kind === "lab" || businessType === "internalLab" || businessType === "labTeam") {
    return { name: LAB_DEPARTMENT_NAME, key: DEPARTMENT_KEY_LAB };
  }
  if (kind === "practice") {
    return { name: CLINICAL_DEPARTMENT_NAME, key: DEPARTMENT_KEY_CLINICAL };
  }
  if (businessType === "manufacturer") {
    return { name: PRODUCTION_DEPARTMENT_NAME, key: DEPARTMENT_KEY_PRODUCTION };
  }
  if (businessType === "salesman" || businessType === "salesTeam") {
    return { name: SALES_DEPARTMENT_NAME, key: DEPARTMENT_KEY_SALES };
  }
  if (businessType === "devops") {
    return { name: DEVELOPMENT_DEPARTMENT_NAME, key: DEPARTMENT_KEY_DEVELOPMENT };
  }
  return null;
}

export function getDefaultDepartmentSpecs(anchor) {
  if (!supportsInternalDepartments(anchor)) return [];
  const businessType = String(anchor?.businessType || "");
  if (businessType === "admin") {
    return DEFAULT_ADMIN_DEPARTMENT_NAMES.map((name) => ({ name, key: "" }));
  }
  const operations = operationsSpecForAnchor(anchor);
  if (!operations) return [];
  return [
    { name: MANAGEMENT_DEPARTMENT_NAME, key: DEPARTMENT_KEY_MANAGEMENT },
    operations,
  ];
}

/** @deprecated use getDefaultDepartmentSpecs */
export function getPracticeLabDefaultSpecs(anchor) {
  return getDefaultDepartmentSpecs(anchor).filter((row) => row.key);
}

export function getDefaultDepartmentNames(anchor) {
  return getDefaultDepartmentSpecs(anchor).map((row) => row.name);
}

export function isOperationsDepartmentKey(key) {
  return OPERATIONS_DEPARTMENT_KEYS.includes(normalizeDepartmentKey(key));
}

export function normalizeDepartmentName(value) {
  return String(value || "").trim();
}

export function normalizeDepartmentKey(value) {
  return String(value || "").trim();
}

export function collectMemberDepartmentIds(member) {
  const ids = [];
  const seen = new Set();
  const push = (raw) => {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  if (Array.isArray(member?.internalDepartmentIds)) {
    member.internalDepartmentIds.forEach(push);
  }
  push(member?.internalDepartmentId);
  return ids;
}

export function toDepartmentObjectIds(ids) {
  return collectMemberDepartmentIds({ internalDepartmentIds: ids })
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

export function departmentGrantsSettlement(dept) {
  if (!dept) return false;
  if (normalizeDepartmentKey(dept.key) === DEPARTMENT_KEY_MANAGEMENT) {
    return true;
  }
  return normalizeDepartmentName(dept.name) === MANAGEMENT_DEPARTMENT_NAME;
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

export function memberCanAccessSettlement(member, anchor) {
  if (!usesPairedDefaultDepartments(anchor)) return true;
  const ids = new Set(collectMemberDepartmentIds(member));
  if (ids.size === 0) return false;
  return (anchor?.internalDepartments || []).some(
    (row) => ids.has(String(row?._id || "")) && departmentGrantsSettlement(row),
  );
}

export function actorCanManageStaffDirectory(actor, anchor) {
  if (!actor) return false;
  if (String(actor.accountRole || "") === "admin") return true;
  if (String(actor.role || "") === "admin") return true;
  return memberCanAccessSettlement(actor, anchor);
}

export function rejectUnlessStaffDirectoryManager(res, actor, anchor) {
  if (actorCanManageStaffDirectory(actor, anchor)) return false;
  res.status(403).json({
    success: false,
    message: "경영팀만 부서와 직원을 관리할 수 있습니다.",
  });
  return true;
}

export function memberAssignedToDepartment(member, departmentId) {
  const id = String(departmentId || "").trim();
  if (!id) return false;
  return collectMemberDepartmentIds(member).includes(id);
}

function isLegacyDefaultName(anchor, name) {
  const normalized = normalizeDepartmentName(name);
  const businessType = String(anchor?.businessType || "");
  const kind = resolveOrgKindForDefaults(anchor);
  const fromType = LEGACY_SINGLE_DEPARTMENT_NAMES[businessType] || [];
  const fromKind = LEGACY_SINGLE_DEPARTMENT_NAMES[kind] || [];
  return fromType.includes(normalized) || fromKind.includes(normalized);
}

function findDeptByKeyOrName(departments, spec) {
  const key = normalizeDepartmentKey(spec.key);
  const name = normalizeDepartmentName(spec.name);
  return (
    departments.find(
      (row) => key && normalizeDepartmentKey(row?.key) === key,
    ) ||
    departments.find((row) => normalizeDepartmentName(row?.name) === name) ||
    null
  );
}

async function placeStaffInSoleDepartment(anchorDoc) {
  if (usesPairedDefaultDepartments(anchorDoc)) return;
  const departments = Array.isArray(anchorDoc?.internalDepartments)
    ? anchorDoc.internalDepartments
    : [];
  if (departments.length !== 1 || !anchorDoc?._id) return;
  const departmentId = departments[0]?._id;
  if (!departmentId) return;
  await User.updateMany(
    {
      businessAnchorId: anchorDoc._id,
      $and: [
        { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
        { internalDepartmentId: { $ne: departmentId } },
      ],
    },
    {
      $set: {
        internalDepartmentId: departmentId,
        internalDepartmentIds: [departmentId],
      },
    },
  );
}

export async function setUserDepartmentIds(userId, departmentIds) {
  const ids = toDepartmentObjectIds(departmentIds);
  await User.findByIdAndUpdate(userId, {
    $set: {
      internalDepartmentIds: ids,
      internalDepartmentId: ids[0] || null,
    },
  });
  return ids.map((id) => String(id));
}

function toUserIdString(row) {
  if (!row) return "";
  if (typeof row === "string") return row.trim();
  if (Types.ObjectId.isValid(row)) return String(row);
  const nested = row._id || row.userId || row.id;
  if (nested && Types.ObjectId.isValid(nested)) return String(nested);
  return "";
}

async function loadRepresentativeIds(anchorDoc) {
  const fromDoc = [
    anchorDoc?.primaryContactUserId,
    ...(Array.isArray(anchorDoc?.owners) ? anchorDoc.owners : []),
  ]
    .map(toUserIdString)
    .filter((id) => Types.ObjectId.isValid(id));
  if (fromDoc.length > 0) return [...new Set(fromDoc)];

  const BusinessAnchor = (await import("../models/businessAnchor.model.js"))
    .default;
  const full = await BusinessAnchor.findById(anchorDoc?._id)
    .select({ primaryContactUserId: 1, owners: 1 })
    .lean();
  return [
    ...new Set(
      [full?.primaryContactUserId, ...(Array.isArray(full?.owners) ? full.owners : [])]
        .map(toUserIdString)
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
}

async function placeRepresentativesInDefaultDepartments(anchorDoc) {
  const specs = getDefaultDepartmentSpecs(anchorDoc).filter((row) => row.key);
  if (specs.length === 0) return;

  const defaultIds = specs
    .map((spec) => findDeptByKeyOrName(anchorDoc.internalDepartments || [], spec))
    .map((row) => row?._id)
    .filter(Boolean);
  if (defaultIds.length === 0) return;

  const representativeIds = await loadRepresentativeIds(anchorDoc);
  if (representativeIds.length === 0) return;

  const users = await User.find({
    _id: { $in: representativeIds.map((id) => new Types.ObjectId(id)) },
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  }).select({ internalDepartmentId: 1, internalDepartmentIds: 1 });

  const defaultIdSet = new Set(defaultIds.map((id) => String(id)));
  await Promise.all(
    users.map(async (user) => {
      const current = collectMemberDepartmentIds(user);
      const onlyLegacy =
        current.length > 0 &&
        current.every((id) => {
          const row = findDepartmentById(anchorDoc, id);
          return row && isLegacyDefaultName(anchorDoc, row.name);
        });
      if (current.length > 0 && !onlyLegacy) return;
      const next = [...new Set([...current.filter((id) => defaultIdSet.has(id)), ...defaultIdSet])];
      await setUserDepartmentIds(user._id, next);
    }),
  );
}

async function ensurePairedDepartmentSet(anchorDoc) {
  const specs = getDefaultDepartmentSpecs(anchorDoc).filter((row) => row.key);
  if (specs.length === 0) return false;

  if (!Array.isArray(anchorDoc.internalDepartments)) {
    anchorDoc.internalDepartments = [];
  }

  const before = (anchorDoc.internalDepartments || []).map((row) => ({
    id: String(row?._id || ""),
    name: normalizeDepartmentName(row?.name),
    key: normalizeDepartmentKey(row?.key),
  }));
  const onlyLegacy =
    before.length === 1 && isLegacyDefaultName(anchorDoc, before[0].name);

  let changed = false;
  specs.forEach((spec, index) => {
    const existing = findDeptByKeyOrName(anchorDoc.internalDepartments, spec);
    if (existing) {
      if (normalizeDepartmentKey(existing.key) !== spec.key) {
        existing.key = spec.key;
        changed = true;
      }
      if (normalizeDepartmentName(existing.name) !== spec.name && !existing.key) {
        existing.name = spec.name;
        changed = true;
      }
      return;
    }
    anchorDoc.internalDepartments.push({
      name: spec.name,
      key: spec.key,
      sortOrder: index,
      createdAt: new Date(),
    });
    changed = true;
  });

  if (onlyLegacy) {
    const legacyId = before[0].id;
    anchorDoc.internalDepartments = (anchorDoc.internalDepartments || []).filter(
      (row) => String(row?._id || "") !== legacyId,
    );
    changed = true;
    if (legacyId && Types.ObjectId.isValid(legacyId)) {
      await User.updateMany(
        {
          businessAnchorId: anchorDoc._id,
          $or: [
            { internalDepartmentId: new Types.ObjectId(legacyId) },
            { internalDepartmentIds: new Types.ObjectId(legacyId) },
          ],
        },
        {
          $set: { internalDepartmentId: null, internalDepartmentIds: [] },
        },
      );
    }
  }

  if (changed) {
    await anchorDoc.save();
  }
  return changed;
}

export function anchorUsesInternalDepartments(anchor) {
  return (
    supportsInternalDepartments(anchor) &&
    Array.isArray(anchor.internalDepartments) &&
    anchor.internalDepartments.length > 0
  );
}

/** @deprecated use ensureDefaultDepartments */
export async function ensureAdminDefaultDepartments(anchorDoc) {
  return ensureDefaultDepartments(anchorDoc);
}

export async function ensureDefaultDepartments(anchorDoc) {
  if (!supportsInternalDepartments(anchorDoc)) {
    return anchorDoc;
  }

  if (usesPairedDefaultDepartments(anchorDoc)) {
    await ensurePairedDepartmentSet(anchorDoc);
    await placeRepresentativesInDefaultDepartments(anchorDoc);
    return anchorDoc;
  }

  if (
    Array.isArray(anchorDoc.internalDepartments) &&
    anchorDoc.internalDepartments.length > 0
  ) {
    await placeStaffInSoleDepartment(anchorDoc);
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
  await placeStaffInSoleDepartment(anchorDoc);
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
    key: normalizeDepartmentKey(row.key),
    grantsSettlement: departmentGrantsSettlement(row),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  }));
}

export async function applyDepartmentSettlementAccess(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return user;
  const ids = collectMemberDepartmentIds(user);
  const payload = {
    ...user,
    internalDepartmentIds: ids,
    internalDepartmentId: ids[0] || user.internalDepartmentId || null,
    canAccessSettlement: true,
  };

  if (String(user.accountRole || "") === "admin") return payload;
  if (String(user.role || "") === "admin") return payload;
  if (!user.businessAnchorId) return payload;

  const BusinessAnchor = (await import("../models/businessAnchor.model.js"))
    .default;
  let anchor = await BusinessAnchor.findById(user.businessAnchorId).select({
    businessType: 1,
    requestorKind: 1,
    internalDepartments: 1,
    primaryContactUserId: 1,
    owners: 1,
  });
  if (!anchor || !usesPairedDefaultDepartments(anchor)) return payload;

  anchor = await ensureDefaultDepartments(anchor);
  const fresh = await User.findById(user._id || user.id)
    .select({ internalDepartmentId: 1, internalDepartmentIds: 1 })
    .lean();
  const nextIds = collectMemberDepartmentIds(fresh || user);
  return {
    ...payload,
    internalDepartmentIds: nextIds,
    internalDepartmentId: nextIds[0] || null,
    canAccessSettlement: memberCanAccessSettlement(fresh || user, anchor),
  };
}

/** @deprecated use applyDepartmentSettlementAccess */
export async function applyRequestorDepartmentAccess(user) {
  return applyDepartmentSettlementAccess(user);
}
