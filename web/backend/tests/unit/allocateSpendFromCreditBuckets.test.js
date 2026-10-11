// related files:
// - web/backend/services/creditBalance.service.js
import {
  allocateLabFeeAndAbutmentSpend,
  allocateSpendFromCreditBuckets,
  positiveSpendableCredit,
} from "../../services/creditBalance.service.js";

describe("allocateSpendFromCreditBuckets", () => {
  test("무료 → 기공 → 유료 순으로 차감한다", () => {
    const split = allocateSpendFromCreditBuckets({
      amount: 10000,
      paidCredit: 5000,
      freeRequestCredit: 3000,
      freeShippingCredit: 1000,
      settlementCredit: 4000,
    });

    expect(split.ok).toBe(true);
    expect(split.fromFreeRequest).toBe(3000);
    expect(split.fromFreeShipping).toBe(1000);
    expect(split.fromSettlement).toBe(4000);
    expect(split.fromPaid).toBe(2000);
    expect(split.available).toBe(13000);
    expect(split.shortfall).toBe(0);
  });

  test("치과처럼 settlement=0이면 무료→유료만 쓴다", () => {
    const split = allocateSpendFromCreditBuckets({
      amount: 8000,
      paidCredit: 10000,
      freeRequestCredit: 2000,
      freeShippingCredit: 0,
      settlementCredit: 0,
    });

    expect(split.fromFreeRequest).toBe(2000);
    expect(split.fromSettlement).toBe(0);
    expect(split.fromPaid).toBe(6000);
    expect(split.ok).toBe(true);
  });

  test("기공만으로도 충분하면 유료는 건드리지 않는다", () => {
    const split = allocateSpendFromCreditBuckets({
      amount: 5000,
      paidCredit: 100000,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      settlementCredit: 7000,
    });

    expect(split.fromSettlement).toBe(5000);
    expect(split.fromPaid).toBe(0);
    expect(split.ok).toBe(true);
  });

  test("부족하면 shortfall을 반환한다", () => {
    const split = allocateSpendFromCreditBuckets({
      amount: 20000,
      paidCredit: 1000,
      freeRequestCredit: 500,
      freeShippingCredit: 500,
      settlementCredit: 2000,
    });

    expect(split.ok).toBe(false);
    expect(split.shortfall).toBe(16000);
    expect(split.fromFree).toBe(1000);
    expect(split.fromSettlement).toBe(2000);
    expect(split.fromPaid).toBe(1000);
  });

  test("allowFreeRequestOverdraft면 shortfall을 freeRequest에 얹는다", () => {
    const split = allocateSpendFromCreditBuckets({
      amount: 10000,
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      allowFreeRequestOverdraft: true,
    });

    expect(split.ok).toBe(true);
    expect(split.fromFreeRequest).toBe(10000);
    expect(split.shortfall).toBe(0);
  });

  test("음수 freeRequest + overdraft면 추가 차감만 freeRequest로", () => {
    const split = allocateSpendFromCreditBuckets({
      amount: 3000,
      paidCredit: 0,
      freeRequestCredit: -5000,
      freeShippingCredit: 0,
      allowFreeRequestOverdraft: true,
    });

    expect(split.ok).toBe(true);
    expect(split.fromFreeRequest).toBe(3000);
    expect(split.available).toBe(0);
  });
});

describe("allocateLabFeeAndAbutmentSpend", () => {
  test("데모 부채가 있어도 충전액으로 커스텀어벗을 내고 기공비는 마이너스한다", () => {
    const split = allocateLabFeeAndAbutmentSpend({
      labAmount: 30000,
      abutmentAmount: 15000,
      paidCredit: 20000,
      freeRequestCredit: -50000,
      allowLabOverdraft: true,
    });

    expect(split.ok).toBe(true);
    expect(split.abutSplit.fromPaid).toBe(15000);
    expect(split.abutSplit.fromFreeRequest).toBe(0);
    expect(split.labSplit.fromPaid).toBe(5000);
    expect(split.labSplit.fromFreeRequest).toBe(25000);
  });

  test("충전 잔액이 없으면 커스텀어벗은 거절하고 기공비만은 통과한다", () => {
    const blocked = allocateLabFeeAndAbutmentSpend({
      labAmount: 30000,
      abutmentAmount: 15000,
      paidCredit: 0,
      freeRequestCredit: 0,
      allowLabOverdraft: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.failedKind).toBe("abutment");

    const labOnly = allocateLabFeeAndAbutmentSpend({
      labAmount: 30000,
      abutmentAmount: 0,
      paidCredit: 0,
      freeRequestCredit: -10000,
      allowLabOverdraft: true,
    });
    expect(labOnly.ok).toBe(true);
    expect(labOnly.labSplit.fromFreeRequest).toBe(30000);
  });

  test("positiveSpendableCredit는 데모 부채를 가용에 넣지 않는다", () => {
    expect(
      positiveSpendableCredit({
        paidCredit: 20000,
        freeRequestCredit: -50000,
        freeShippingCredit: 0,
        settlementCredit: 0,
      }),
    ).toBe(20000);
  });
});
