// related files:
// - web/backend/utils/bgCallbackRequestMatch.js
import { describe, expect, it } from "@jest/globals";
import {
  scoreBgFilenameMatchCandidate,
  shouldRefuseNcOverwriteOnProductionOrder,
} from "../../utils/bgCallbackRequestMatch.js";

describe("bgCallbackRequestMatch — copy-sample isolation", () => {
  it("scores copied_sample higher than production order on shared STL", () => {
    const orderScore = scoreBgFilenameMatchCandidate({
      requestLike: { requestCategory: "order", manufacturerStage: "가공" },
      sourceStep: "3-nc",
      hasNcFile: true,
    });
    const sampleScore = scoreBgFilenameMatchCandidate({
      requestLike: {
        requestCategory: "copied_sample",
        manufacturerStage: "준비",
      },
      sourceStep: "3-nc",
      hasNcFile: false,
    });
    expect(sampleScore).toBeGreaterThan(orderScore);
  });

  it("penalizes 3-nc filename fallback onto order that already has ncFile", () => {
    const score = scoreBgFilenameMatchCandidate({
      requestLike: { requestCategory: "order", manufacturerStage: "가공" },
      sourceStep: "3-nc",
      hasNcFile: true,
    });
    expect(score).toBeLessThan(0);
  });

  it("refuses overwriting production ncFile when match is only path/filename fallback", () => {
    expect(
      shouldRefuseNcOverwriteOnProductionOrder({
        sourceStep: "3-nc",
        status: "success",
        matchSource: "filename",
        requestLike: { requestCategory: "order" },
        hasExistingNcFile: true,
      }),
    ).toBe(true);

    expect(
      shouldRefuseNcOverwriteOnProductionOrder({
        sourceStep: "3-nc",
        status: "success",
        matchSource: "pathGuess",
        requestLike: { requestCategory: "order" },
        hasExistingNcFile: true,
      }),
    ).toBe(true);
  });

  it("allows overwrite when identity is explicit requestId/mongoId", () => {
    expect(
      shouldRefuseNcOverwriteOnProductionOrder({
        sourceStep: "3-nc",
        status: "success",
        matchSource: "requestId",
        requestLike: { requestCategory: "order" },
        hasExistingNcFile: true,
      }),
    ).toBe(false);

    expect(
      shouldRefuseNcOverwriteOnProductionOrder({
        sourceStep: "3-nc",
        status: "success",
        matchSource: "mongoId",
        requestLike: { requestCategory: "order" },
        hasExistingNcFile: true,
      }),
    ).toBe(false);
  });

  it("never refuses overwrite for copied_sample itself", () => {
    expect(
      shouldRefuseNcOverwriteOnProductionOrder({
        sourceStep: "3-nc",
        status: "success",
        matchSource: "filename",
        requestLike: { requestCategory: "copied_sample" },
        hasExistingNcFile: true,
      }),
    ).toBe(false);
  });
});
