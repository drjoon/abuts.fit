// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/backend/controllers/auth/auth.controller.js
// - web/frontend/src/shared/guideTour/guideTourAlwaysOn.ts
//
// 테스트치과·테스트기공소 소속 유저는 가이드투어 수료를 고정하지 않는다.

/** @type {readonly string[]} */
export const GUIDE_TOUR_ALWAYS_ON_BUSINESS_NAMES = Object.freeze([
  "테스트치과",
  "테스트기공소",
]);

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isGuideTourAlwaysOnBusiness(name) {
  const n = String(name || "").trim();
  return GUIDE_TOUR_ALWAYS_ON_BUSINESS_NAMES.includes(n);
}

/**
 * @param {unknown} raw
 * @param {{ alwaysOn?: boolean }} [opts]
 * @returns {{ completed: boolean, resumeStepId: string | null }}
 */
export function normalizeGuideTour(raw, opts = {}) {
  const row =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};
  const resume =
    typeof row.resumeStepId === "string" && row.resumeStepId.trim()
      ? row.resumeStepId.trim()
      : null;
  const alwaysOn = Boolean(opts?.alwaysOn);
  return {
    completed: alwaysOn ? false : Boolean(row.completed),
    resumeStepId: resume,
  };
}

/**
 * API 응답용 — 테스트치과/테스트기공소면 completed를 강제 false.
 * @param {Record<string, unknown> | null | undefined} user
 * @returns {Record<string, unknown> | null | undefined}
 */
export function applyGuideTourAlwaysOnToUserPayload(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return user;
  if (!isGuideTourAlwaysOnBusiness(user.business)) return user;
  return {
    ...user,
    guideTour: normalizeGuideTour(user.guideTour, { alwaysOn: true }),
  };
}
