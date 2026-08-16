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
  it("prefers shippingReceiver.sourceAnchorId for PTX", () => {
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
    ).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("falls back to practiceBusinessAnchorId then lab", () => {
    expect(
      resolveShippingMailboxOrgId({
        businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        partnerBilling: {
          practiceBusinessAnchorId: "cccccccccccccccccccccccc",
          relatedPracticeTransferId: "dddddddddddddddddddddddd",
        },
      }),
    ).toBe("cccccccccccccccccccccccc");

    expect(
      resolveShippingMailboxOrgId({
        businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("uses different practice keys for different clinics", () => {
    const lab = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const a = resolveShippingMailboxOrgId({
      businessAnchorId: lab,
      shippingReceiver: { sourceAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    const b = resolveShippingMailboxOrgId({
      businessAnchorId: lab,
      shippingReceiver: { sourceAnchorId: "cccccccccccccccccccccccc" },
    });
    expect(a).not.toBe(b);
  });
});

describe("isPracticeDirectShipping / getShippingReceiver", () => {
  it("detects PTX via relatedPracticeTransferId", () => {
    expect(
      isPracticeDirectShipping({
        partnerBilling: {
          relatedPracticeTransferId: "dddddddddddddddddddddddd",
        },
      }),
    ).toBe(true);
    expect(isPracticeDirectShipping({ businessAnchorId: "x" })).toBe(false);
  });

  it("reads shippingReceiver fields used by Hanjin preference", () => {
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
    // Hanjin helpers prefer these fields over lab requestor metadata
    expect(isPracticeDirectShipping({ shippingReceiver: receiver })).toBe(true);
  });

  it("detects PTX before packing snapshot exists", () => {
    expect(
      isPracticeDirectShipping({
        partnerBilling: {
          relatedPracticeTransferId: "dddddddddddddddddddddddd",
          practiceBusinessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
    ).toBe(true);
    expect(
      resolveShippingMailboxOrgId({
        businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        partnerBilling: {
          practiceBusinessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
          relatedPracticeTransferId: "dddddddddddddddddddddddd",
        },
      }),
    ).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });
});
