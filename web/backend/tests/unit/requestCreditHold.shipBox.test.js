// related files:
// - web/backend/services/requestCreditHold.service.js
import {
  buildRequesterShipBoxKey,
  resolveRequestCreditHoldAnchorId,
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
