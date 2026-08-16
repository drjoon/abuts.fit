// related files:
// - web/backend/services/practiceTransferProduction.service.js
import {
  ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE,
  ORAL_SCAN_REQUIRED_FROM_LAB,
  ORAL_SCAN_REQUIRED_FROM_PRACTICE,
  PTX_CA_SHIP_BEFORE_ARRIVAL_BUSINESS_DAYS,
  assertOralScanFilesForCreate,
  canStartAbutmentProduction,
  hasCustomAbutmentToothWorks,
  isAbutmentDesignReady,
  normalizeResultFiles,
  parseArrivalYmdFromMemo,
  resolveManufacturerTargetShipYmd,
  resolveOralScanFilesForAccept,
  shouldLockLabOralScanDownload,
} from "../../services/practiceTransferProduction.service.js";

describe("practiceTransferProduction Abuts-first helpers", () => {
  test("PTX CA ship offset is dental-direct (arrival − 2 business days)", () => {
    expect(PTX_CA_SHIP_BEFORE_ARRIVAL_BUSINESS_DAYS).toBe(2);
  });

  test("resolveManufacturerTargetShipYmd subtracts 2 business days", async () => {
    // 2026-08-21(금) → 20(목) → 19(수)
    expect(await resolveManufacturerTargetShipYmd("2026-08-21")).toBe(
      "2026-08-19",
    );
    expect(await resolveManufacturerTargetShipYmd("bad")).toBeNull();
    expect(await resolveManufacturerTargetShipYmd("")).toBeNull();
  });

  test("parseArrivalYmdFromMemo extracts KST arrival tag", () => {
    expect(
      parseArrivalYmdFromMemo("[주문일: 2026-08-10]\n[도착일: 2026-08-20]\n메모"),
    ).toBe("2026-08-20");
    expect(
      parseArrivalYmdFromMemo("[주문일: 2026-08-10]\n[치과도착일: 2026-08-21]\n메모"),
    ).toBe("2026-08-21");
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

  test("shouldLockLabOralScanDownload always unlocked (lab designs CA)", () => {
    const ca = [{ customAbutment: true, toothNumber: "16" }];
    expect(
      shouldLockLabOralScanDownload({
        toothWorks: ca,
        production: {},
      }),
    ).toBe(false);
    expect(
      shouldLockLabOralScanDownload({
        toothWorks: ca,
        production: { designReadyAt: new Date() },
      }),
    ).toBe(false);
    expect(
      shouldLockLabOralScanDownload({
        toothWorks: [{ customAbutment: false, toothNumber: "16" }],
        production: {},
      }),
    ).toBe(false);
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
          designReadyAt: null,
          labDesignConfirmedAt: new Date(),
          skipDesignConfirm: true,
        },
      }),
    ).toBe(false);
  });

  test("normalizeResultFiles keeps valid rows only", () => {
    expect(
      normalizeResultFiles([
        { file: { originalName: "a.stl", s3Key: "k1", size: 10 } },
        { originalName: "b.ply", s3Key: "k2" },
        { file: { originalName: "bad.stl" } },
      ]),
    ).toHaveLength(2);
  });
});

describe("oral scan requirement for CA accept/create", () => {
  const caTooth = [{ customAbutment: true, toothNumber: "21" }];
  const scanFile = {
    file: { originalName: "scan.stl", s3Key: "scan-key", size: 100 },
  };

  test("assertOralScanFilesForCreate — auto requires files", () => {
    expect(() =>
      assertOralScanFilesForCreate({
        matchingMode: "auto",
        toothWorks: caTooth,
        files: [],
      }),
    ).toThrow(ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE);

    expect(() =>
      assertOralScanFilesForCreate({
        matchingMode: "auto",
        toothWorks: caTooth,
        files: [scanFile],
      }),
    ).not.toThrow();
  });

  test("assertOralScanFilesForCreate — direct CA may omit files", () => {
    expect(() =>
      assertOralScanFilesForCreate({
        matchingMode: "direct",
        toothWorks: caTooth,
        files: [],
      }),
    ).not.toThrow();
  });

  test("assertOralScanFilesForCreate — auto without CA still requires files", () => {
    expect(() =>
      assertOralScanFilesForCreate({
        matchingMode: "auto",
        toothWorks: [{ customAbutment: false, toothNumber: "21" }],
        files: [],
      }),
    ).toThrow(ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE);
  });

  test("resolveOralScanFilesForAccept — existing files win", () => {
    const resolved = resolveOralScanFilesForAccept({
      transferDoc: {
        matchingMode: "direct",
        toothWorks: caTooth,
        files: [scanFile],
      },
      incomingFiles: [],
    });
    expect(resolved.attachedByLab).toBe(false);
    expect(resolved.files).toHaveLength(1);
  });

  test("resolveOralScanFilesForAccept — auto without files rejects", () => {
    expect(() =>
      resolveOralScanFilesForAccept({
        transferDoc: {
          matchingMode: "auto",
          toothWorks: caTooth,
          files: [],
        },
        incomingFiles: [scanFile],
      }),
    ).toThrow(ORAL_SCAN_REQUIRED_FROM_PRACTICE);
  });

  test("resolveOralScanFilesForAccept — direct allows lab upload", () => {
    const resolved = resolveOralScanFilesForAccept({
      transferDoc: {
        matchingMode: "direct",
        toothWorks: caTooth,
        files: [],
      },
      incomingFiles: [scanFile],
    });
    expect(resolved.attachedByLab).toBe(true);
    expect(resolved.files[0].file.s3Key).toBe("scan-key");
  });

  test("resolveOralScanFilesForAccept — direct without upload allows (scan later)", () => {
    const resolved = resolveOralScanFilesForAccept({
      transferDoc: {
        matchingMode: "direct",
        toothWorks: caTooth,
        files: [],
      },
      incomingFiles: [],
    });
    expect(resolved.attachedByLab).toBe(false);
    expect(resolved.files).toHaveLength(0);
  });
});
