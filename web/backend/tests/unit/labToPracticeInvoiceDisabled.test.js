// related files:
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/services/customerMonthlyInvoice.service.js
import {
  generateMonthlyLabToPracticeInvoiceDrafts,
  LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED,
} from "../../services/practiceLabInvoice.service.js";

describe("LAB_TO_PRACTICE invoice generation", () => {
  test("신규 생성은 정책상 비활성", () => {
    expect(LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED).toBe(false);
  });

  test("generateMonthlyLabToPracticeInvoiceDrafts는 no-op", async () => {
    const periodStart = new Date("2026-08-01T00:00:00.000+09:00");
    const periodEnd = new Date("2026-09-01T00:00:00.000+09:00");
    const result = await generateMonthlyLabToPracticeInvoiceDrafts({
      periodStart,
      periodEnd,
    });
    expect(result).toEqual({
      created: 0,
      skippedExisting: 0,
      groups: 0,
      disabled: true,
    });
  });
});

describe("customerMonthlyInvoice prepaid custom abutment", () => {
  test("월합은 어벗츠 커스텀어벗 확정 차감만 포함한다", async () => {
    const { PREPAID_EXEMPT_SPEND_EVENTS, isPrepaidCreditUsageBuyer } =
      await import("../../services/customerMonthlyInvoice.service.js");
    expect(PREPAID_EXEMPT_SPEND_EVENTS).toEqual(["REQUEST_SPEND_COMMIT"]);
    expect(isPrepaidCreditUsageBuyer({ requestorKind: "lab" })).toBe(true);
    expect(
      isPrepaidCreditUsageBuyer({
        requestorKind: "practice",
        practiceHasInHouseLab: true,
      }),
    ).toBe(true);
    expect(
      isPrepaidCreditUsageBuyer({
        requestorKind: "practice",
        practiceHasInHouseLab: false,
      }),
    ).toBe(false);
  });
});
