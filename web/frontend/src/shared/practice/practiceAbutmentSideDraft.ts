// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-14: 심플어벗|직접입력·스캔바디|심플힐링 치아별 사이드 초안(localStorage). 전환·모달 재오픈 복원.
import {
  emptyToothWorkAbutment,
  isSimpleAbutmentKind,
  isSimpleHealingKind,
} from "@/shared/practice/transferMemo";

export type AbutmentSideDraft = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

export type AbutmentSideKey =
  | "simpleAbutment"
  | "directInput"
  | "scanbody"
  | "simpleHealing";

type ToothSideDrafts = Partial<Record<AbutmentSideKey, AbutmentSideDraft>>;

type SideDraftStore = {
  byTooth: Record<string, ToothSideDrafts>;
  updatedAt: number;
};

export const PRACTICE_ABUTMENT_SIDE_DRAFT_KEY = "practice_abutment_side_drafts_v1";

const emptyDraft = (): AbutmentSideDraft => emptyToothWorkAbutment();

const normalizeDraft = (raw: unknown): AbutmentSideDraft => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    abutmentManufacturer: String(row.abutmentManufacturer || "").trim(),
    abutmentDiameter: String(row.abutmentDiameter || "").trim(),
    abutmentHeight: String(row.abutmentHeight || "").trim(),
  };
};

const toothKey = (toothNumber: unknown) => {
  const key = String(toothNumber || "").trim();
  return key || "_";
};

const readStore = (): SideDraftStore => {
  try {
    const raw = localStorage.getItem(PRACTICE_ABUTMENT_SIDE_DRAFT_KEY);
    if (!raw) return { byTooth: {}, updatedAt: 0 };
    const parsed = JSON.parse(raw) as SideDraftStore;
    if (!parsed || typeof parsed !== "object" || !parsed.byTooth) {
      return { byTooth: {}, updatedAt: 0 };
    }
    return {
      byTooth: parsed.byTooth,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return { byTooth: {}, updatedAt: 0 };
  }
};

const writeStore = (store: SideDraftStore) => {
  try {
    localStorage.setItem(
      PRACTICE_ABUTMENT_SIDE_DRAFT_KEY,
      JSON.stringify({ ...store, updatedAt: Date.now() }),
    );
  } catch {
    // ignore
  }
};

export const readAbutmentSideDraft = (
  toothNumber: unknown,
  side: AbutmentSideKey,
): AbutmentSideDraft => {
  const store = readStore();
  const row = store.byTooth[toothKey(toothNumber)];
  return normalizeDraft(row?.[side]);
};

export const writeAbutmentSideDraft = (
  toothNumber: unknown,
  side: AbutmentSideKey,
  draft: AbutmentSideDraft,
) => {
  const store = readStore();
  const key = toothKey(toothNumber);
  const prev = store.byTooth[key] || {};
  store.byTooth[key] = {
    ...prev,
    [side]: normalizeDraft(draft),
  };
  writeStore(store);
};

export const clearAbutmentSideDraft = (
  toothNumber: unknown,
  side: AbutmentSideKey,
) => {
  writeAbutmentSideDraft(toothNumber, side, emptyDraft());
};

export const isAbutmentSideDraftEmpty = (draft: AbutmentSideDraft) =>
  !draft.abutmentManufacturer && !draft.abutmentDiameter && !draft.abutmentHeight;

/** 치아 현재 값을 모달 종류에 맞는 활성 사이드 초안으로 동기화(열기/닫기·재오픈용) */
export const syncActiveAbutmentSideDraft = (params: {
  toothNumber: unknown;
  specs: AbutmentSideDraft;
  /** true=직접어벗 모달(심플|직접), false=스캔바디 모달(스캔|힐링) */
  abutmentModal: boolean;
}): AbutmentSideKey | "empty" => {
  const specs = normalizeDraft(params.specs);
  const side = params.abutmentModal
    ? detectAbutmentModalSide(specs)
    : detectScanbodyModalSide(specs);
  if (side === "empty") return "empty";
  if (!isAbutmentSideDraftEmpty(specs)) {
    writeAbutmentSideDraft(params.toothNumber, side, specs);
  }
  return side;
};

/** 직접어벗 모달: simple | direct | empty */
export const detectAbutmentModalSide = (
  specs: AbutmentSideDraft,
): "simpleAbutment" | "directInput" | "empty" => {
  if (isSimpleAbutmentKind(specs.abutmentManufacturer)) return "simpleAbutment";
  if (
    specs.abutmentManufacturer ||
    specs.abutmentDiameter ||
    specs.abutmentHeight
  ) {
    return "directInput";
  }
  return "empty";
};

/** 스캔바디 모달: scanbody | healing | empty */
export const detectScanbodyModalSide = (
  specs: AbutmentSideDraft,
): "scanbody" | "simpleHealing" | "empty" => {
  if (isSimpleHealingKind(specs.abutmentManufacturer)) return "simpleHealing";
  if (
    specs.abutmentManufacturer ||
    specs.abutmentDiameter ||
    specs.abutmentHeight
  ) {
    return "scanbody";
  }
  return "empty";
};

/**
 * 사이드 전환 시 상대 초안 저장 + 대상 초안 복원 후 patch 병합.
 * 필드 컴포넌트는 항상 manufacturer/diameter/height 전체를 넘긴다.
 */
export const resolveAbutmentSidePatch = (params: {
  toothNumber: unknown;
  current: AbutmentSideDraft;
  patch: Partial<AbutmentSideDraft>;
  targetSide: AbutmentSideKey;
  detectSide: (specs: AbutmentSideDraft) => AbutmentSideKey | "empty";
}): AbutmentSideDraft => {
  const current = normalizeDraft(params.current);
  const incoming = normalizeDraft({
    abutmentManufacturer:
      params.patch.abutmentManufacturer !== undefined
        ? params.patch.abutmentManufacturer
        : current.abutmentManufacturer,
    abutmentDiameter:
      params.patch.abutmentDiameter !== undefined
        ? params.patch.abutmentDiameter
        : current.abutmentDiameter,
    abutmentHeight:
      params.patch.abutmentHeight !== undefined
        ? params.patch.abutmentHeight
        : current.abutmentHeight,
  });
  const currentSide = params.detectSide(current);

  if (isAbutmentSideDraftEmpty(incoming)) {
    clearAbutmentSideDraft(params.toothNumber, params.targetSide);
    return emptyDraft();
  }

  if (currentSide !== "empty" && currentSide !== params.targetSide) {
    writeAbutmentSideDraft(params.toothNumber, currentSide, current);
  }

  const cached = readAbutmentSideDraft(params.toothNumber, params.targetSide);
  const switching = currentSide !== params.targetSide;

  const next: AbutmentSideDraft = switching
    ? {
        abutmentManufacturer:
          incoming.abutmentManufacturer || cached.abutmentManufacturer,
        abutmentDiameter: incoming.abutmentDiameter || cached.abutmentDiameter,
        abutmentHeight: incoming.abutmentHeight || cached.abutmentHeight,
      }
    : incoming;

  writeAbutmentSideDraft(params.toothNumber, params.targetSide, next);
  return next;
};
