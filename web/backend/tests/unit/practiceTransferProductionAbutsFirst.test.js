// related files:
// - web/backend/services/practiceTransferProduction.service.js
import {
  canStartAbutmentProduction,
  hasCustomAbutmentToothWorks,
  isAbutmentDesignReady,
  normalizeResultFiles,
  parseArrivalYmdFromMemo,
} from "../../services/practiceTransferProduction.service.js";

describe("practiceTransferProduction Abuts-first helpers", () => {
  test("parseArrivalYmdFromMemo extracts KST arrival tag", () => {
    expect(
      parseArrivalYmdFromMemo("[주문일: 2026-08-10]\n[도착일: 2026-08-20]\n메모"),
    ).toBe("2026-08-20");
    expect(parseArrivalYmdFromMemo("no date")).toBeNull();
  });

  test("hasCustomAbutmentToothWorks requires tooth + flag", () => {
    expect(hasCustomAbutmentToothWorks([{ customAbutment: true, toothNumber: "16" }])).toBe(
      true,
    );
    expect(hasCustomAbutmentToothWorks([{ customAbutment: true, toothNumber: "" }])).toBe(
      false,
    );
    expect(hasCustomAbutmentToothWorks([{ customAbutment: false, toothNumber: "16" }])).toBe(
      false,
    );
  });

  test("isAbutmentDesignReady from designFiles or designReadyAt", () => {
    expect(isAbutmentDesignReady({ production: {} })).toBe(false);
    expect(
      isAbutmentDesignReady({
        production: { designReadyAt: new Date() },
      }),
    ).toBe(true);
    expect(
      isAbutmentDesignReady({
        production: {
          designFiles: [
            {
              file: { originalName: "a.stl", s3Key: "k1" },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  test("canStartAbutmentProduction gates", () => {
    const base = {
      production: {
        designReadyAt: new Date(),
        labDesignConfirmedAt: new Date(),
        skipDesignConfirm: true,
      },
    };
    expect(canStartAbutmentProduction(base)).toBe(true);

    expect(
      canStartAbutmentProduction({
        production: {
          ...base.production,
          skipDesignConfirm: false,
        },
      }),
    ).toBe(false);

    expect(
      canStartAbutmentProduction({
        production: {
          ...base.production,
          skipDesignConfirm: false,
          practiceDesignConfirmedAt: new Date(),
        },
      }),
    ).toBe(true);

    expect(
      canStartAbutmentProduction({
        production: {
          designReadyAt: new Date(),
          skipDesignConfirm: true,
        },
      }),
    ).toBe(false);
  });

  test("normalizeResultFiles drops incomplete rows", () => {
    expect(
      normalizeResultFiles([
        { file: { originalName: "a.stl", s3Key: "k" } },
        { file: { originalName: "b.stl" } },
        null,
      ]),
    ).toHaveLength(1);
  });
});
