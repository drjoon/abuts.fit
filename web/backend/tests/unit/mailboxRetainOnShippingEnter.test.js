// related files:
// - web/backend/controllers/requests/mailbox.utils.js
import { describe, expect, it } from "@jest/globals";
import {
  retainMailboxOnShippingEnter,
  normalizeMailboxReceiverFingerprint,
} from "../../controllers/requests/mailbox.utils.js";

describe("retainMailboxOnShippingEnter", () => {
  it("keeps the mailbox assigned at 세척.패킹", async () => {
    const request = {
      mailboxAddress: "c2b3",
      requestCategory: "order",
    };
    const result = await retainMailboxOnShippingEnter({
      request,
      requestorOrgId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(result).toBe("C2B3");
    expect(request.mailboxAddress).toBe("C2B3");
  });

  it("keeps the mailbox for copied_sample at 포장.발송 진입", async () => {
    const request = {
      mailboxAddress: "A1A1",
      requestCategory: "copied_sample",
    };
    const result = await retainMailboxOnShippingEnter({
      request,
      requestorOrgId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(result).toBe("A1A1");
    expect(request.mailboxAddress).toBe("A1A1");
  });
});

describe("normalizeMailboxReceiverFingerprint", () => {
  const baseReceiver = {
    name: "서울치과",
    phone: "010-1234-5678",
    zipCode: "06200",
    address: "강남구 테헤란로 1",
    addressDetail: "1층",
  };

  it("treats equivalent phone/spacing as the same recipient", () => {
    const a = { shippingReceiver: { ...baseReceiver } };
    const b = {
      shippingReceiver: {
        ...baseReceiver,
        phone: "01012345678",
        address: "강남구  테헤란로 1",
      },
    };
    expect(normalizeMailboxReceiverFingerprint(a)).toBe(
      normalizeMailboxReceiverFingerprint(b),
    );
  });

  it("differs when phone or address changed", () => {
    const a = { shippingReceiver: { ...baseReceiver } };
    const b = {
      shippingReceiver: { ...baseReceiver, phone: "010-9999-0000" },
    };
    expect(normalizeMailboxReceiverFingerprint(a)).not.toBe(
      normalizeMailboxReceiverFingerprint(b),
    );
  });
});
