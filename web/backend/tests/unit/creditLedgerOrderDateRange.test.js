import { describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";

import {
  buildRequestorCreditLedgerPipeline,
  creditLedgerDateFromOrderYmd,
  resolveCreditLedgerOrderDateRangeFromQuery,
  resolveCreditLedgerOrderYmdFromTransfer,
} from "../../controllers/credits/creditLedger.utils.js";

describe("resolveCreditLedgerOrderDateRangeFromQuery", () => {
  it("parses from/to YMD as orderDate range", () => {
    expect(
      resolveCreditLedgerOrderDateRangeFromQuery({
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    ).toEqual({
      fromYmd: "2026-10-01",
      toYmd: "2026-10-31",
      dateKey: "orderDate",
    });
  });

  it("parses onYmd as a single day", () => {
    expect(
      resolveCreditLedgerOrderDateRangeFromQuery({ onYmd: "2026-11-03" }),
    ).toEqual({
      fromYmd: "2026-11-03",
      toYmd: "2026-11-03",
      dateKey: "orderDate",
    });
  });

  it("returns null for period presets without YMD bounds", () => {
    expect(
      resolveCreditLedgerOrderDateRangeFromQuery({ period: "30d" }),
    ).toBeNull();
  });
});

describe("resolveCreditLedgerOrderYmdFromTransfer", () => {
  it("prefers last orderDates entry", () => {
    expect(
      resolveCreditLedgerOrderYmdFromTransfer({
        orderDates: ["2026-09-01", "2026-10-15"],
        transferMemo: "[주문일: 2026-09-01]",
      }),
    ).toBe("2026-10-15");
  });

  it("falls back to memo when orderDates empty", () => {
    expect(
      resolveCreditLedgerOrderYmdFromTransfer({
        orderDates: [],
        transferMemo: "[주문일: 2026-08-20]\n메모",
      }),
    ).toBe("2026-08-20");
  });
});

describe("creditLedgerDateFromOrderYmd", () => {
  it("builds noon KST Date", () => {
    const d = creditLedgerDateFromOrderYmd("2026-10-15");
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe("2026-10-15T03:00:00.000Z");
  });

  it("returns null for invalid ymd", () => {
    expect(creditLedgerDateFromOrderYmd("bad")).toBeNull();
  });
});

describe("buildRequestorCreditLedgerPipeline order-date match", () => {
  it("matches PTX by refId and non-PTX by occurredAt", () => {
    const ownerId = new mongoose.Types.ObjectId();
    const ptxId = new mongoose.Types.ObjectId();
    const occurredAt = {
      $gte: new Date("2026-10-01T00:00:00+09:00"),
      $lte: new Date("2026-10-31T23:59:59.999+09:00"),
    };
    const pipeline = buildRequestorCreditLedgerPipeline({
      ownerId,
      journalCollectionName: "ledgerjournals",
      occurredAt,
      filterTypes: null,
      searchOrs: [],
      refIdIn: null,
      statsCategories: null,
      startIdx: 0,
      pageSize: 50,
      practiceTransferOrderDateRefIds: [ptxId],
    });
    const match = pipeline[0].$match;
    expect(match.occurredAt).toBeUndefined();
    expect(Array.isArray(match.$or)).toBe(true);
    expect(match.$or[0]).toEqual({
      refType: "PRACTICE_TRANSFER",
      refId: { $in: [ptxId] },
    });
    expect(JSON.stringify(match.$or[1])).toContain("occurredAt");
    expect(JSON.stringify(match.$or[1])).toContain("PRACTICE_TRANSFER");
  });
});
