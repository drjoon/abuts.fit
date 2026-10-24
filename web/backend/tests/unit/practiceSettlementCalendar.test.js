import {
  isSettlementNonBusinessYmd,
  resolveLabPayoutYmd,
  resolvePracticeSettlementCalendar,
} from "../../utils/practiceSettlementCalendar.js";

describe("practiceSettlementCalendar", () => {
  test("2026-08 사용분 — 9월 5일은 토요일이라 1차·재안내는 7일, 정지는 11일", () => {
    const cal = resolvePracticeSettlementCalendar("2026-08");
    expect(cal.noticeYmd).toBe("2026-09-01");
    expect(cal.noticeAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(cal.firstDueYmd).toBe("2026-09-07");
    expect(cal.reminderAt.toISOString()).toBe("2026-09-07T03:00:00.000Z");
    expect(cal.secondDueYmd).toBe("2026-09-10");
    expect(cal.suspendYmd).toBe("2026-09-11");
    expect(cal.suspendAt.toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(cal.labPayoutOnYmd).toBe("2026-09-08");
    expect(isSettlementNonBusinessYmd(cal.firstDueYmd)).toBe(false);
    expect(isSettlementNonBusinessYmd(cal.secondDueYmd)).toBe(false);
  });

  test("2026-09 사용분 — 10월 5일 공휴일·10일 토요일은 다음 영업일로 민다", () => {
    const cal = resolvePracticeSettlementCalendar("2026-09");
    expect(cal.noticeYmd).toBe("2026-10-01");
    expect(cal.firstDueYmd).not.toBe("2026-10-05");
    expect(isSettlementNonBusinessYmd("2026-10-05")).toBe(true);
    expect(isSettlementNonBusinessYmd(cal.firstDueYmd)).toBe(false);
    expect(cal.secondDueYmd > "2026-10-10").toBe(true);
    expect(isSettlementNonBusinessYmd(cal.secondDueYmd)).toBe(false);
    expect(cal.suspendYmd > cal.secondDueYmd).toBe(true);
    expect(cal.labPayoutOnYmd > cal.firstDueYmd).toBe(true);
  });

  test("1차 기한 안 입금은 정해 둔 기공소 지급일, 늦은 입금은 다음 영업일", () => {
    const cal = resolvePracticeSettlementCalendar("2026-08");
    expect(
      resolveLabPayoutYmd({
        receivedAt: new Date("2026-09-03T01:00:00+09:00"),
        firstDueYmd: cal.firstDueYmd,
        labPayoutOnYmd: cal.labPayoutOnYmd,
      }),
    ).toBe("2026-09-08");
    expect(
      resolveLabPayoutYmd({
        receivedAt: new Date("2026-09-07T18:00:00+09:00"),
        firstDueYmd: cal.firstDueYmd,
        labPayoutOnYmd: cal.labPayoutOnYmd,
      }),
    ).toBe("2026-09-08");
    const late = resolveLabPayoutYmd({
      receivedAt: new Date("2026-09-11T15:00:00+09:00"),
      firstDueYmd: cal.firstDueYmd,
      labPayoutOnYmd: cal.labPayoutOnYmd,
    });
    expect(late > "2026-09-11").toBe(true);
    expect(isSettlementNonBusinessYmd(late)).toBe(false);
  });
});
