// related files:
// - web/backend/utils/practiceTransferAbutmentPresets.js
// - 2026-08-13: 어벗 치아에 임플란트·스캔바디 프리셋이 없으면 전송 거절.
import {
  assertAbutmentPresetsComplete,
  hasCompleteAbutmentPresets,
  listIncompleteAbutmentPresetTeeth,
} from "../../utils/practiceTransferAbutmentPresets.js";

const completeRow = {
  toothNumber: "22",
  prosthesisType: "크라운",
  customAbutment: true,
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

  test("어벗인데 임플란트·스캔바디가 비면 거절한다", () => {
    const teeth = listIncompleteAbutmentPresetTeeth([
      {
        toothNumber: "22",
        prosthesisType: "크라운",
        customAbutment: true,
      },
    ]);
    expect(teeth).toEqual(["22"]);
    expect(hasCompleteAbutmentPresets({ customAbutment: true })).toBe(false);
    expect(() =>
      assertAbutmentPresetsComplete([
        { toothNumber: "22", prosthesisType: "크라운", customAbutment: true },
      ]),
    ).toThrow(/어벗 프리셋/);
  });

  test("임플란트·스캔바디가 모두 있으면 통과한다", () => {
    expect(hasCompleteAbutmentPresets(completeRow)).toBe(true);
    expect(listIncompleteAbutmentPresetTeeth([completeRow])).toEqual([]);
    expect(() => assertAbutmentPresetsComplete([completeRow])).not.toThrow();
  });
});
