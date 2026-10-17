// 제조사 워크시트 PreviewModal STL 뷰어 — 그리드·메타·안내(피니시라인 등) on/off
const STORAGE_KEY = "abuts_worksheet_preview_overlay_prefs_v1";

export type PreviewOverlayPrefs = {
  v: 1;
  grid: boolean;
  meta: boolean;
  guides: boolean;
  /** 보정 솔리드 덧입혀 표시. 기본 off(원본만). */
  correctionSolid: boolean;
};

const DEFAULT_PREFS: PreviewOverlayPrefs = {
  v: 1,
  grid: true,
  meta: true,
  guides: true,
  correctionSolid: false,
};

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function loadPreviewOverlayPrefs(): PreviewOverlayPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PreviewOverlayPrefs> | null;
    if (!parsed || parsed.v !== 1) return DEFAULT_PREFS;
    return {
      v: 1,
      grid: parseBool(parsed.grid, DEFAULT_PREFS.grid),
      meta: parseBool(parsed.meta, DEFAULT_PREFS.meta),
      guides: parseBool(parsed.guides, DEFAULT_PREFS.guides),
      correctionSolid: parseBool(
        parsed.correctionSolid,
        DEFAULT_PREFS.correctionSolid,
      ),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePreviewOverlayPrefs(
  patch: Partial<Pick<PreviewOverlayPrefs, "grid" | "meta" | "guides" | "correctionSolid">>,
) {
  if (typeof window === "undefined") return;
  const next: PreviewOverlayPrefs = { ...loadPreviewOverlayPrefs(), ...patch, v: 1 };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
}
