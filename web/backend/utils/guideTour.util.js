// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/guideTour/guideTourTypes.ts

/**
 * @param {unknown} raw
 * @returns {{ completed: boolean, resumeStepId: string | null }}
 */
export function normalizeGuideTour(raw) {
  const row =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};
  const resume =
    typeof row.resumeStepId === "string" && row.resumeStepId.trim()
      ? row.resumeStepId.trim()
      : null;
  return {
    completed: Boolean(row.completed),
    resumeStepId: resume,
  };
}
