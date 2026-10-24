// related files:
// - web/backend/services/staffBulkRegister.core.js
// - web/backend/controllers/businesses/business.owner.controller.js
// - web/backend/controllers/businesses/business.utils.js

import User from "../models/user.model.js";
import { defaultProfileImageForSeed } from "../utils/defaultProfileImage.js";
import {
  isStaffInitialPassword,
  STAFF_INITIAL_PASSWORD_MESSAGE,
} from "../utils/passwordPolicy.js";
import { seedUserRequestSettingsFromAnchor } from "../controllers/businesses/business.utils.js";
import {
  finalizeStaffBulkDrafts,
  isReservedStaffLoginEmail,
  loginIdBaseFromName,
  loginIdLookupClauses,
  parseStaffBulkText,
} from "./staffBulkRegister.core.js";

function ownerMirror(owner) {
  const mirror = {};
  const kind = String(owner?.requestorKind || "").trim();
  if (kind === "practice" || kind === "lab") mirror.requestorKind = kind;
  if (typeof owner?.practiceHasInHouseLab === "boolean") {
    mirror.practiceHasInHouseLab = owner.practiceHasInHouseLab;
  }
  if (owner?.requestorServices && typeof owner.requestorServices === "object") {
    mirror.requestorServices = {
      free: false,
      paid: Boolean(owner.requestorServices.paid),
    };
  }
  return mirror;
}

async function loadTakenIdentities(drafts) {
  const bases = drafts
    .filter((draft) => !draft.error)
    .map((draft) => loginIdBaseFromName(draft.name))
    .filter(Boolean);
  const clauses = loginIdLookupClauses(bases);
  if (!clauses.length) {
    return { takenLoginIds: new Set(), takenEmails: new Set() };
  }

  const existing = await User.find({ $or: clauses })
    .select({ email: 1, loginId: 1 })
    .lean();
  const takenLoginIds = new Set();
  const takenEmails = new Set();
  for (const row of existing) {
    const email = String(row?.email || "").trim().toLowerCase();
    const loginId = String(row?.loginId || "").trim().toLowerCase();
    if (email) takenEmails.add(email);
    if (loginId) takenLoginIds.add(loginId);
    if (isReservedStaffLoginEmail(email)) {
      takenLoginIds.add(email.split("@")[0]);
    }
  }
  return { takenLoginIds, takenEmails };
}

export async function createOwnerStaffAccounts({
  anchor,
  owner,
  password,
  text,
  departmentId,
}) {
  if (!isStaffInitialPassword(password)) {
    return {
      status: 400,
      message: STAFF_INITIAL_PASSWORD_MESSAGE,
      created: [],
      failed: [],
    };
  }

  const parsed = parseStaffBulkText(text);
  if (parsed.fatal) {
    return { status: 400, message: parsed.fatal, created: [], failed: [] };
  }

  const taken = await loadTakenIdentities(parsed.drafts);
  const planned = finalizeStaffBulkDrafts(parsed.drafts, taken);
  if (!planned.ready.length) {
    return {
      status: 400,
      message: planned.failed[0]?.message || "등록할 직원이 없습니다.",
      created: [],
      failed: planned.failed,
    };
  }

  const createdUsers = [];
  const created = [];
  const failed = [...planned.failed];
  const mirror = ownerMirror(owner);
  const role = String(owner?.role || "requestor").trim() || "requestor";

  for (const row of planned.ready) {
    try {
      const doc = {
        name: row.name,
        email: row.email,
        password,
        role,
        subRole: "staff",
        business: String(anchor?.name || "").trim(),
        businessAnchorId: anchor._id,
        active: true,
        approvedAt: new Date(),
        isVerified: true,
        onboardingWizardCompleted: true,
        mustChangePassword: true,
        guideTour: { completed: true, resumeStepId: null },
        signupChannel: "owner_staff_bulk",
        profileImage: defaultProfileImageForSeed(row.email),
        ...mirror,
      };
      if (row.loginId) doc.loginId = row.loginId;
      if (departmentId) doc.internalDepartmentId = departmentId;
      const user = await User.create(doc);
      createdUsers.push(user);
      created.push({
        userId: String(user._id),
        name: row.name,
        loginId: row.loginId || "",
        email: row.loginId ? "" : row.email,
        login: row.login,
      });
    } catch (error) {
      const duplicate = Number(error?.code) === 11000;
      const validationMessage = error?.errors
        ? Object.values(error.errors)
            .map((item) => item?.message)
            .find(Boolean)
        : "";
      failed.push({
        line: row.line,
        name: row.name,
        message: duplicate
          ? "이미 등록된 아이디입니다."
          : validationMessage || "계정을 만들지 못했습니다.",
      });
    }
  }

  if (!createdUsers.length) {
    return {
      status: 400,
      message: failed[0]?.message || "등록할 직원이 없습니다.",
      created: [],
      failed,
    };
  }

  if (!Array.isArray(anchor.members)) anchor.members = [];
  for (const user of createdUsers) {
    const id = String(user._id);
    if (!anchor.members.some((member) => String(member) === id)) {
      anchor.members.push(user._id);
    }
  }

  try {
    await anchor.save();
  } catch {
    await User.deleteMany({ _id: { $in: createdUsers.map((user) => user._id) } });
    return {
      status: 500,
      message: "직원 등록 중 오류가 발생했습니다.",
      created: [],
      failed,
    };
  }

  await Promise.all(
    createdUsers.map((user) =>
      seedUserRequestSettingsFromAnchor(user._id, anchor).catch(() => false),
    ),
  );

  return { status: 201, message: "", created, failed };
}

export async function resetOwnedStaffPassword({ anchor, userId, password }) {
  if (!isStaffInitialPassword(password)) {
    return { status: 400, message: STAFF_INITIAL_PASSWORD_MESSAGE };
  }

  const id = String(userId || "").trim();
  const isMember =
    Array.isArray(anchor?.members) &&
    anchor.members.some((member) => String(member) === id);
  if (!isMember) {
    return { status: 404, message: "직원을 찾을 수 없습니다." };
  }
  if (String(anchor.primaryContactUserId || "") === id) {
    return { status: 409, message: "대표 비밀번호는 여기서 바꾸지 않습니다." };
  }
  if (
    Array.isArray(anchor.owners) &&
    anchor.owners.some((ownerId) => String(ownerId) === id)
  ) {
    return { status: 409, message: "대표 비밀번호는 여기서 바꾸지 않습니다." };
  }

  const user = await User.findById(id).select("+password");
  if (!user) {
    return { status: 404, message: "직원을 찾을 수 없습니다." };
  }
  user.password = password;
  user.mustChangePassword = true;
  await user.save();
  return { status: 200, message: "" };
}
