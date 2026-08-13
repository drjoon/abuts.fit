// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// - 2026-08-13: 유지장치·임시치아 연결도 드래프트에서 복원(isLinkableProsthesisType).

import {
  isLinkableProsthesisType,
  pickToothWorkAbutmentProductMode,
  pickToothWorkCustomSpecs,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export type DraftToothWorkSelection = ToothWorkSelection;

export const restoreToothWorksFromDraft = (
  source: unknown,
  options: {
    prosthesisTypes: string[];
    isCustomAbutmentSupportedProsthesisType: (prosthesisType: string) => boolean;
    /** @deprecated 연결 유지 여부는 isLinkableProsthesisType SSOT */
    isBridgeLikeProsthesisType?: (prosthesisType: string) => boolean;
    getAdjacentTeeth: (toothNumber: string) => string[];
    fallbackProsthesisType?: string;
  },
): DraftToothWorkSelection[] => {
  if (!Array.isArray(source)) return [];

  const fallbackType =
    options.prosthesisTypes[0] || options.fallbackProsthesisType || "크라운";

  return source.map((raw) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const toothNumber = String(row.toothNumber || "").trim();
    const prosthesisTypeRaw = String(row.prosthesisType || "").trim();
    const prosthesisType = options.prosthesisTypes.some((type) => type === prosthesisTypeRaw)
      ? prosthesisTypeRaw
      : fallbackType;

    const customAbutment = /커스텀어벗|(?:커스텀)?어벗디자인/i.test(
      String(prosthesisType || "").replace(/\s+/g, ""),
    )
      ? true
      : options.isCustomAbutmentSupportedProsthesisType(prosthesisType)
        ? Boolean(row.customAbutment)
        : false;

    const adjacent = options.getAdjacentTeeth(toothNumber);
    const bridgeLinkedTeeth =
      isLinkableProsthesisType(prosthesisType) && Array.isArray(row.bridgeLinkedTeeth)
        ? row.bridgeLinkedTeeth
            .map((v) => String(v || "").trim())
            .filter((v) => adjacent.includes(v))
        : [];

    return {
      toothNumber,
      prosthesisType,
      customAbutment,
      ...pickToothWorkAbutmentProductMode(row, customAbutment),
      bridgeLinkedTeeth,
      ...pickToothWorkCustomSpecs(
        {
          implantManufacturer: String(row.implantManufacturer || "").trim(),
          implantBrand: String(row.implantBrand || "").trim(),
          implantFamily: String(row.implantFamily || "").trim(),
          implantType: String(row.implantType || "").trim(),
          abutmentManufacturer: String(row.abutmentManufacturer || "").trim(),
          abutmentDiameter: String(row.abutmentDiameter || "").trim(),
          abutmentHeight: String(row.abutmentHeight || "").trim(),
        },
        customAbutment,
      ),
    };
  });
};
