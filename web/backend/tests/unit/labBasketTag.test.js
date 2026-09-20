// related files:
// - web/backend/utils/labBasketTag.js
// - web/backend/utils/practiceTransferStage.js
import {
  isLabBasketTagOccupyingDoc,
  normalizeLabBasketTag,
} from "../../utils/labBasketTag.js";

describe("labBasketTag", () => {
  test("normalizeLabBasketTag pads 1–99", () => {
    expect(normalizeLabBasketTag("1")).toBe("01");
    expect(normalizeLabBasketTag("46")).toBe("46");
    expect(normalizeLabBasketTag("00")).toBe("");
    expect(normalizeLabBasketTag("100")).toBe("");
    expect(normalizeLabBasketTag("A1")).toBe("");
  });

  test("occupying skips cancel and finished-without-abutment", () => {
    expect(
      isLabBasketTagOccupyingDoc({
        status: "active",
        workCanceledAt: new Date(),
      }),
    ).toBe(false);

    expect(
      isLabBasketTagOccupyingDoc({
        status: "deleted",
      }),
    ).toBe(false);

    expect(
      isLabBasketTagOccupyingDoc({
        status: "active",
        requestorDownloadedAt: new Date(),
        autoMatch: { completedAt: new Date() },
      }),
    ).toBe(false);

    expect(
      isLabBasketTagOccupyingDoc({
        status: "active",
        requestorDownloadedAt: new Date(),
        production: {
          designFiles: [{ s3Key: "x" }],
          designReadyAt: new Date(),
        },
        autoMatch: { completedAt: new Date() },
      }),
    ).toBe(true);

    expect(
      isLabBasketTagOccupyingDoc({
        status: "active",
        requestorDownloadedAt: new Date(),
      }),
    ).toBe(true);
  });
});
