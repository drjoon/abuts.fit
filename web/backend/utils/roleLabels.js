// related files:
// - rules.md
// - web/frontend/src/shared/types/role.ts
// - web/backend/controllers/auth/auth.controller.js
// - 2026-08-18: User vs BusinessAnchor 한글 라벨 SSOT. 코드 키 salesman/admin 유지.

export const PRODUCT_NAME = "어벗츠.핏";

export const USER_ROLE_LABEL = Object.freeze({
  requestor: "의뢰자",
  practice: "의뢰 발신자 (치과)",
  salesman: "딜러",
  manufacturer: "제조사",
  internalLab: "어벗츠기공소",
  admin: "관리자",
  devops: "개발운영사",
  labTeam: "기공팀",
  salesTeam: "영업팀",
});

export const BUSINESS_TYPE_LABEL = Object.freeze({
  requestor: "의뢰자",
  practice: "의뢰 발신자 (치과)",
  salesman: "딜러사",
  manufacturer: "제조사",
  internalLab: "어벗츠기공소",
  admin: "어벗츠",
  devops: "개발운영사",
  labTeam: "기공팀",
  salesTeam: "영업팀",
});

export function getUserRoleLabel(role) {
  const key = String(role || "").trim();
  return USER_ROLE_LABEL[key] || "사용자";
}

export function getBusinessTypeLabel(type) {
  const key = String(type || "").trim();
  if (BUSINESS_TYPE_LABEL[key]) return BUSINESS_TYPE_LABEL[key];
  return key || "미분류";
}
