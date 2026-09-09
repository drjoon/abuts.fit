// related files:
// - web/backend/services/practiceTransferRemakeCharge.service.js
import {
  collectChargedRemakePartKeys,
  filterUnchargedRemakeSelectedParts,
  remakeChargePartKey,
  stripCaFromLabChargeSelectedParts,
} from "../../services/practiceTransferRemakeCharge.service.js";

describe("practiceTransferRemakeCharge part dedupe", () => {
  test("remakeChargePartKey normalizes kinds", () => {
    expect(remakeChargePartKey(0, "prosthesis")).toBe("0:prosthesis");
    expect(remakeChargePartKey(2, "ca")).toBe("2:ca");
    expect(remakeChargePartKey(-1, "ca")).toBe("");
  });

  test("collectChargedRemakePartKeys reads selectedParts", () => {
    const keys = collectChargedRemakePartKeys([
      {
        selectedParts: [
          { index: 0, prosthesis: true, customAbutment: false },
          { index: 1, prosthesis: false, customAbutment: true },
        ],
      },
      {
        selectedParts: [{ index: 2, ca: true }],
      },
    ]);
    expect(keys.has("0:prosthesis")).toBe(true);
    expect(keys.has("1:ca")).toBe(true);
    expect(keys.has("2:ca")).toBe(true);
    expect(keys.has("0:ca")).toBe(false);
  });

  test("filterUnchargedRemakeSelectedParts skips already charged CA", () => {
    const remakeCharges = [
      {
        selectedParts: [{ index: 1, prosthesis: false, customAbutment: true }],
      },
    ];
    const result = filterUnchargedRemakeSelectedParts(
      [
        { index: 1, prosthesis: false, customAbutment: true },
        { index: 2, prosthesis: false, customAbutment: true },
      ],
      remakeCharges,
    );
    expect(result.allSkipped).toBe(false);
    expect(result.remainingParts).toEqual([
      { index: 2, prosthesis: false, customAbutment: true },
    ]);
    expect(result.removedKeys).toContain("1:ca");
  });

  test("filterUnchargedRemakeSelectedParts allSkipped when lab then ca same part", () => {
    const remakeCharges = [
      {
        selectedParts: [
          { index: 0, prosthesis: true, customAbutment: true },
        ],
      },
    ];
    const result = filterUnchargedRemakeSelectedParts(
      [{ index: 0, prosthesis: false, customAbutment: true }],
      remakeCharges,
    );
    expect(result.allSkipped).toBe(true);
    expect(result.remainingParts).toEqual([]);
  });

  test("filter strips charged prosthesis but keeps uncharged CA on same index", () => {
    const remakeCharges = [
      {
        selectedParts: [{ index: 0, prosthesis: true, customAbutment: false }],
      },
    ];
    const result = filterUnchargedRemakeSelectedParts(
      [{ index: 0, prosthesis: true, customAbutment: true }],
      remakeCharges,
    );
    expect(result.allSkipped).toBe(false);
    expect(result.remainingParts).toEqual([
      { index: 0, prosthesis: false, customAbutment: true },
    ]);
  });

  test("stripCaFromLabChargeSelectedParts keeps prosthesis only", () => {
    const result = stripCaFromLabChargeSelectedParts([
      { index: 0, prosthesis: true, customAbutment: true },
      { index: 1, prosthesis: false, customAbutment: true },
      { index: 2, prosthesis: true, customAbutment: false },
    ]);
    expect(result.strippedCa).toBe(true);
    expect(result.parts).toEqual([
      { index: 0, prosthesis: true, customAbutment: false },
      { index: 2, prosthesis: true, customAbutment: false },
    ]);
  });

  test("stripCaFromLabChargeSelectedParts empty when CA-only selection", () => {
    const result = stripCaFromLabChargeSelectedParts([
      { index: 1, prosthesis: false, customAbutment: true },
    ]);
    expect(result.strippedCa).toBe(true);
    expect(result.parts).toEqual([]);
  });
});
