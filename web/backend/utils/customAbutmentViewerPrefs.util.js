// 커스텀어벗 디자인 모달의 화면 설정. 계정에 저장해 다음에도 그대로 연다.
// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/practice/customAbutmentViewerPrefs.ts

const GUIDE = new Set(["off", "center", "grid"]);
const TOOTH_RE = /^\d{2}$/;

export const DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS = {
  colorMapping: true,
  centerGuide: "off",
  scanTransparency: 0,
  showUpper: true,
  showLower: true,
  showScanbodies: false,
  showPredictedCrown: false,
  showFinishLine: true,
  showFixtureAnalog: true,
  gumballOn: true,
  chatOpen: null,
  infoExpanded: true,
  expandedTeeth: {},
};

function bool(raw, fallback) {
  if (raw === true || raw === false) return raw;
  return fallback;
}

/**
 * @param {unknown} raw
 */
export function normalizeCustomAbutmentViewerPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS;
  const guide = GUIDE.has(src.centerGuide) ? src.centerGuide : base.centerGuide;
  const transparency = Number(src.scanTransparency);
  const expandedTeeth = {};
  if (src.expandedTeeth && typeof src.expandedTeeth === "object") {
    for (const [key, value] of Object.entries(src.expandedTeeth)) {
      if (!TOOTH_RE.test(key) || Object.keys(expandedTeeth).length >= 64) continue;
      if (value === true || value === false) expandedTeeth[key] = value;
    }
  }
  const chat =
    src.chatOpen === true || src.chatOpen === false ? src.chatOpen : null;
  return {
    colorMapping: bool(src.colorMapping, base.colorMapping),
    centerGuide: guide,
    scanTransparency: Number.isFinite(transparency)
      ? Math.min(90, Math.max(0, Math.round(transparency / 5) * 5))
      : base.scanTransparency,
    showUpper: bool(src.showUpper, base.showUpper),
    showLower: bool(src.showLower, base.showLower),
    showScanbodies: bool(src.showScanbodies, base.showScanbodies),
    showPredictedCrown: bool(src.showPredictedCrown, base.showPredictedCrown),
    showFinishLine: bool(src.showFinishLine, base.showFinishLine),
    showFixtureAnalog: bool(src.showFixtureAnalog, base.showFixtureAnalog),
    gumballOn: bool(src.gumballOn, base.gumballOn),
    chatOpen: chat,
    infoExpanded: bool(src.infoExpanded, base.infoExpanded),
    expandedTeeth,
  };
}
