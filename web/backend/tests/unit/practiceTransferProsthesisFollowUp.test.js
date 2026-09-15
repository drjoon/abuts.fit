// related files:
// - web/backend/utils/practiceTransferProsthesisFollowUp.js
import {
  applyProsthesisFollowUpTempCredit,
  buildFollowUpToothWorksDraft,
  buildProsthesisFeeStageRecord,
  buildToothWorkDisplayByTooth,
  canAppendProsthesisFollowUp,
  canManagePendingProsthesisFollowUp,
  cloneToothWorksForStageSnapshot,
  hydrateProsthesisFeeStages,
  isPendingProsthesisFollowUpRecord,
  listPendingFollowUpTempSpans,
  listProsthesisFeeStages,
  patchProsthesisFeeStageArrivalYmd,
  pickSourceTempRowsForFollowUpCredit,
  PROSTHESIS_FEE_STAGE_TEMP_KEY,
  removeProsthesisFeeStagesByFollowUpIndexes,
  serializeFollowUpToothWorksForChatPayload,
  serializeProsthesisFeeStagesForApi,
  stripFollowUpToothWorksForRecord,
  upsertProsthesisFeeStage,
  validateFollowUpToothWorksAgainstSource,
  zirconiaProsthesisFeeStageKey,
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

  test("listPendingFollowUpTempSpans merges adjacent-only links into one span", () => {
    // 치아별 bridgeLinkedTeeth가 인접만 있어도 44-45-46은 스팬 1개
    const toothWorks = [
      {
        toothNumber: "46",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["45"],
      },
      {
        toothNumber: "44",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["45"],
      },
      {
        toothNumber: "45",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["44", "46"],
      },
      {
        toothNumber: "33",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["34"],
      },
      {
        toothNumber: "34",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["33"],
      },
    ];
    const spans = listPendingFollowUpTempSpans(toothWorks);
    expect(spans).toHaveLength(2);
    const keys = spans.map(({ teeth }) => teeth.join("-")).sort();
    expect(keys).toEqual(["34-33", "44-45-46"]);
    const draft = buildFollowUpToothWorksDraft(toothWorks);
    expect(draft).toHaveLength(2);
    expect(draft.every((row) => row.prosthesisType === "브리지")).toBe(true);
    expect(
      draft.map((row) => (row.bridgeLinkedTeeth || []).join("-")).sort(),
    ).toEqual(["34-33", "44-45-46"]);
  });

  test("anterior midline 12-11-21-22 stays one follow-up span", () => {
    // 정중선 11↔21 포함 — 의뢰상세와 같이 전치부 임시치아 1스팬 → 지르 초안도 1행
    const toothWorks = [
      { toothNumber: "15", prosthesisType: "임시치아", bridgeLinkedTeeth: ["14"] },
      { toothNumber: "14", prosthesisType: "임시치아", bridgeLinkedTeeth: ["15"] },
      { toothNumber: "12", prosthesisType: "임시치아", bridgeLinkedTeeth: ["11"] },
      {
        toothNumber: "11",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["12", "21"],
      },
      {
        toothNumber: "21",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["11", "22"],
      },
      { toothNumber: "22", prosthesisType: "임시치아", bridgeLinkedTeeth: ["21"] },
    ];
    const spans = listPendingFollowUpTempSpans(toothWorks);
    expect(spans.map(({ teeth }) => teeth.join("-")).sort()).toEqual([
      "12-11-21-22",
      "15-14",
    ]);
    const draft = buildFollowUpToothWorksDraft(toothWorks);
    expect(draft).toHaveLength(2);
    const anterior = draft.find((row) => String(row.toothNumber) === "12");
    expect(anterior?.prosthesisType).toBe("브리지");
    expect(anterior?.bridgeLinkedTeeth).toEqual(["12", "11", "21", "22"]);
  });

  test("pickSourceTempRowsForFollowUpCredit includes all teeth in follow-up span", () => {
    const source = [
      {
        toothNumber: "46",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["45"],
      },
      {
        toothNumber: "44",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["45"],
      },
      {
        toothNumber: "45",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["44", "46"],
      },
    ];
    const followUp = buildFollowUpToothWorksDraft(source);
    const credited = pickSourceTempRowsForFollowUpCredit(source, followUp);
    expect(credited.map((row) => row.toothNumber).sort()).toEqual([
      "44",
      "45",
      "46",
    ]);
  });

  test("차트 표시는 후속 보철 형태를 쓰되 CA는 원 임시치아 입력을 유지한다", () => {
    const toothWorks = [
      {
        toothNumber: "46",
        prosthesisType: "임시치아",
        customAbutment: true,
        abutmentManufacturer: "NEO",
        bridgeLinkedTeeth: ["45", "44"],
      },
      {
        toothNumber: "45",
        prosthesisType: "임시치아",
        customAbutment: false,
        bridgeLinkedTeeth: ["46", "44"],
      },
      {
        toothNumber: "44",
        prosthesisType: "임시치아",
        customAbutment: true,
        abutmentManufacturer: "NEO",
        bridgeLinkedTeeth: ["46", "45"],
      },
      // 후속 스팬 행이 CA=true로 덮어도 원 45 무CA가 남아야 함
      {
        toothNumber: "46",
        prosthesisType: "브리지",
        prosthesisPhase: "followUp",
        customAbutment: true,
        bridgeLinkedTeeth: ["46", "45", "44"],
      },
      {
        toothNumber: "45",
        prosthesisType: "브리지",
        prosthesisPhase: "followUp",
        customAbutment: true,
        bridgeLinkedTeeth: ["45", "46"],
      },
      {
        toothNumber: "44",
        prosthesisType: "브리지",
        prosthesisPhase: "followUp",
        customAbutment: false,
        bridgeLinkedTeeth: ["44", "45", "46"],
      },
    ];
    const byTooth = buildToothWorkDisplayByTooth(toothWorks);
    expect(byTooth.get("46")?.prosthesisType).toBe("브리지");
    expect(byTooth.get("45")?.prosthesisType).toBe("브리지");
    expect(byTooth.get("44")?.prosthesisType).toBe("브리지");
    expect(byTooth.get("46")?.customAbutment).toBe(true);
    expect(byTooth.get("45")?.customAbutment).toBe(false);
    expect(byTooth.get("44")?.customAbutment).toBe(true);
    expect(byTooth.get("46")?.abutmentManufacturer).toBe("NEO");
  });

  test("부분 후속 — 원 행만 보면 전부 임시치아, 합치면 전환 치아만 지르", () => {
    const toothWorks = [
      {
        toothNumber: "15",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["15", "14"],
      },
      {
        toothNumber: "14",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["15", "14"],
      },
      {
        toothNumber: "24",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["24", "25"],
      },
      {
        toothNumber: "25",
        prosthesisType: "임시치아",
        bridgeLinkedTeeth: ["24", "25"],
      },
      {
        toothNumber: "15",
        prosthesisType: "브리지",
        prosthesisPhase: "followUp",
        bridgeLinkedTeeth: ["15", "14"],
      },
    ];
    const baseOnly = toothWorks.filter(
      (row) => String(row.prosthesisPhase || "").trim() !== "followUp",
    );
    const baseDisplay = buildToothWorkDisplayByTooth(baseOnly);
    expect(baseDisplay.get("15")?.prosthesisType).toBe("임시치아");
    expect(baseDisplay.get("14")?.prosthesisType).toBe("임시치아");
    expect(baseDisplay.get("24")?.prosthesisType).toBe("임시치아");
    expect(baseDisplay.get("25")?.prosthesisType).toBe("임시치아");

    const merged = buildToothWorkDisplayByTooth(toothWorks);
    expect(merged.get("15")?.prosthesisType).toBe("브리지");
    expect(merged.get("14")?.prosthesisType).toBe("브리지");
    expect(merged.get("24")?.prosthesisType).toBe("임시치아");
    expect(merged.get("25")?.prosthesisType).toBe("임시치아");
  });

  test("prosthesisFeeStages upsert keeps existing temp stage and adds zirconia", () => {
    const temp = buildProsthesisFeeStageRecord({
      key: PROSTHESIS_FEE_STAGE_TEMP_KEY,
      followUpIndex: -1,
      title: "임시치아 단계",
      fees: {
        labFeeTotal: 70000,
        total: 150000,
        lines: [
          {
            toothNumber: "34",
            prosthesisType: "임시치아",
            labFee: 30000,
            labAbutmentFee: 40000,
            abutmentRetail: 0,
          },
        ],
      },
    });
    let stages = upsertProsthesisFeeStage([], temp);
    expect(stages).toHaveLength(1);
    expect(stages[0].key).toBe("temp");
    expect(stages[0].total).toBe(150000);
    expect(stages[0].lines).toHaveLength(1);

    // 같은 key 재upsert는 덮어쓰지 않음
    stages = upsertProsthesisFeeStage(
      stages,
      buildProsthesisFeeStageRecord({
        key: PROSTHESIS_FEE_STAGE_TEMP_KEY,
        followUpIndex: -1,
        fees: { labFeeTotal: 1, total: 1, lines: [] },
      }),
    );
    expect(stages[0].total).toBe(150000);

    stages = upsertProsthesisFeeStage(
      stages,
      buildProsthesisFeeStageRecord({
        key: zirconiaProsthesisFeeStageKey(0),
        followUpIndex: 0,
        title: "지르 보철 단계",
        fees: {
          labFeeTotal: 120000,
          total: 120000,
          lines: [
            {
              toothNumber: "34",
              prosthesisType: "브리지",
              labFee: 60000,
              labAbutmentFee: 0,
              abutmentRetail: 0,
            },
            {
              toothNumber: "33",
              prosthesisType: "브리지",
              labFee: 60000,
              labAbutmentFee: 0,
              abutmentRetail: 0,
            },
          ],
        },
        netLabFeeTotal: 90000,
        netTotal: 90000,
        tempCreditLabFeeTotal: 30000,
      }),
    );
    expect(listProsthesisFeeStages(stages).map((s) => s.key)).toEqual([
      "temp",
      "zirconia-0",
    ]);
    expect(stages[1].labFeeTotal).toBe(120000);
    expect(stages[1].netLabFeeTotal).toBe(90000);
    expect(stages[1].lines).toHaveLength(2);

    const afterCancel = removeProsthesisFeeStagesByFollowUpIndexes(stages, [0]);
    expect(afterCancel.map((s) => s.key)).toEqual(["temp"]);
  });

  test("stage toothWorks snapshot is immutable across zirconia upsert", () => {
    const tempRows = [
      {
        toothNumber: "16",
        prosthesisType: "임시치아",
        customAbutment: true,
        bridgeLinkedTeeth: ["16"],
      },
      {
        toothNumber: "17",
        prosthesisType: "임시치아",
        customAbutment: false,
        bridgeLinkedTeeth: ["17"],
      },
    ];
    let stages = upsertProsthesisFeeStage(
      [],
      buildProsthesisFeeStageRecord({
        key: PROSTHESIS_FEE_STAGE_TEMP_KEY,
        followUpIndex: -1,
        title: "임시치아 단계",
        toothWorks: tempRows,
        fees: {
          labFeeTotal: 60000,
          total: 140000,
          lines: [
            {
              toothNumber: "16",
              prosthesisType: "임시치아",
              labFee: 30000,
              labAbutmentFee: 40000,
              abutmentRetail: 0,
            },
            {
              toothNumber: "17",
              prosthesisType: "임시치아",
              labFee: 30000,
              labAbutmentFee: 0,
              abutmentRetail: 0,
            },
          ],
        },
        orderYmd: "2026-09-15",
        arrivalYmd: "2026-09-18",
      }),
    );
    expect(stages[0].toothWorks).toHaveLength(2);
    expect(stages[0].toothWorks.map((r) => r.prosthesisType)).toEqual([
      "임시치아",
      "임시치아",
    ]);

    const zirRows = [
      {
        toothNumber: "16",
        prosthesisType: "브리지",
        prosthesisPhase: "followUp",
        bridgeLinkedTeeth: ["16", "17"],
      },
    ];
    stages = upsertProsthesisFeeStage(
      stages,
      buildProsthesisFeeStageRecord({
        key: zirconiaProsthesisFeeStageKey(0),
        followUpIndex: 0,
        toothWorks: zirRows,
        fees: {
          labFeeTotal: 120000,
          total: 120000,
          lines: [
            {
              toothNumber: "16",
              prosthesisType: "브리지",
              labFee: 120000,
              labAbutmentFee: 0,
              abutmentRetail: 0,
            },
          ],
        },
        netLabFeeTotal: 90000,
        netTotal: 90000,
        tempCreditLabFeeTotal: 30000,
        orderYmd: "2026-09-15",
        arrivalYmd: "2026-09-15",
        previousOrderYmd: "2026-09-15",
        previousArrivalYmd: "2026-09-18",
      }),
    );

    // temp 치식·견적 불변
    expect(stages[0].key).toBe("temp");
    expect(stages[0].total).toBe(140000);
    expect(stages[0].toothWorks.map((r) => r.prosthesisType)).toEqual([
      "임시치아",
      "임시치아",
    ]);
    // zir = gross; net은 hold용
    expect(stages[1].total).toBe(120000);
    expect(stages[1].netLabFeeTotal).toBe(90000);
    expect(stages[1].toothWorks[0].prosthesisType).toBe("브리지");

    // 같은 temp key 재upsert는 toothWorks도 덮지 않음
    stages = upsertProsthesisFeeStage(
      stages,
      buildProsthesisFeeStageRecord({
        key: PROSTHESIS_FEE_STAGE_TEMP_KEY,
        followUpIndex: -1,
        toothWorks: zirRows,
        fees: { labFeeTotal: 1, total: 1, lines: [] },
      }),
    );
    expect(stages[0].total).toBe(140000);
    expect(stages[0].toothWorks.map((r) => r.prosthesisType)).toEqual([
      "임시치아",
      "임시치아",
    ]);

    const serialized = serializeProsthesisFeeStagesForApi(stages);
    expect(serialized[0].toothWorks).toHaveLength(2);
    expect(serialized[1].previousArrivalYmd).toBe("2026-09-18");
  });

  test("hydrateProsthesisFeeStages fills missing toothWorks without overwriting fees", () => {
    const caseRows = [
      { toothNumber: "11", prosthesisType: "임시치아", bridgeLinkedTeeth: ["11"] },
      {
        toothNumber: "11",
        prosthesisType: "크라운",
        prosthesisPhase: "followUp",
        bridgeLinkedTeeth: ["11"],
      },
    ];
    const stages = hydrateProsthesisFeeStages({
      prosthesisFeeStages: [
        buildProsthesisFeeStageRecord({
          key: PROSTHESIS_FEE_STAGE_TEMP_KEY,
          followUpIndex: -1,
          fees: {
            labFeeTotal: 50000,
            total: 90000,
            lines: [
              {
                toothNumber: "11",
                prosthesisType: "임시치아",
                labFee: 50000,
                labAbutmentFee: 0,
                abutmentRetail: 0,
              },
            ],
          },
        }),
      ],
      prosthesisFollowUps: [
        {
          followUpIndex: 0,
          arrivalYmd: "2026-09-20",
          orderYmd: "2026-09-20",
          previousArrivalYmd: "2026-09-15",
          previousOrderYmd: "2026-09-15",
          toothNumbers: ["11"],
          billingDelta: {
            labFeeTotal: 40000,
            total: 40000,
            finalLabFeeTotal: 90000,
            finalTotal: 90000,
            tempCreditLabFeeTotal: 50000,
            lines: [
              {
                toothNumber: "11",
                prosthesisType: "크라운",
                labFee: 90000,
                labAbutmentFee: 0,
                abutmentRetail: 0,
              },
            ],
          },
        },
      ],
      toothWorks: caseRows,
      orderYmd: "2026-09-15",
      arrivalYmd: "2026-09-15",
    });
    expect(stages.find((s) => s.key === "temp").total).toBe(90000);
    expect(stages.find((s) => s.key === "temp").toothWorks[0].prosthesisType).toBe(
      "임시치아",
    );
    const zir = stages.find((s) => s.key === "zirconia-0");
    expect(zir.total).toBe(90000);
    expect(zir.netLabFeeTotal).toBe(40000);
    expect(zir.toothWorks[0].prosthesisType).toBe("크라운");
  });

  test("patchProsthesisFeeStageArrivalYmd keeps fee and toothWorks", () => {
    let stages = [
      buildProsthesisFeeStageRecord({
        key: zirconiaProsthesisFeeStageKey(0),
        followUpIndex: 0,
        toothWorks: [
          {
            toothNumber: "21",
            prosthesisType: "크라운",
            prosthesisPhase: "followUp",
            bridgeLinkedTeeth: ["21"],
          },
        ],
        fees: { labFeeTotal: 80000, total: 80000, lines: [] },
        netLabFeeTotal: 50000,
        arrivalYmd: "2026-09-16",
      }),
    ];
    stages = patchProsthesisFeeStageArrivalYmd(stages, 0, "2026-09-22");
    expect(stages[0].arrivalYmd).toBe("2026-09-22");
    expect(stages[0].total).toBe(80000);
    expect(stages[0].toothWorks[0].toothNumber).toBe("21");
  });

  test("cloneToothWorksForStageSnapshot keeps abutment specs", () => {
    const cloned = cloneToothWorksForStageSnapshot([
      {
        toothNumber: "36",
        prosthesisType: "임시치아",
        customAbutment: true,
        implantManufacturer: "OSSTEM",
        abutmentDiameter: "4.0",
        bridgeLinkedTeeth: ["36"],
      },
    ]);
    expect(cloned[0].implantManufacturer).toBe("OSSTEM");
    expect(cloned[0].abutmentDiameter).toBe("4.0");
    expect(cloned[0].customAbutment).toBe(true);
  });
});
