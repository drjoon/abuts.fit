import {
  isStaleDesignWrite,
  sanitizeBiteCheck,
  sanitizeSharedChrome,
  sanitizeSharedDesignView,
  toDesignSyncMeta,
} from "../../services/customAbutmentDesignSync.js";

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
          insertionAxisWorld: [0, 0, -2],
          variantId: "buccal_top_open",
          picker: true,
          candidateIndex: 1,
          candidates: [
            { id: "buccal_top_open", label: "협측 상단" },
            { id: "space_fill", label: "기본" },
            { id: "nope", label: "버림" },
          ],
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
    expect(meta.teeth[0].insertionAxisWorld).toEqual([0, 0, -1]);
    expect(meta.teeth[0].variantId).toBe("buccal_top_open");
    expect(meta.teeth[0].picker).toBe(true);
    expect(meta.teeth[0].candidateIndex).toBe(1);
    expect(meta.teeth[0].candidates.map((row) => row.id)).toEqual(["buccal_top_open", "space_fill"]);
    expect(meta.teeth[0].s3Key).toBeUndefined();
    expect(meta.teeth[0].localPositions).toBeUndefined();
    expect(meta.teeth[0].marginLoopLocal).toBeUndefined();
    expect(meta.updatedBy).toBe("user-a");
    expect(meta.biteCheck).toBeUndefined();
  });

  test("sync meta keeps a confirmed bite and drops a broken one", () => {
    const bite = sanitizeBiteCheck({
      checkedAt: 40,
      qualityOk: true,
      moved: false,
      source: "manual",
    });
    expect(bite.source).toBe("manual");
    expect(sanitizeBiteCheck({ checkedAt: 0, qualityOk: true })).toBeNull();
    const meta = toDesignSyncMeta({
      savedAt: 40,
      biteCheck: bite,
      teeth: [{ toothNumber: "16", fixture: { jaw: "upper" }, params: {} }],
    });
    expect(meta.biteCheck).toEqual(bite);
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

  test("shared view keeps a camera pose and drops a broken one", () => {
    const view = sanitizeSharedDesignView({
      pos: [0, 0, 80],
      quat: [0, 0, 0, 1],
      up: [0, 1, 0],
      target: [1, 2, 3],
      zoom: 1.5,
      top: 20,
      bottom: -20,
      left: -30,
      right: 30,
    });
    expect(view.zoom).toBe(1.5);
    expect(view.target).toEqual([1, 2, 3]);
    expect(sanitizeSharedDesignView({ pos: [0, 0, 1], target: [0, 0, 1] })).toBeNull();
  });

  test("shared chrome keeps jaw visibility and the selected tooth", () => {
    const chrome = sanitizeSharedChrome({
      showUpper: false,
      showLower: true,
      scanTransparency: 40,
      centerGuide: "grid",
      selectedTeeth: ["43", "99"],
      expandedTeeth: { "43": true, "35": false, bad: true },
    });
    expect(chrome.showUpper).toBe(false);
    expect(chrome.showLower).toBe(true);
    expect(chrome.scanTransparency).toBe(40);
    expect(chrome.centerGuide).toBe("grid");
    expect(chrome.selectedTeeth).toEqual(["43"]);
    expect(chrome.expandedTeeth).toEqual({ 43: true, 35: false });
    expect(sanitizeSharedChrome(null)).toBeNull();
  });
});
