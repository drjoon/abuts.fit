// related files:
// - web/backend/controllers/requests/shipping.Tracking.helpers.js
import { describe, expect, it } from "@jest/globals";
import {
  buildTrackingRowMap,
  canonicalizeHanjinWblNo,
  findTrackingRow,
  isHanjinTrackingRowOk,
  isTerminalHanjinStatus,
  normalizeHanjinWblNo,
  resolveTrackingApplyFromRow,
} from "../../controllers/requests/shipping.Tracking.helpers.js";

describe("normalizeHanjinWblNo", () => {
  it("strips hyphens from a 12-digit waybill", () => {
    expect(normalizeHanjinWblNo("5373-3627-0634")).toBe("537336270634");
    expect(canonicalizeHanjinWblNo("5373-3627-0634")).toBe("537336270634");
    expect(canonicalizeHanjinWblNo("537336270634")).toBe("537336270634");
  });

  it("keeps mock / non-12-digit values as-is", () => {
    expect(canonicalizeHanjinWblNo("MOCK-A1A1-123")).toBe("MOCK-A1A1-123");
  });
});

describe("hanjin tracking row lookup", () => {
  it("matches hyphenated DB numbers to digit-only API rows", () => {
    const rowMap = buildTrackingRowMap([
      {
        wblNo: "537336270634",
        resultCode: "OK",
        wrkList: [
          {
            statusCode: "11",
            statusName: "집하완료",
            statusDate: "2026-07-28 16:48:29",
          },
          {
            statusCode: "66",
            statusName: "배송완료",
            statusDate: "2026-07-29 15:23:29",
          },
        ],
      },
    ]);
    expect(findTrackingRow(rowMap, "5373-3627-0634")?.wblNo).toBe(
      "537336270634",
    );
    expect(findTrackingRow(rowMap, "537336270634")?.wblNo).toBe("537336270634");
  });

  it("ignores ERROR-03 empty wrkList rows", () => {
    expect(
      isHanjinTrackingRowOk({
        wblNo: "5373-3627-0634",
        resultCode: "ERROR-03",
        resultMessage: "유효하지 않은 운송장번호",
        wrkList: [],
      }),
    ).toBe(false);
    expect(
      resolveTrackingApplyFromRow({
        wblNo: "5373-3627-0634",
        resultCode: "ERROR-03",
        wrkList: [],
      }),
    ).toBeNull();
  });

  it("sets deliveredAt from wrkList even when 66 is not the last unsorted item", () => {
    const resolved = resolveTrackingApplyFromRow({
      wblNo: "537405965854",
      resultCode: "OK",
      wrkList: [
        {
          statusCode: "66",
          statusName: "배송완료",
          statusDate: "2026-08-12 10:00:00",
        },
        {
          statusCode: "11",
          statusName: "집하완료",
          statusDate: "2026-08-11 16:05:22",
        },
      ],
    });
    expect(resolved?.canonicalWblNo).toBe("537405965854");
    expect(resolved?.last?.statusCode).toBe("66");
    expect(resolved?.deliveredAt).toBeInstanceOf(Date);
    expect(resolved?.pickedUpAt).toBeInstanceOf(Date);
  });
});

describe("isTerminalHanjinStatus", () => {
  it("treats delivered and canceled as terminal", () => {
    expect(isTerminalHanjinStatus("66")).toBe(true);
    expect(isTerminalHanjinStatus("03")).toBe(true);
    expect(isTerminalHanjinStatus("11")).toBe(false);
    expect(isTerminalHanjinStatus("63")).toBe(false);
  });
});
