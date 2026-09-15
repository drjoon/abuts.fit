// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceAbutmentSideDraft.ts
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-15: 계정(브라우저) 단위 직전 선택 — 임플란트·심플어벗·직접입력·스캔바디·심플힐링.
import {
  isAbutmentSideDraftEmpty,
  writeAbutmentSideDraft,
  type AbutmentSideDraft,
  type AbutmentSideKey,
} from "@/shared/practice/practiceAbutmentSideDraft";
import {
  CUSTOM_ABUTMENT_SELECTION,
  emptyToothWorkAbutment,
  emptyToothWorkImplant,
  hasToothWorkImplantPreset,
  hasToothWorkSimpleAbutment,
  hasToothWorkSimpleHealing,
  isCustomAbutmentProsthesisType,
  pickToothWorkAbutment,
  pickToothWorkImplant,
  resolveCustomAbutmentSelection,
  type CustomAbutmentSelection,
} from "@/shared/practice/transferMemo";

export const PRACTICE_CUSTOM_SPECS_LAST_DEFAULTS_KEY =
  "practice_custom_specs_last_defaults_v1";

export type CustomSpecsLastImplant = ReturnType<typeof emptyToothWorkImplant>;

export type CustomSpecsLastDefaults = {
  implant: CustomSpecsLastImplant;
  simpleAbutment: AbutmentSideDraft;
  directInput: AbutmentSideDraft;
  scanbody: AbutmentSideDraft;
  simpleHealing: AbutmentSideDraft;
  /** 직접어벗 모달에서 마지막으로 커밋한 사이드 */
  lastAbutmentSide: "simpleAbutment" | "directInput" | null;
  /** 스캔바디 모달에서 마지막으로 커밋한 사이드 */
  lastScanbodySide: "scanbody" | "simpleHealing" | null;
  updatedAt: number;
};

const emptyImplant = (): CustomSpecsLastImplant => emptyToothWorkImplant();
const emptyAbutment = (): AbutmentSideDraft => emptyToothWorkAbutment();

const normalizeImplant = (raw: unknown): CustomSpecsLastImplant => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    implantManufacturer: String(row.implantManufacturer || "").trim(),
    implantBrand: String(row.implantBrand || "").trim(),
    implantFamily: String(row.implantFamily || "").trim(),
    implantType: String(row.implantType || "").trim(),
    implantAddRequest: Boolean(row.implantAddRequest),
  };
};

const normalizeAbutment = (raw: unknown): AbutmentSideDraft => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    abutmentManufacturer: String(row.abutmentManufacturer || "").trim(),
    abutmentDiameter: String(row.abutmentDiameter || "").trim(),
    abutmentHeight: String(row.abutmentHeight || "").trim(),
  };
};

const emptyStore = (): CustomSpecsLastDefaults => ({
  implant: emptyImplant(),
  simpleAbutment: emptyAbutment(),
  directInput: emptyAbutment(),
  scanbody: emptyAbutment(),
  simpleHealing: emptyAbutment(),
  lastAbutmentSide: null,
  lastScanbodySide: null,
  updatedAt: 0,
});

const isImplantEmpty = (implant: CustomSpecsLastImplant) =>
  !implant.implantManufacturer &&
  !implant.implantBrand &&
  !implant.implantFamily &&
  !implant.implantType;

export const readCustomSpecsLastDefaults = (): CustomSpecsLastDefaults => {
  try {
    const raw = localStorage.getItem(PRACTICE_CUSTOM_SPECS_LAST_DEFAULTS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<CustomSpecsLastDefaults>;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const lastAbutmentSide =
      parsed.lastAbutmentSide === "simpleAbutment" ||
      parsed.lastAbutmentSide === "directInput"
        ? parsed.lastAbutmentSide
        : null;
    const lastScanbodySide =
      parsed.lastScanbodySide === "scanbody" ||
      parsed.lastScanbodySide === "simpleHealing"
        ? parsed.lastScanbodySide
        : null;
    return {
      implant: normalizeImplant(parsed.implant),
      simpleAbutment: normalizeAbutment(parsed.simpleAbutment),
      directInput: normalizeAbutment(parsed.directInput),
      scanbody: normalizeAbutment(parsed.scanbody),
      simpleHealing: normalizeAbutment(parsed.simpleHealing),
      lastAbutmentSide,
      lastScanbodySide,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return emptyStore();
  }
};

const writeStore = (store: CustomSpecsLastDefaults) => {
  try {
    localStorage.setItem(
      PRACTICE_CUSTOM_SPECS_LAST_DEFAULTS_KEY,
      JSON.stringify({ ...store, updatedAt: Date.now() }),
    );
  } catch {
    // ignore quota / private mode
  }
};

const abutmentHasAny = (draft: AbutmentSideDraft) => !isAbutmentSideDraftEmpty(draft);

/** 확인 시 직전 선택 갱신(비어 있는 필드는 이전 last 유지) */
export const rememberCustomSpecsLastDefaults = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  if (!row) return;
  const prev = readCustomSpecsLastDefaults();
  const next: CustomSpecsLastDefaults = { ...prev };

  if (hasToothWorkImplantPreset(row)) {
    next.implant = pickToothWorkImplant(row, true);
  }

  const abutment = pickToothWorkAbutment(row, true);
  if (hasToothWorkSimpleAbutment(row)) {
    next.simpleAbutment = abutment;
    next.lastAbutmentSide = "simpleAbutment";
  } else if (hasToothWorkSimpleHealing(row)) {
    next.simpleHealing = abutment;
    next.lastScanbodySide = "simpleHealing";
  } else if (abutmentHasAny(abutment)) {
    const selection =
      resolveCustomAbutmentSelection({ ...row, customAbutment: true }) ||
      CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
    if (selection === CUSTOM_ABUTMENT_SELECTION.ABUTMENT) {
      next.directInput = abutment;
      next.lastAbutmentSide = "directInput";
    } else {
      next.scanbody = abutment;
      next.lastScanbodySide = "scanbody";
    }
  }

  writeStore(next);
};

const pickPreferredAbutmentSide = (
  defaults: CustomSpecsLastDefaults,
): "simpleAbutment" | "directInput" | null => {
  if (defaults.lastAbutmentSide === "simpleAbutment") {
    return abutmentHasAny(defaults.simpleAbutment) ? "simpleAbutment" : null;
  }
  if (defaults.lastAbutmentSide === "directInput") {
    return abutmentHasAny(defaults.directInput) ? "directInput" : null;
  }
  if (abutmentHasAny(defaults.simpleAbutment)) return "simpleAbutment";
  if (abutmentHasAny(defaults.directInput)) return "directInput";
  return null;
};

const pickPreferredScanbodySide = (
  defaults: CustomSpecsLastDefaults,
): "scanbody" | "simpleHealing" | null => {
  if (defaults.lastScanbodySide === "scanbody") {
    return abutmentHasAny(defaults.scanbody) ? "scanbody" : null;
  }
  if (defaults.lastScanbodySide === "simpleHealing") {
    return abutmentHasAny(defaults.simpleHealing) ? "simpleHealing" : null;
  }
  if (abutmentHasAny(defaults.scanbody)) return "scanbody";
  if (abutmentHasAny(defaults.simpleHealing)) return "simpleHealing";
  return null;
};

const sideDraft = (
  defaults: CustomSpecsLastDefaults,
  side: AbutmentSideKey,
): AbutmentSideDraft => {
  switch (side) {
    case "simpleAbutment":
      return defaults.simpleAbutment;
    case "directInput":
      return defaults.directInput;
    case "scanbody":
      return defaults.scanbody;
    case "simpleHealing":
      return defaults.simpleHealing;
    default:
      return emptyAbutment();
  }
};

/**
 * 치아 규격이 비어 있을 때 직전 선택을 커밋 값으로 채운다.
 * (확인/다음만으로 진행 가능하도록 toothWorks에 반영. 상대 사이드는 치아 초안으로 보관)
 */
export const applyCustomSpecsLastDefaults = <T extends Partial<ToothWorkSelection>>(
  row: T,
  selection: CustomAbutmentSelection,
): T => {
  const defaults = readCustomSpecsLastDefaults();
  let next: T = { ...row };

  if (!hasToothWorkImplantPreset(next) && !isImplantEmpty(defaults.implant)) {
    next = { ...next, ...defaults.implant };
  }

  const abutmentEmpty =
    !String(next.abutmentManufacturer || "").trim() &&
    !String(next.abutmentDiameter || "").trim() &&
    !String(next.abutmentHeight || "").trim();
  if (!abutmentEmpty) return next;

  const customProsthesis = isCustomAbutmentProsthesisType(
    String(next.prosthesisType || ""),
  );
  const toothNumber = next.toothNumber;

  if (selection === CUSTOM_ABUTMENT_SELECTION.ABUTMENT) {
    if (customProsthesis) return next;
    const preferred = pickPreferredAbutmentSide(defaults);
    if (!preferred) return next;
    const primary = sideDraft(defaults, preferred);
    const otherSide: AbutmentSideKey =
      preferred === "simpleAbutment" ? "directInput" : "simpleAbutment";
    const other = sideDraft(defaults, otherSide);
    next = { ...next, ...primary };
    if (toothNumber != null && abutmentHasAny(other)) {
      writeAbutmentSideDraft(toothNumber, otherSide, other);
    }
    if (toothNumber != null && abutmentHasAny(primary)) {
      writeAbutmentSideDraft(toothNumber, preferred, primary);
    }
    return next;
  }

  // 스캔바디 모달 — 커스텀어벗 보철은 심플힐링 제외(스캔바디만)
  if (customProsthesis) {
    if (!abutmentHasAny(defaults.scanbody)) return next;
    next = { ...next, ...defaults.scanbody };
    if (toothNumber != null) {
      writeAbutmentSideDraft(toothNumber, "scanbody", defaults.scanbody);
    }
    return next;
  }

  const preferred = pickPreferredScanbodySide(defaults);
  if (!preferred) return next;
  const primary = sideDraft(defaults, preferred);
  const otherSide: AbutmentSideKey =
    preferred === "scanbody" ? "simpleHealing" : "scanbody";
  const other = sideDraft(defaults, otherSide);
  next = { ...next, ...primary };
  if (toothNumber != null && abutmentHasAny(other)) {
    writeAbutmentSideDraft(toothNumber, otherSide, other);
  }
  if (toothNumber != null && abutmentHasAny(primary)) {
    writeAbutmentSideDraft(toothNumber, preferred, primary);
  }
  return next;
};

/** 테스트·정리용 */
export const clearCustomSpecsLastDefaults = () => {
  try {
    localStorage.removeItem(PRACTICE_CUSTOM_SPECS_LAST_DEFAULTS_KEY);
  } catch {
    // ignore
  }
};
