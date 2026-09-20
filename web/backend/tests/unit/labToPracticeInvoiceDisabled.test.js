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

describe("customerMonthlyInvoice EXEMPT_SPEND_EVENTS", () => {
  test("PTX HOLD/HOLD_ADJUST를 소스에서 포함한다", async () => {
    const fs = await import("node:fs/promises");
    const path = new URL(
      "../../services/customerMonthlyInvoice.service.js",
      import.meta.url,
    );
    const src = await fs.readFile(path, "utf8");
    expect(src).toContain("PRACTICE_TRANSFER_SPEND_HOLD");
    expect(src).toContain("PRACTICE_TRANSFER_HOLD_ADJUST");
    expect(src).toContain("PRACTICE_TRANSFER_SPEND_COMMIT");
  });
});
