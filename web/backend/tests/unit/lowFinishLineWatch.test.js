// related files:
// - web/backend/services/lowFinishLineWatch.js
import { describe, expect, it } from "@jest/globals";
import {
  LOW_FINISH_LINE_SUCCESS_TARGET,
  deriveLowFinishLineStatus,
  isLowFinishLineMinZ,
  isLowFinishLineWarningOn,
  resolveLowFinishLineStatus,
} from "../../services/lowFinishLineWatch.js";

describe("lowFinishLineWatch", () => {
  it("1mm 미만만 짧은 커프로 본다", () => {
    expect(isLowFinishLineMinZ(0.62)).toBe(true);
    expect(isLowFinishLineMinZ(1)).toBe(false);
    expect(isLowFinishLineMinZ(Number.NaN)).toBe(false);
  });

  it("세척.패킹 이후는 통과, 불완전가공은 실패, 샘플은 제외", () => {
    expect(
      deriveLowFinishLineStatus({ manufacturerStage: "세척.패킹" }),
    ).toBe("success");
    expect(
      deriveLowFinishLineStatus({
        manufacturerStage: "가공",
        rnd: { unmachinableAt: new Date() },
      }),
    ).toBe("failed");
    expect(
      deriveLowFinishLineStatus({
        manufacturerStage: "포장.발송",
        source: "dummy_sample",
      }),
    ).toBe("skipped");
    expect(deriveLowFinishLineStatus({ manufacturerStage: "준비" })).toBe("open");
  });

  it("관리자 판정이 공정 상태보다 우선한다", () => {
    expect(resolveLowFinishLineStatus("success", "failed")).toBe("failed");
    expect(resolveLowFinishLineStatus("failed", "")).toBe("failed");
  });

  it("50건 통과이고 실패가 없을 때만 경고를 끈다", () => {
    expect(
      isLowFinishLineWarningOn({
        success: LOW_FINISH_LINE_SUCCESS_TARGET - 1,
        failed: 0,
      }),
    ).toBe(true);
    expect(
      isLowFinishLineWarningOn({
        success: LOW_FINISH_LINE_SUCCESS_TARGET,
        failed: 0,
      }),
    ).toBe(false);
    expect(
      isLowFinishLineWarningOn({
        success: LOW_FINISH_LINE_SUCCESS_TARGET,
        failed: 1,
      }),
    ).toBe(true);
  });
});
