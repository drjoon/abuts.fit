// related files:
// - web/backend/utils/practiceTransferProsthesisFollowUp.js
import {
  buildFollowUpToothWorksDraft,
  canAppendProsthesisFollowUp,
  canManagePendingProsthesisFollowUp,
  listPendingFollowUpTempSpans,
  stripFollowUpToothWorksForRecord,
} from "../../utils/practiceTransferProsthesisFollowUp.js";

describe("practiceTransferProsthesisFollowUp", () => {
  test("buildFollowUpToothWorksDraft converts linked temp span to bridge", () => {
    const source = [
      {
        toothNumber: "34",
        prosthesisType: "임시치아",
        customAbutment: true,
        bridgeLinkedTeeth: ["34", "33"],
        implantManufacturer: "Osstem",
      },
      {
        toothNumber: "33",
        prosthesisType: "임시치아",
        customAbutment: true,
        bridgeLinkedTeeth: ["34", "33"],
        implantManufacturer: "Osstem",
      },
    ];
    const draft = buildFollowUpToothWorksDraft(source);
    expect(draft).toHaveLength(1);
    expect(draft[0].prosthesisType).toBe("브리지");
    expect(draft[0].prosthesisPhase).toBe("followUp");
    expect(draft[0].customAbutment).toBe(true);
    expect(draft[0].implantManufacturer).toBe("Osstem");
  });

  test("canAppendProsthesisFollowUp allows follow-up before abutment delivery", () => {
    const transfer = {
      status: "active",
      requestorDownloadedAt: new Date(),
      toothWorks: [
        {
          toothNumber: "34",
          prosthesisType: "임시치아",
          customAbutment: true,
          bridgeLinkedTeeth: ["34"],
        },
      ],
      resultFiles: [],
    };
    expect(
      canAppendProsthesisFollowUp(transfer, { abutmentDeliveryInfo: null }).ok,
    ).toBe(true);
    expect(
      canAppendProsthesisFollowUp(transfer, {
        abutmentDeliveryInfo: { deliveredAt: "2026-09-01T00:00:00.000Z" },
      }).ok,
    ).toBe(true);
  });

  test("listPendingFollowUpTempSpans excludes teeth with follow-up already", () => {
    const toothWorks = [
      { toothNumber: "34", prosthesisType: "임시치아", bridgeLinkedTeeth: ["34"] },
      {
        toothNumber: "34",
        prosthesisType: "크라운",
        prosthesisPhase: "followUp",
        bridgeLinkedTeeth: ["34"],
      },
    ];
    expect(listPendingFollowUpTempSpans(toothWorks)).toHaveLength(0);
  });

  test("stripFollowUpToothWorksForRecord removes follow-up rows only", () => {
    const toothWorks = [
      { toothNumber: "33", prosthesisType: "임시치아" },
      {
        toothNumber: "33",
        prosthesisType: "브리지",
        prosthesisPhase: "followUp",
        bridgeLinkedTeeth: ["33", "34"],
      },
    ];
    const next = stripFollowUpToothWorksForRecord(toothWorks, {
      toothNumbers: ["33", "34"],
    });
    expect(next).toHaveLength(1);
    expect(next[0].prosthesisType).toBe("임시치아");
  });

  test("canManagePendingProsthesisFollowUp requires pending record", () => {
    expect(
      canManagePendingProsthesisFollowUp({
        prosthesisFollowUps: [{ arrivalYmd: "2026-09-11" }],
      }).ok,
    ).toBe(true);
    expect(
      canManagePendingProsthesisFollowUp({
        prosthesisFollowUps: [{ arrivalYmd: "2026-09-11", labAcceptedAt: new Date() }],
      }).ok,
    ).toBe(false);
  });
});
