import { describe, expect, test } from "@jest/globals";
import { isRequestCancelableAtPrepStage } from "../../controllers/requests/utils.js";

describe("isRequestCancelableAtPrepStage", () => {
  test("준비·빈값·레거시 의뢰는 취소 가능", () => {
    expect(isRequestCancelableAtPrepStage({ manufacturerStage: "준비" })).toBe(true);
    expect(isRequestCancelableAtPrepStage({ manufacturerStage: "" })).toBe(true);
    expect(isRequestCancelableAtPrepStage({ manufacturerStage: "의뢰" })).toBe(true);
  });

  test("가공 이후·알 수 없는 단계는 취소 불가(fail-closed)", () => {
    for (const stage of ["CAM", "가공", "세척.패킹", "세척.포장", "packing", "포장.발송", "추적관리"]) {
      expect(isRequestCancelableAtPrepStage({ manufacturerStage: stage })).toBe(false);
    }
  });

  test("준비여도 가공 이후 검수·가공 기록이 있으면 취소 불가", () => {
    expect(
      isRequestCancelableAtPrepStage({
        manufacturerStage: "준비",
        caseInfos: { reviewByStage: { machining: { status: "APPROVED" } } },
      }),
    ).toBe(false);
    expect(
      isRequestCancelableAtPrepStage({
        manufacturerStage: "준비",
        productionSchedule: { actualMachiningStart: new Date() },
      }),
    ).toBe(false);
    expect(
      isRequestCancelableAtPrepStage({
        manufacturerStage: "준비",
        caseInfos: { reviewByStage: { cam: { status: "APPROVED" }, machining: { status: "PENDING" } } },
      }),
    ).toBe(true);
  });

  test("불완전가공 판정은 취소 허용", () => {
    expect(
      isRequestCancelableAtPrepStage({
        manufacturerStage: "세척.패킹",
        rnd: { unmachinableAt: new Date() },
      }),
    ).toBe(true);
  });
});
