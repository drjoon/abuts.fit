// related files:
// - web/backend/constants/abutsLabSettlement.js
// - web/backend/services/creditRevenuePolicy.service.js
import {
  ABUTS_LAB_ESCROW_OWNER_ENABLED,
  ABUTS_LAB_PURCHASE_BUYER_ENABLED,
  ABUTS_LAB_SELLER_INVOICE_ENABLED,
  CORP_FEE_FIXED_ONLY,
} from "../../constants/abutsLabSettlement.js";
import {
  CHARGE_LAB_PLATFORM_AND_SUBCONTRACT_FEES,
  resolvePracticeTransferFeeRate,
} from "../../services/creditRevenuePolicy.service.js";
import { TAX_INVOICE_DIRECTIONS } from "../../models/taxInvoiceDraft.model.js";

describe("어벗츠기공소 정산 flag", () => {
  test("기본값은 off(기존 동작 유지)", () => {
    expect(ABUTS_LAB_SELLER_INVOICE_ENABLED).toBe(false);
    expect(ABUTS_LAB_PURCHASE_BUYER_ENABLED).toBe(false);
    expect(ABUTS_LAB_ESCROW_OWNER_ENABLED).toBe(false);
  });

  test("법인 청구는 정액/건당만: 정률 사용료·하청 수수료는 미부과", () => {
    expect(CORP_FEE_FIXED_ONLY).toBe(true);
    expect(CHARGE_LAB_PLATFORM_AND_SUBCONTRACT_FEES).toBe(false);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: {
          directPlatformFeeEnabled: true,
          directPlatformFeeRate: 0.02,
          subcontractFeeRate: 0.1,
        },
        subcontracted: true,
      }),
    ).toBe(0);
  });

  test("어벗츠기공소 공급자 방향이 계산서 방향에 등록됨", () => {
    expect(TAX_INVOICE_DIRECTIONS).toContain("ABUTS_LAB_TO_CUSTOMER");
  });
});
