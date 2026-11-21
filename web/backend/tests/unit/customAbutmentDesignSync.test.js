import { isStaleDesignWrite, toDesignSyncMeta } from "../../services/customAbutmentDesignSync.js";

describe("custom abutment design sync meta", () => {
  test("a save based on an older server time is stale", () => {
    expect(isStaleDesignWrite(0, 0)).toBe(false);
    expect(isStaleDesignWrite(10, 10)).toBe(false);
    expect(isStaleDesignWrite(10, 11)).toBe(false);
    expect(isStaleDesignWrite(20, 10)).toBe(true);
    expect(isStaleDesignWrite(20, 0)).toBe(true);
  });

  test("sync meta keeps placement and params and drops mesh buffers", () => {
    const meta = toDesignSyncMeta({
      savedAt: 50,
      updatedBy: "user-a",
      version: 67,
      fitVersion: 9,
      teeth: [
        {
          toothNumber: "16",
          fileName: "#16.stl",
          fixture: { jaw: "upper", toothNumber: "16", scanbodyTop: [1, 2, 3] },
          params: { postHeightOffsetMm: 0.4, ignored: "x" },
          overrides: { marginFilletRadiusMm: 0.6 },
          metrics: { postHeightMm: 7.5 },
          gumballEdit: { heightMm: 0.2, shiftLabialMm: 0.1 },
          s3Key: "practice-transfers/t/custom-abutment-preview/16-abutment.stl",
          localPositions: "AAAA",
          crownLocalPositions: "BBBB",
          marginLoopLocal: "CCCC",
        },
        { toothNumber: "99", fixture: { jaw: "upper" } },
      ],
    });
    expect(meta.teeth).toHaveLength(1);
    expect(meta.teeth[0].toothNumber).toBe("16");
    expect(meta.teeth[0].fixture.scanbodyTop).toEqual([1, 2, 3]);
    expect(meta.teeth[0].params).toEqual({ postHeightOffsetMm: 0.4 });
    expect(meta.teeth[0].gumballEdit.heightMm).toBe(0.2);
    expect(meta.teeth[0].s3Key).toBeUndefined();
    expect(meta.teeth[0].localPositions).toBeUndefined();
    expect(meta.teeth[0].marginLoopLocal).toBeUndefined();
    expect(meta.updatedBy).toBe("user-a");
  });

  test("confirm choice is kept and an invalid fixture is dropped", () => {
    const meta = toDesignSyncMeta({
      savedAt: 1,
      mode: "confirmed",
      choice: { cancelDeadlineAt: "2026-11-21T09:05:00.000Z", gracePromoteAt: null },
      teeth: [
        { toothNumber: "17", fixture: { jaw: "side" }, params: { postHeightOffsetMm: 1 } },
        { toothNumber: "16", fixture: { jaw: "lower", toothNumber: "16" }, params: {} },
      ],
    });
    expect(meta.mode).toBe("confirmed");
    expect(meta.choice.cancelDeadlineAt).toBe("2026-11-21T09:05:00.000Z");
    expect(meta.choice.gracePromoteAt).toBeNull();
    expect(meta.teeth.map((row) => row.toothNumber)).toEqual(["16"]);
  });
});
