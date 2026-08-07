// related files:
// - web/backend/controllers/cnc/distribution.utils.js
// - web/backend/controllers/cnc/production.js
// - web/backend/controllers/requests/common.review.machine.js
import {
  inferRequestDiameterGroup,
  isRequestDiameterCompatibleWithMachineMaterial,
  machineMaterialCoversMaxDiameter,
  rankCoveringMachinesForRequest,
} from "../../controllers/cnc/distribution.utils.js";

describe("diameter cover ranking (≤8mm → 8mm first)", () => {
  const m4 = {
    machineId: "M4",
    currentMaterial: { diameter: 8, diameterGroup: "8" },
    maxModelDiameterGroups: ["8", "6"],
  };
  const m5 = {
    machineId: "M5",
    currentMaterial: { diameter: 10, diameterGroup: "10" },
    maxModelDiameterGroups: ["10"],
  };

  test("Ø5.9 request group is 6 but both M4/M5 cover by material", () => {
    const req = { caseInfos: { maxDiameter: 5.9 } };
    expect(inferRequestDiameterGroup(req)).toBe("6");
    expect(machineMaterialCoversMaxDiameter(8, 5.9)).toBe(true);
    expect(machineMaterialCoversMaxDiameter(10, 5.9)).toBe(true);
    expect(
      isRequestDiameterCompatibleWithMachineMaterial({
        requestDoc: req,
        machineMeta: m4,
      }),
    ).toBe(true);
    expect(
      isRequestDiameterCompatibleWithMachineMaterial({
        requestDoc: req,
        machineMeta: m5,
      }),
    ).toBe(true);
  });

  test("Ø5.9 prefers M4 even when M5 queue is empty", () => {
    const ranked = rankCoveringMachinesForRequest({
      requestDoc: { caseInfos: { maxDiameter: 5.9 } },
      machines: [
        { machineId: "M5", machineMeta: m5, queue: 0 },
        { machineId: "M4", machineMeta: m4, queue: 3 },
      ],
    });
    expect(ranked.map((r) => r.machineId)).toEqual(["M4", "M5"]);
  });

  test("Ø9.2 only covers on M5", () => {
    const ranked = rankCoveringMachinesForRequest({
      requestDoc: { caseInfos: { maxDiameter: 9.2 } },
      machines: [
        { machineId: "M4", machineMeta: m4, queue: 0 },
        { machineId: "M5", machineMeta: m5, queue: 2 },
      ],
    });
    expect(ranked.map((r) => r.machineId)).toEqual(["M5"]);
  });

  test("same material diameter breaks ties by lower queue then machineId", () => {
    const m4b = {
      machineId: "M4B",
      currentMaterial: { diameter: 8, diameterGroup: "8" },
      maxModelDiameterGroups: ["8", "6"],
    };
    const ranked = rankCoveringMachinesForRequest({
      requestDoc: { caseInfos: { maxDiameter: 5.9 } },
      machines: [
        { machineId: "M4B", machineMeta: m4b, queue: 2 },
        { machineId: "M4", machineMeta: m4, queue: 1 },
      ],
    });
    expect(ranked[0].machineId).toBe("M4");
  });
});
