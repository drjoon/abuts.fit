// related files:
// - web/backend/services/requestCreditHold.service.js
// - 2026-08-21: PTX CA도 기공소 부담 의뢰비는 Request hold(shouldSkipMachiningHold false).
// - 2026-08-21: PTX CA도 박스 배송 hold(shouldSkipShippingHold false).
import {
  buildRequesterShipBoxKey,
  resolveRequestCreditHoldAnchorId,
  shouldSkipMachiningHold,
  shouldSkipShippingHold,
} from "../../services/requestCreditHold.service.js";

describe("buildRequesterShipBoxKey", () => {
  test("의뢰 사업자+예정 출고일로 박스를 묶는다", () => {
    const request = {
      businessAnchorId: "cccccccccccccccccccccccc",
      timeline: { estimatedShipYmd: "2026-08-20" },
      caseInfos: { clinicName: "서울" },
    };
    expect(resolveRequestCreditHoldAnchorId(request)).toBe(
      "cccccccccccccccccccccccc",
    );
    expect(buildRequesterShipBoxKey(request)).toBe(
      "cccccccccccccccccccccccc:2026-08-20",
    );
  });

  test("치과명이 달라도 같은 의뢰 사업자·출고일이면 같은 키다", () => {
    const ba = "cccccccccccccccccccccccc";
    const a = {
      businessAnchorId: ba,
      timeline: { estimatedShipYmd: "2026-08-20" },
      caseInfos: { clinicName: "서울" },
    };
    const b = {
      businessAnchorId: ba,
      timeline: { estimatedShipYmd: "2026-08-20" },
      caseInfos: { clinicName: "향기로운치과" },
    };
    expect(buildRequesterShipBoxKey(a)).toBe(buildRequesterShipBoxKey(b));
  });
});

describe("PTX CA hold policy", () => {
  const ptxCa = {
    businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    partnerBilling: {
      relatedPracticeTransferId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      practicePrepaidAbutment: true,
    },
    timeline: { estimatedShipYmd: "2026-08-21" },
  };

  test("비거래처 선불 PTX CA는 가공 hold skip, 배송 hold는 박스 경로로 허용", () => {
    expect(shouldSkipMachiningHold(ptxCa)).toBe(true);
    expect(shouldSkipShippingHold(ptxCa)).toBe(false);
    expect(buildRequesterShipBoxKey(ptxCa)).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbb:2026-08-21",
    );
  });

  test("기공소 부담 PTX CA(선불 아님)는 가공·배송 hold 모두 Request 경로", () => {
    const labPaid = {
      ...ptxCa,
      partnerBilling: {
        ...ptxCa.partnerBilling,
        practicePrepaidAbutment: false,
      },
    };
    expect(shouldSkipMachiningHold(labPaid)).toBe(false);
    expect(shouldSkipShippingHold(labPaid)).toBe(false);
  });

  test("거래처 선불 PTX CA는 기공소 생산비 hold를 잡는다", () => {
    const trading = {
      ...ptxCa,
      partnerBilling: {
        ...ptxCa.partnerBilling,
        practicePrepaidAbutment: true,
        isTradingPartner: true,
        billingOwnerAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      },
    };
    expect(shouldSkipMachiningHold(trading)).toBe(false);
  });
});
