// change-log:
// - 2026-08-15: 계정(개인) 단위 workspaceMode 정규화 (default: expert)
// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/workspace/workspaceMode.ts

export const WORKSPACE_MODES = Object.freeze(["express", "expert"]);

export const DEFAULT_WORKSPACE_MODE = "expert";

/**
 * @param {unknown} raw
 * @returns {"express"|"expert"}
 */
export function normalizeWorkspaceMode(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "express" || value === "expert") return value;
  return DEFAULT_WORKSPACE_MODE;
}
