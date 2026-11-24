// 커스텀어벗 디자인 모달 화면 설정. 사용자 계정에 저장한다.
// related files:
// - web/backend/utils/customAbutmentViewerPrefs.util.js
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

import { apiFetch } from "@/shared/api/apiClient";

export type CenterGuideMode = "off" | "center" | "grid";

export type CustomAbutmentViewerPrefs = {
  colorMapping: boolean;
  centerGuide: CenterGuideMode;
  scanTransparency: number;
  showUpper: boolean;
  showLower: boolean;
  showScanbodies: boolean;
  showPredictedCrown: boolean;
  showFinishLine: boolean;
  showFixtureAnalog: boolean;
  gumballOn: boolean;
  /** null이면 역할 기본(기공소는 열림). */
  chatOpen: boolean | null;
  infoExpanded: boolean;
  expandedTeeth: Record<string, boolean>;
};

export const DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS: CustomAbutmentViewerPrefs = {
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

const GUIDE = new Set<CenterGuideMode>(["off", "center", "grid"]);
const TOOTH_RE = /^\d{2}$/;

function bool(raw: unknown, fallback: boolean) {
  return raw === true || raw === false ? raw : fallback;
}

export function parseCustomAbutmentViewerPrefs(raw: unknown): CustomAbutmentViewerPrefs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS;
  const guide = GUIDE.has(src.centerGuide as CenterGuideMode)
    ? (src.centerGuide as CenterGuideMode)
    : base.centerGuide;
  const transparency = Number(src.scanTransparency);
  const expandedTeeth: Record<string, boolean> = {};
  if (src.expandedTeeth && typeof src.expandedTeeth === "object") {
    for (const [key, value] of Object.entries(src.expandedTeeth as Record<string, unknown>)) {
      if (!TOOTH_RE.test(key) || Object.keys(expandedTeeth).length >= 64) continue;
      if (value === true || value === false) expandedTeeth[key] = value;
    }
  }
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
    chatOpen: src.chatOpen === true || src.chatOpen === false ? src.chatOpen : null,
    infoExpanded: bool(src.infoExpanded, base.infoExpanded),
    expandedTeeth,
  };
}

export async function loadCustomAbutmentViewerPrefs(
  token: string,
): Promise<CustomAbutmentViewerPrefs> {
  const res = await apiFetch<{ data?: { prefs?: unknown } }>({
    path: "/api/users/custom-abutment-viewer",
    method: "GET",
    token,
  });
  if (!res.ok) return { ...DEFAULT_CUSTOM_ABUTMENT_VIEWER_PREFS, expandedTeeth: {} };
  return parseCustomAbutmentViewerPrefs(res.data?.data?.prefs);
}

let viewerSaveInflight: Promise<void> | null = null;
let viewerSaveQueued: { token: string; prefs: CustomAbutmentViewerPrefs; key: string } | null = null;
let viewerSaveLastKey = "";

export async function saveCustomAbutmentViewerPrefs(
  token: string,
  prefs: CustomAbutmentViewerPrefs,
): Promise<void> {
  const key = JSON.stringify(prefs);
  if (key === viewerSaveLastKey && !viewerSaveQueued) return;
  viewerSaveQueued = { token, prefs, key };
  if (viewerSaveInflight) return viewerSaveInflight;
  viewerSaveInflight = (async () => {
    let sent = 0;
    while (viewerSaveQueued && sent < 2) {
      const job = viewerSaveQueued;
      viewerSaveQueued = null;
      if (job.key === viewerSaveLastKey) continue;
      await apiFetch({
        path: "/api/users/custom-abutment-viewer",
        method: "PUT",
        token: job.token,
        jsonBody: job.prefs,
      });
      viewerSaveLastKey = job.key;
      sent += 1;
    }
  })().finally(() => {
    viewerSaveInflight = null;
    const pending = viewerSaveQueued;
    if (pending && pending.key !== viewerSaveLastKey) {
      viewerSaveQueued = null;
      void saveCustomAbutmentViewerPrefs(pending.token, pending.prefs);
    }
  });
  return viewerSaveInflight;
}
