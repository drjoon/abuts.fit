// related files:
// - web/backend/controllers/credits/creditLedger.utils.js
import mongoose from "mongoose";
import {
  buildCreditLedgerRequestSummary,
  buildLedgerItemsWithBucketBalanceAfter,
  collectPracticeTransferLookupIds,
  isAbutmentDesignLabFeeLedgerRow,
  isSettlementLedgerType,
  parseSpendKindFromUniqueKey,
  promoteAbutmentDesignFeeToPracticeTransfer,
  resolveLedgerTypesForFilters,
} from "../../controllers/credits/creditLedger.utils.js";

describe("isSettlementLedgerType", () => {
  test("기공 적립/정산만 settlement", () => {
    expect(isSettlementLedgerType("LAB_SETTLEMENT_CHARGE")).toBe(true);
    expect(isSettlementLedgerType("LAB_SETTLEMENT_PAYOUT")).toBe(true);
    expect(isSettlementLedgerType("CHARGE_FREE_REQUEST")).toBe(false);
    expect(isSettlementLedgerType("SPEND_HOLD")).toBe(false);
  });
});

describe("buildLedgerItemsWithBucketBalanceAfter", () => {
  test("무료충전 이후 기공 적립도 총잔액으로 이어진다", () => {
    // newest-first: 기공+120k → 기공+120k → 기공+59.4k → 무료+7k → 무료+30k
    // 현재: spendable 37k + settlement 299.4k = 336.4k
    const rows = [
      { _id: "1", type: "LAB_SETTLEMENT_CHARGE", amount: 120000 },
      { _id: "2", type: "LAB_SETTLEMENT_CHARGE", amount: 120000 },
      { _id: "3", type: "LAB_SETTLEMENT_CHARGE", amount: 59400 },
      { _id: "4", type: "CHARGE_FREE_SHIPPING", amount: 7000 },
      { _id: "5", type: "CHARGE_FREE_REQUEST", amount: 30000 },
    ];
    const items = buildLedgerItemsWithBucketBalanceAfter({
      rows,
      startIdx: 0,
      endIdx: 5,
      spendableBalance: 37000,
      settlementBalance: 299400,
    });

    expect(items.map((i) => i.balanceAfter)).toEqual([
      336400,
      216400,
      96400, // 37,000 무료 + 59,400 기공 (리셋되지 않음)
      37000,
      30000,
    ]);
  });

  test("페이지 스킵도 총잔액 러닝에 반영한다", () => {
    const rows = [
      { _id: "1", type: "LAB_SETTLEMENT_CHARGE", amount: 100 },
      { _id: "2", type: "CHARGE_PAID", amount: 50 },
      { _id: "3", type: "LAB_SETTLEMENT_CHARGE", amount: 20 },
    ];
    const items = buildLedgerItemsWithBucketBalanceAfter({
      rows,
      startIdx: 1,
      endIdx: 3,
      spendableBalance: 50,
      settlementBalance: 120,
    });
    // total 170 - skipped first(+100) = 70
    expect(items).toHaveLength(2);
    expect(items[0].balanceAfter).toBe(70);
    expect(items[1].balanceAfter).toBe(20);
  });

  test("페이지 행만 넘겨도 skippedSum으로 잔액이 같다", () => {
    const items = buildLedgerItemsWithBucketBalanceAfter({
      rows: [
        { _id: "2", type: "CHARGE_PAID", amount: 50 },
        { _id: "3", type: "LAB_SETTLEMENT_CHARGE", amount: 20 },
      ],
      startIdx: 0,
      endIdx: 2,
      spendableBalance: 50,
      settlementBalance: 120,
      skippedSum: 100,
    });
    expect(items).toHaveLength(2);
    expect(items[0].balanceAfter).toBe(70);
    expect(items[1].balanceAfter).toBe(20);
  });
});

describe("resolveLedgerTypesForFilters", () => {
  test("단일 type 하위호환", () => {
    expect(resolveLedgerTypesForFilters({ type: "SPEND_HOLD" })).toEqual([
      "SPEND_HOLD",
    ]);
  });

  test("버킷·동작 교집합", () => {
    expect(
      resolveLedgerTypesForFilters({ creditKind: "PAID", action: "CHARGE" }),
    ).toEqual(["CHARGE_PAID"]);
    expect(
      resolveLedgerTypesForFilters({
        creditKind: "SETTLEMENT",
        action: "CHARGE",
      }),
    ).toEqual(["LAB_SETTLEMENT_CHARGE"]);
    expect(
      resolveLedgerTypesForFilters({
        creditKind: "SETTLEMENT",
        action: "SPEND",
      }).sort(),
    ).toEqual(["LAB_SETTLEMENT_PAYOUT", "SPEND_SETTLEMENT"].sort());
    expect(
      resolveLedgerTypesForFilters({ creditKind: "FREE", action: "SPEND" }).sort(),
    ).toEqual(["SPEND_FREE_REQUEST", "SPEND_FREE_SHIPPING"].sort());
  });

  test("동작만 지정", () => {
    expect(resolveLedgerTypesForFilters({ action: "ADJUST" })).toEqual([
      "ADJUST",
    ]);
    expect(resolveLedgerTypesForFilters({ action: "SPEND" })).toEqual(
      expect.arrayContaining(["SPEND_HOLD", "SPEND_PAID", "LAB_SETTLEMENT_PAYOUT"]),
    );
  });
});

describe("abutment design fee → practice transfer", () => {
  test("source·uniqueKey로 디자인비 행을 식별한다", () => {
    expect(
      isAbutmentDesignLabFeeLedgerRow({
        ledgerSource: "abutment_design_lab_fee",
      }),
    ).toBe(true);
    expect(
      isAbutmentDesignLabFeeLedgerRow({
        uniqueKey: "gl:request:abc:abutment_design_fee",
      }),
    ).toBe(true);
    expect(
      isAbutmentDesignLabFeeLedgerRow({ ledgerSource: "other", uniqueKey: "x" }),
    ).toBe(false);
  });

  test("PTX 조회 id에 relatedPracticeTransferId를 포함한다", () => {
    expect(
      collectPracticeTransferLookupIds([
        { refType: "PRACTICE_TRANSFER", refId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        {
          refType: "REQUEST",
          refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
          relatedPracticeTransferId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ]),
    ).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaa"]);
  });

  test("디자인비를 PRACTICE_TRANSFER 의뢰건으로 승격한다", () => {
    const promoted = promoteAbutmentDesignFeeToPracticeTransfer(
      {
        refType: "REQUEST",
        refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        ledgerSource: "abutment_design_lab_fee",
        relatedPracticeTransferId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "aaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(promoted.refType).toBe("PRACTICE_TRANSFER");
    expect(promoted.refId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("생산의뢰 차감은 승격하지 않는다", () => {
    const row = {
      refType: "REQUEST",
      refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      uniqueKey: "gl:request:xyz:machining_spend",
    };
    expect(
      promoteAbutmentDesignFeeToPracticeTransfer(
        row,
        "aaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toEqual(row);
  });
});

describe("parseSpendKindFromUniqueKey", () => {
  test("shipping_fee / machining_spend 접미를 인식한다", () => {
    expect(
      parseSpendKindFromUniqueKey("gl:request:abc:hold:shipping_fee"),
    ).toBe("shipping_fee");
    expect(
      parseSpendKindFromUniqueKey("shippingPackage:abc:shipping_fee"),
    ).toBe("shipping_fee");
    expect(
      parseSpendKindFromUniqueKey("gl:request:abc:machining_spend"),
    ).toBe("machining_spend");
  });
});

describe("buildCreditLedgerRequestSummary", () => {
  test("수신자·박스 묶음 키를 내려준다", () => {
    const summary = buildCreditLedgerRequestSummary({
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      requestId: "20260819-000001",
      mailboxAddress: "a1a1",
      shippingPackageId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      businessAnchorId: "cccccccccccccccccccccccc",
      shippingReceiver: {
        name: "향기로운치과",
        phone: "010-1234-5678",
        address: "서울",
        sourceAnchorId: "cccccccccccccccccccccccc",
      },
      caseInfos: { clinicName: "향기로운치과", patientName: "환자", tooth: "22" },
    });
    expect(summary.mailboxAddress).toBe("A1A1");
    expect(summary.recipientName).toBe("향기로운치과");
    expect(summary.shippingPackageId).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(summary.shippingReceiverGroupKey).toContain("향기로운치과");
  });

  test("mongoose ObjectId sourceAnchorId도 스택 없이 묶음 키를 만든다", () => {
    const oid = new mongoose.Types.ObjectId("cccccccccccccccccccccccc");
    const summary = buildCreditLedgerRequestSummary({
      _id: new mongoose.Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      requestId: "20260819-000001",
      mailboxAddress: "a1a1",
      businessAnchorId: oid,
      shippingReceiver: {
        name: "향기로운치과",
        sourceAnchorId: oid,
      },
      caseInfos: { clinicName: "향기로운치과" },
    });
    expect(summary.shippingReceiverGroupKey.startsWith(`${oid}:`)).toBe(true);
  });
});
