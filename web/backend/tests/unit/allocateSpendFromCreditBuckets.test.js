// related files:
// - web/backend/services/creditBalance.service.js
import { allocateSpendFromCreditBuckets } from "../../services/creditBalance.service.js";

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
