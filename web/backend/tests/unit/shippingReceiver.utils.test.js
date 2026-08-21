// related files:
// - web/backend/utils/shippingReceiver.utils.js
import { describe, expect, it } from "@jest/globals";
import {
  buildShippingReceiverFromPractice,
  getShippingReceiver,
  isPracticeDirectShipping,
  resolveShippingMailboxOrgId,
} from "../../utils/shippingReceiver.utils.js";

describe("buildShippingReceiverFromPractice", () => {
  it("builds snapshot from practice BA metadata + user profile", () => {
    const receiver = buildShippingReceiverFromPractice({
      practiceAnchor: {
        _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        name: "테스트치과",
        metadata: {
          companyName: "테스트치과",
          phoneNumber: "055-111-2222",
          address: "김해시 흥동",
          addressDetail: "101호",
          zipCode: "50800",
          representativeName: "김원장",
        },
      },
      practiceUser: {
        practiceProfile: {
          staffName: "이담당",
          phone: "010-1234-5678",
          clinicPhone: "055-111-2222",
        },
      },
    });
    expect(receiver).toMatchObject({
      name: "테스트치과",
      phone: "055-111-2222",
      contactName: "이담당",
      address: "김해시 흥동",
      addressDetail: "101호",
      zipCode: "50800",
    });
    expect(String(receiver.sourceAnchorId)).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("returns null without practice anchor", () => {
    expect(buildShippingReceiverFromPractice({})).toBeNull();
  });
});

describe("resolveShippingMailboxOrgId", () => {
  it("uses lab businessAnchorId even when practice shippingReceiver exists", () => {
    expect(
      resolveShippingMailboxOrgId({
        businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        shippingReceiver: {
          sourceAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
          name: "치과",
        },
        partnerBilling: {
          practiceBusinessAnchorId: "cccccccccccccccccccccccc",
        },
      }),
    ).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("falls back to requestor lab BA", () => {
    expect(
      resolveShippingMailboxOrgId({
        businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        partnerBilling: {
          practiceBusinessAnchorId: "cccccccccccccccccccccccc",
          relatedPracticeTransferId: "dddddddddddddddddddddddd",
        },
      }),
    ).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");

    expect(
      resolveShippingMailboxOrgId({
        requestor: { businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb" },
      }),
    ).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("joins same lab requests into one mailbox key", () => {
    const lab = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const a = resolveShippingMailboxOrgId({
      businessAnchorId: lab,
      partnerBilling: { practiceBusinessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    const b = resolveShippingMailboxOrgId({
      businessAnchorId: lab,
      partnerBilling: { practiceBusinessAnchorId: "cccccccccccccccccccccccc" },
    });
    expect(a).toBe(lab);
    expect(b).toBe(lab);
  });
});

describe("isPracticeDirectShipping / getShippingReceiver", () => {
  it("does not treat PTX as practice-direct", () => {
    expect(
      isPracticeDirectShipping({
        partnerBilling: {
          relatedPracticeTransferId: "dddddddddddddddddddddddd",
        },
      }),
    ).toBe(false);
    expect(isPracticeDirectShipping({ businessAnchorId: "x" })).toBe(false);
  });

  it("ignores PTX shippingReceiver snapshot for Hanjin preference", () => {
    const receiver = getShippingReceiver({
      partnerBilling: {
        relatedPracticeTransferId: "dddddddddddddddddddddddd",
        practiceBusinessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      },
      shippingReceiver: {
        name: "직납치과",
        phone: "055-999-8888",
        contactName: "담당자",
        address: "서울시 강남구",
        addressDetail: "3층",
        zipCode: "06236",
      },
    });
    expect(receiver).toBeNull();
  });

  it("reads shippingReceiver only for non-PTX requests", () => {
    const receiver = getShippingReceiver({
      shippingReceiver: {
        name: "직납치과",
        phone: "055-999-8888",
        contactName: "담당자",
        address: "서울시 강남구",
        addressDetail: "3층",
        zipCode: "06236",
      },
    });
    expect(receiver).toMatchObject({
      name: "직납치과",
      phone: "055-999-8888",
      contactName: "담당자",
      address: "서울시 강남구",
      addressDetail: "3층",
      zipCode: "06236",
    });
    expect(isPracticeDirectShipping({ shippingReceiver: receiver })).toBe(true);
  });
});
