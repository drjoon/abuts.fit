// related files:
// - web/backend/utils/practiceTransferAbutmentPresets.js
// - 2026-08-13: 어벗 치아에 임플란트·스캔바디 프리셋이 없으면 전송 거절.
// - 2026-09-15: 어벗 라디오는 임플란트만 필수(심플·직접입력 규격 선택).
import {
  assertAbutmentPresetsComplete,
  hasCompleteAbutmentPresets,
  isAbutmentPresetMissing,
  isAbutmentPresetRequired,
  listIncompleteAbutmentPresetTeeth,
} from "../../utils/practiceTransferAbutmentPresets.js";

const completeRow = {
  toothNumber: "22",
  prosthesisType: "크라운",
  customAbutment: true,
  customAbutmentSelection: "scanbody",
  implantManufacturer: "Osstem",
  implantBrand: "TS",
  implantFamily: "III",
  implantType: "Regular",
  abutmentManufacturer: "Osstem",
  abutmentDiameter: "4.5",
  abutmentHeight: "5.5",
};

describe("practiceTransferAbutmentPresets", () => {
  test("어벗이 없으면 프리셋을 요구하지 않는다", () => {
    expect(
      listIncompleteAbutmentPresetTeeth([
        { toothNumber: "21", prosthesisType: "크라운", customAbutment: false },
      ]),
    ).toEqual([]);
    expect(() =>
      assertAbutmentPresetsComplete([
        { toothNumber: "21", prosthesisType: "크라운", customAbutment: false },
      ]),
    ).not.toThrow();
  });

  test("스캔바디 라디오인데 임플란트·스캔바디가 비면 거절한다", () => {
    const teeth = listIncompleteAbutmentPresetTeeth([
      {
        toothNumber: "22",
        prosthesisType: "크라운",
        customAbutment: true,
        customAbutmentSelection: "scanbody",
      },
    ]);
    expect(teeth).toEqual(["22"]);
    expect(
      isAbutmentPresetRequired({
        customAbutment: true,
        prosthesisType: "크라운",
        customAbutmentSelection: "scanbody",
      }),
    ).toBe(true);
    expect(hasCompleteAbutmentPresets({ customAbutment: true })).toBe(false);
    expect(() =>
      assertAbutmentPresetsComplete([
        {
          toothNumber: "22",
          prosthesisType: "크라운",
          customAbutment: true,
          customAbutmentSelection: "scanbody",
        },
      ]),
    ).toThrow(/어벗 프리셋/);
  });

  test("어벗 라디오는 임플란트만 있으면 심플 규격 없이도 전송 가능하다", () => {
    const abutmentWithImplant = {
      toothNumber: "24",
      prosthesisType: "임시치아",
      customAbutment: true,
      customAbutmentSelection: "abutment",
      implantManufacturer: "Osstem",
      implantBrand: "TS",
      implantFamily: "III",
      implantType: "Regular",
      abutmentManufacturer: "심플어벗",
      abutmentDiameter: "7",
      abutmentHeight: "M",
    };
    expect(isAbutmentPresetRequired(abutmentWithImplant)).toBe(true);
    expect(isAbutmentPresetMissing(abutmentWithImplant)).toBe(false);
    expect(listIncompleteAbutmentPresetTeeth([abutmentWithImplant])).toEqual([]);
    expect(() => assertAbutmentPresetsComplete([abutmentWithImplant])).not.toThrow();

    const implantOnly = {
      toothNumber: "25",
      prosthesisType: "임시치아",
      customAbutment: true,
      customAbutmentSelection: "abutment",
      implantManufacturer: "Osstem",
      implantBrand: "TS",
      implantFamily: "III",
      implantType: "Regular",
    };
    expect(isAbutmentPresetMissing(implantOnly)).toBe(false);
    expect(listIncompleteAbutmentPresetTeeth([implantOnly])).toEqual([]);
  });

  test("어벗 라디오인데 임플란트가 없으면 거절한다", () => {
    const emptyAbutment = {
      toothNumber: "25",
      prosthesisType: "임시치아",
      customAbutment: true,
      customAbutmentSelection: "abutment",
      abutmentManufacturer: "심플어벗",
      abutmentDiameter: "7",
      abutmentHeight: "M",
    };
    expect(isAbutmentPresetMissing(emptyAbutment)).toBe(true);
    expect(listIncompleteAbutmentPresetTeeth([emptyAbutment])).toEqual(["25"]);
    expect(() => assertAbutmentPresetsComplete([emptyAbutment])).toThrow(/어벗 프리셋/);
  });

  test("단독 커스텀어벗 형태는 라디오와 무관하게 풀 프리셋 필수", () => {
    const standalone = {
      toothNumber: "11",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      customAbutmentSelection: "abutment",
      implantManufacturer: "Osstem",
      implantBrand: "TS",
      implantFamily: "III",
      implantType: "Regular",
    };
    expect(isAbutmentPresetRequired(standalone)).toBe(true);
    expect(listIncompleteAbutmentPresetTeeth([standalone])).toEqual(["11"]);
  });

  test("임플란트·스캔바디가 모두 있으면 통과한다", () => {
    expect(hasCompleteAbutmentPresets(completeRow)).toBe(true);
    expect(listIncompleteAbutmentPresetTeeth([completeRow])).toEqual([]);
    expect(() => assertAbutmentPresetsComplete([completeRow])).not.toThrow();
  });

  test("임플란트·심플어벗이 모두 있으면 통과한다", () => {
    const simpleRow = {
      ...completeRow,
      customAbutmentSelection: "abutment",
      abutmentManufacturer: "심플어벗",
      abutmentDiameter: "8",
      abutmentHeight: "M",
    };
    expect(hasCompleteAbutmentPresets(simpleRow)).toBe(true);
    expect(listIncompleteAbutmentPresetTeeth([simpleRow])).toEqual([]);
    expect(() => assertAbutmentPresetsComplete([simpleRow])).not.toThrow();
  });

  test("심플어벗 규격이 불완전하면 스캔바디 필수 행은 거절한다", () => {
    const incomplete = {
      ...completeRow,
      customAbutmentSelection: "scanbody",
      abutmentManufacturer: "심플밀링",
      abutmentDiameter: "8",
      abutmentHeight: "",
    };
    expect(hasCompleteAbutmentPresets(incomplete)).toBe(false);
    expect(listIncompleteAbutmentPresetTeeth([incomplete])).toEqual(["22"]);
  });

  test("레거시 심플어벗+임플란트면 어벗 라디오로 추론해 허용한다", () => {
    const legacySimple = {
      toothNumber: "15",
      prosthesisType: "크라운",
      customAbutment: true,
      implantManufacturer: "Osstem",
      implantBrand: "TS",
      implantFamily: "III",
      implantType: "Regular",
      abutmentManufacturer: "심플어벗",
      abutmentDiameter: "7",
      abutmentHeight: "M",
    };
    expect(isAbutmentPresetMissing(legacySimple)).toBe(false);
    expect(listIncompleteAbutmentPresetTeeth([legacySimple])).toEqual([]);
  });
});
