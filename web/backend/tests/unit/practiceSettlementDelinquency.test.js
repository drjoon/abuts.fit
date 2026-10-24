import {
  assertPartialAmount,
  classifyPracticeDelinquency,
  isOngoingUnpaidSettlement,
  isPartialSettlement,
  isUnpaidSettlementRecord,
} from "../../utils/practiceSettlementDelinquency.js";

const pause = new Date("2026-09-11T00:00:00.000Z");
const before = new Date("2026-09-10T23:00:00.000Z");
const after = new Date("2026-09-11T01:00:00.000Z");

function row(overrides) {
  return {
    _id: overrides.id || "s1",
    practiceAnchorId: "p1",
    yearMonth: "2026-08",
    totalAmount: 1000,
    amountReceived: 0,
    paymentReceivedAt: null,
    scheduledTransferAt: pause,
    ...overrides,
  };
}

describe("practiceSettlementDelinquency", () => {
  test("기한 전에는 미납 기록이 아니다", () => {
    const bill = row({});
    expect(isUnpaidSettlementRecord(bill, before)).toBe(false);
    expect(isOngoingUnpaidSettlement(bill, before)).toBe(false);
    const grouped = classifyPracticeDelinquency([bill], new Map(), before);
    expect(grouped.ongoing).toHaveLength(0);
    expect(grouped.repeat).toHaveLength(0);
    expect(grouped.prepaidCandidates).toHaveLength(0);
  });

  test("기한을 넘긴 한 달은 미납 지속이고 선불 전환 대상은 아니다", () => {
    const grouped = classifyPracticeDelinquency(
      [row({ id: "a" })],
      new Map([["p1", "한곳치과"]]),
      after,
    );
    expect(grouped.ongoing).toHaveLength(1);
    expect(grouped.ongoing[0].practiceName).toBe("한곳치과");
    expect(grouped.ongoing[0].unpaidRecordCount).toBe(1);
    expect(grouped.repeat).toHaveLength(0);
    expect(grouped.prepaidCandidates).toHaveLength(0);
  });

  test("기한 후 입금은 기록만 남고 미납 지속에서는 빠진다", () => {
    const bill = row({
      paymentReceivedAt: new Date("2026-09-12T01:00:00.000Z"),
    });
    expect(isUnpaidSettlementRecord(bill, after)).toBe(true);
    expect(isOngoingUnpaidSettlement(bill, after)).toBe(false);
    const grouped = classifyPracticeDelinquency([bill], new Map(), after);
    expect(grouped.ongoing).toHaveLength(0);
    expect(grouped.repeat).toHaveLength(0);
  });

  test("기한을 두 번 넘기면 2회 기록과 선불 전환 대상이다", () => {
    const grouped = classifyPracticeDelinquency(
      [
        row({
          id: "aug",
          yearMonth: "2026-08",
          paymentReceivedAt: new Date("2026-09-12T01:00:00.000Z"),
        }),
        row({
          id: "sep",
          yearMonth: "2026-09",
          scheduledTransferAt: new Date("2026-10-13T00:00:00.000Z"),
        }),
      ],
      new Map([["p1", "반복치과"]]),
      new Date("2026-10-13T01:00:00.000Z"),
    );
    expect(grouped.repeat).toHaveLength(1);
    expect(grouped.repeat[0].unpaidRecordCount).toBe(2);
    expect(grouped.ongoing).toHaveLength(1);
    expect(grouped.prepaidCandidates.map((c) => c.practiceName)).toEqual(["반복치과"]);
  });

  test("일부 입금은 기한 전에도 부분 납부와 선불 전환 대상이다", () => {
    const bill = row({ amountReceived: 400 });
    expect(isPartialSettlement(bill)).toBe(true);
    const grouped = classifyPracticeDelinquency([bill], new Map(), before);
    expect(grouped.partial).toHaveLength(1);
    expect(grouped.partial[0].partialRemaining).toBe(600);
    expect(grouped.ongoing).toHaveLength(0);
    expect(grouped.prepaidCandidates).toHaveLength(1);
  });

  test("전액 확인된 달은 부분 납부가 아니다", () => {
    const bill = row({
      amountReceived: 400,
      paymentReceivedAt: new Date("2026-09-03T01:00:00.000Z"),
      scheduledTransferAt: pause,
    });
    expect(isPartialSettlement(bill)).toBe(false);
    expect(isUnpaidSettlementRecord(bill, after)).toBe(false);
  });

  test("일부 금액은 전액 미만만 받는다", () => {
    expect(assertPartialAmount(1000, 0)).toBe(0);
    expect(assertPartialAmount(1000, "400")).toBe(400);
    expect(() => assertPartialAmount(1000, 1000)).toThrow("입금 확인");
    expect(() => assertPartialAmount(1000, -1)).toThrow("금액");
  });
});
