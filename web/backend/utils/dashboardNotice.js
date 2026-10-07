// related files:
// - web/backend/models/dashboardNotice.model.js
// - web/backend/controllers/dashboardNotice.controller.js
// - web/frontend/src/shared/notices/dashboardNotice.ts

/** 관리자 공지 대상. 화면 라벨과 1:1. */
export const NOTICE_AUDIENCES = [
  "practice",
  "lab",
  "manufacturer",
  "dealer",
  "salesTeam",
  "labHq",
];

export const NOTICE_AUDIENCE_LABEL = {
  practice: "치과",
  lab: "기공소",
  manufacturer: "제조사",
  dealer: "딜러",
  salesTeam: "영업팀",
  labHq: "기공본부팀",
};

export function normalizeNoticeAudiences(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    const key = String(item || "").trim();
    if (NOTICE_AUDIENCES.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * 로그인 사용자가 볼 공지 대상.
 * 기공본부팀 = 어벗츠기공소(internalLab) · 기공팀(labTeam).
 */
export function resolveNoticeAudiencesForUser(user) {
  const role = String(user?.role || "").trim();
  const kind =
    user?.requestorKind === "practice" || user?.requestorKind === "lab"
      ? user.requestorKind
      : user?.requestorCapabilities?.practice
        ? "practice"
        : user?.requestorCapabilities?.lab
          ? "lab"
          : null;
  const out = [];
  if ((role === "requestor" || role === "practice") && kind === "practice") {
    out.push("practice");
  }
  if ((role === "requestor" || role === "practice") && kind === "lab") {
    out.push("lab");
  }
  if (role === "manufacturer") out.push("manufacturer");
  if (role === "salesman") out.push("dealer");
  if (role === "salesTeam") out.push("salesTeam");
  if (role === "internalLab" || role === "labTeam") out.push("labHq");
  return out;
}

/** published 이고 시작~종료 시각(없으면 제한 없음) 안인지. */
export function isNoticeWindowOpen(notice, now = new Date()) {
  if (!notice || notice.published === false) return false;
  const start = notice.startsAt ? new Date(notice.startsAt) : null;
  const end = notice.endsAt ? new Date(notice.endsAt) : null;
  if (start && !Number.isNaN(start.getTime()) && start > now) return false;
  if (end && !Number.isNaN(end.getTime()) && end < now) return false;
  return true;
}
