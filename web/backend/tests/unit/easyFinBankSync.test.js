import { describe, it, expect } from "@jest/globals";
import {
  easyFinSearchRangeKst,
  isEasyFinJobDone,
  mapEasyFinDeposit,
  parsePopbillTrdt,
  readEasyFinBalance,
} from "../../services/easyFinBankSync.core.js";

const account = { bankCode: "0081", accountNumber: "80691000900004" };

describe("easyFinBankSync", () => {
  it("KST 오늘과 전날을 수집 구간으로 쓴다", () => {
    const now = new Date("2026-10-13T15:30:00.000Z");
    expect(easyFinSearchRangeKst(now)).toEqual({
      sDate: "20261013",
      eDate: "20261014",
    });
  });

  it("입금만 매칭 인자로 바꾸고 출금은 버린다", () => {
    const deposit = mapEasyFinDeposit(
      {
        tid: "T1",
        trdt: "20261014083000",
        accIn: "150000",
        accOut: "0",
        remark1: "홍길동",
        remark2: "01",
        memo: "홍길동",
      },
      account,
    );
    expect(deposit).toMatchObject({
      externalId: "T1",
      bankCode: "0081",
      tranAmt: 150000,
      printedContent: "홍길동 01",
    });
    expect(deposit.occurredAt.toISOString()).toBe("2026-10-13T23:30:00.000Z");

    expect(
      mapEasyFinDeposit({ tid: "T2", trdt: "20261014083000", accIn: "0", accOut: "1000" }, account),
    ).toBeNull();
  });

  it("잔액과 수집 완료 코드를 읽는다", () => {
    expect(readEasyFinBalance({ balance: "1,234,500" })).toBe(1234500);
    expect(readEasyFinBalance({})).toBeNull();
    expect(isEasyFinJobDone({ jobState: 3, errorCode: 1 })).toMatchObject({
      done: true,
      ok: true,
    });
    expect(isEasyFinJobDone({ jobState: 2, errorCode: 1 }).done).toBe(false);
    expect(parsePopbillTrdt("20261014")).toEqual(new Date("2026-10-13T15:00:00.000Z"));
  });
});
