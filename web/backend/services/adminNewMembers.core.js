// related files:
// - web/backend/services/adminNewMembers.service.js
// - web/backend/controllers/admin/admin.newMembers.controller.js
// - web/frontend/src/pages/admin/dashboard/AdminNewMembersCard.tsx
// change-log:
// - 2026-10-26: 공개 가입(의뢰자·딜러)은 가입 시각부터 7일간 관리자 대시보드에 남긴다.

export const NEW_MEMBER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const NEW_MEMBER_VISIBLE_DAYS = 7;
export const NEW_MEMBER_ROLES = ["requestor", "salesman"];
export const NEW_MEMBER_LIST_LIMIT = 200;

/** 가입 시각부터 7일(168시간). 달력 자정으로 끊지 않는다. */
export function newMemberSince(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  return new Date(at.getTime() - NEW_MEMBER_WINDOW_MS);
}

export function buildNewMemberFilter(now = new Date()) {
  return {
    createdAt: { $gte: newMemberSince(now) },
    deletedAt: null,
    replacedByUserId: null,
    role: { $in: NEW_MEMBER_ROLES },
    subRole: { $ne: "staff" },
  };
}

export function toNewMemberRow(user) {
  const profile = user?.practiceProfile || {};
  const businessName = String(user?.business || profile.clinicName || "").trim();
  const phone = String(
    user?.phoneNumber || profile.phone || profile.clinicPhone || "",
  ).trim();
  return {
    id: String(user?._id || ""),
    name: String(user?.name || "").trim(),
    email: String(user?.email || "").trim(),
    role: String(user?.role || "").trim(),
    requestorKind: user?.requestorKind || null,
    businessName,
    phone,
    onboardingWizardCompleted: Boolean(user?.onboardingWizardCompleted),
    active: user?.active !== false,
    createdAt: user?.createdAt || null,
  };
}
