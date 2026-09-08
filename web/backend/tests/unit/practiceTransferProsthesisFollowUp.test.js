// related files:
// - web/backend/utils/practiceTransferProsthesisFollowUp.js
import {
  applyProsthesisFollowUpTempCredit,
  buildFollowUpToothWorksDraft,
  canAppendProsthesisFollowUp,
  canManagePendingProsthesisFollowUp,
  isPendingProsthesisFollowUpRecord,
  listPendingFollowUpTempSpans,
  pickSourceTempRowsForFollowUpCredit,
  serializeFollowUpToothWorksForChatPayload,
  stripFollowUpToothWorksForRecord,
  validateFollowUpToothWorksAgainstSource,
} from "../../utils/practiceTransferProsthesisFollowUp.js";
import {
  computePracticeTransferRetailFees,
  LAB_FEE_SCHEDULE_SAMPLE,
} from "../../utils/labFeeSchedule.js";

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

  test("serializeFollowUpToothWorksForChatPayload keeps implant/abutment specs", () => {
    const rows = [
      {
        toothNumber: "46",
        prosthesisType: "브리지",
        customAbutment: true,
        bridgeLinkedTeeth: ["46", "45"],
        prosthesisPhase: "followUp",
        implantManufacturer: "NEO",
        implantBrand: "NEO",
        implantType: "R",
        abutmentManufacturer: "NEO",
        abutmentDiameter: "4.5",
        abutmentHeight: "7.0",
      },
    ];
    const payload = serializeFollowUpToothWorksForChatPayload(rows);
    expect(payload).toHaveLength(1);
    expect(payload[0].implantManufacturer).toBe("NEO");
    expect(payload[0].abutmentManufacturer).toBe("NEO");
    expect(payload[0].abutmentDiameter).toBe("4.5");
    expect(payload[0].abutmentHeight).toBe("7.0");
    expect(payload[0].customAbutment).toBe(true);
    expect(payload[0].prosthesisPhase).toBe("followUp");
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

  test("follow-up appended after main accept stays pending even with labAcceptedAt", () => {
    const requestorDownloadedAt = new Date("2026-09-01T10:00:00+09:00");
    const appendedAt = new Date("2026-09-01T12:00:00+09:00");
    const labAcceptedAt = new Date("2026-09-01T12:05:00+09:00");
    expect(
      isPendingProsthesisFollowUpRecord(
        { arrivalYmd: "2026-09-11", labAcceptedAt, appendedAt },
        requestorDownloadedAt,
      ),
    ).toBe(true);
    expect(
      canManagePendingProsthesisFollowUp({
        prosthesisFollowUps: [
          { arrivalYmd: "2026-09-11", labAcceptedAt, appendedAt },
        ],
        requestorDownloadedAt,
      }).ok,
    ).toBe(true);
  });

  test("follow-up appended before main accept is not pending once labAcceptedAt set", () => {
    const requestorDownloadedAt = new Date("2026-09-01T12:00:00+09:00");
    const appendedAt = new Date("2026-09-01T10:00:00+09:00");
    const labAcceptedAt = new Date("2026-09-01T12:00:00+09:00");
    expect(
      isPendingProsthesisFollowUpRecord(
        { arrivalYmd: "2026-09-11", labAcceptedAt, appendedAt },
        requestorDownloadedAt,
      ),
    ).toBe(false);
  });

  test("validateFollowUpToothWorksAgainstSource allows partial span selection", () => {
    const source = [
      {
        toothNumber: "34",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34", "33"],
      },
      {
        toothNumber: "33",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34", "33"],
      },
      {
        toothNumber: "46",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["46", "45", "44"],
      },
      {
        toothNumber: "45",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["46", "45", "44"],
      },
      {
        toothNumber: "44",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["46", "45", "44"],
      },
    ];
    const draft = buildFollowUpToothWorksDraft(source);
    expect(draft).toHaveLength(2);
    const leftOnly = validateFollowUpToothWorksAgainstSource(source, [draft[0]]);
    expect(leftOnly.ok).toBe(true);
    expect(leftOnly.rows).toHaveLength(1);
    expect(leftOnly.rows[0].prosthesisType).toBe("브리지");
    const partialTooth = validateFollowUpToothWorksAgainstSource(source, [
      {
        toothNumber: "33",
        prosthesisType: "크라운",
        prosthesisPhase: "followUp",
        bridgeLinkedTeeth: ["33"],
      },
    ]);
    expect(partialTooth.ok).toBe(false);
  });

  test("후속 선택 스팬의 원 임시치아만 차감 대상으로 고른다", () => {
    const source = [
      {
        toothNumber: "34",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34", "33"],
      },
      {
        toothNumber: "33",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34", "33"],
      },
      {
        toothNumber: "46",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["46"],
      },
    ];
    const draft = buildFollowUpToothWorksDraft(source);
    const leftOnly = draft.filter((row) =>
      String(row.toothNumber || "") === "34" ||
      (Array.isArray(row.bridgeLinkedTeeth) &&
        row.bridgeLinkedTeeth.includes("34")),
    );
    const creditRows = pickSourceTempRowsForFollowUpCredit(source, leftOnly);
    expect(creditRows).toHaveLength(2);
    expect(creditRows.every((row) => row.prosthesisType === "임시치아")).toBe(
      true,
    );
    expect(
      creditRows.map((row) => row.toothNumber).sort(),
    ).toEqual(["33", "34"]);
  });

  test("후속 견적은 임시치아 기공비를 차감한 순증분만 남긴다", () => {
    const source = [
      {
        toothNumber: "34",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34", "33"],
      },
      {
        toothNumber: "33",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34", "33"],
      },
    ];
    const followUp = buildFollowUpToothWorksDraft(source);
    const tempFees = computePracticeTransferRetailFees({
      toothWorks: source,
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      skipAbutmentFees: true,
    });
    const finalFees = computePracticeTransferRetailFees({
      toothWorks: followUp,
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      skipAbutmentFees: true,
    });
    // 2치 임시치아 3만, 브리지 2×6만=12만 → 순증분 9만
    expect(tempFees.labFeeTotal).toBe(30000);
    expect(finalFees.labFeeTotal).toBe(120000);
    const credited = applyProsthesisFollowUpTempCredit({
      finalLabFeeTotal: finalFees.labFeeTotal,
      finalTotal: finalFees.total,
      tempCreditLabFeeTotal: tempFees.labFeeTotal,
    });
    expect(credited.tempCreditLabFeeTotal).toBe(30000);
    expect(credited.labFeeTotal).toBe(90000);
    expect(credited.total).toBe(90000);
  });
});
