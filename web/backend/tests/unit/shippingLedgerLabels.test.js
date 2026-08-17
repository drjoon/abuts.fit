// related files:
// - web/backend/utils/shippingLedgerLabels.js
import {
  resolveCustomerShippingLabel,
  SHIPPING_LEDGER_LABELS,
} from "../../utils/shippingLedgerLabels.js";

describe("shipping ledger labels", () => {
  test("practice transfer abuts shipping is dentist → abuts", () => {
    expect(
      resolveCustomerShippingLabel({ isPracticeTransferAbuts: true }),
    ).toBe(SHIPPING_LEDGER_LABELS.practiceToAbuts);
  });

  test("lab requestor production shipping is lab → abuts", () => {
    expect(
      resolveCustomerShippingLabel({ requestorKind: "lab" }),
    ).toBe(SHIPPING_LEDGER_LABELS.labToAbuts);
  });

  test("practice requestor shipping is dentist → abuts", () => {
    expect(
      resolveCustomerShippingLabel({ requestorKind: "practice" }),
    ).toBe(SHIPPING_LEDGER_LABELS.practiceToAbuts);
  });
});
