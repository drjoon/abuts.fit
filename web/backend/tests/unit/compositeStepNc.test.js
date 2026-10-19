import { describe, expect, it } from "@jest/globals";
import {
  compositeStepsMatch,
  ncOwnerRequestId,
  resolveEffectiveCompositeSteps,
  resolveOnePassEnabled,
  stampCompositeStepsOnNcFile,
} from "../../utils/compositeStepIncrement.js";

describe("composite step NC ownership", () => {
  it("override가 없으면 포스트 0.05, 치은 0.05다", () => {
    expect(
      resolveEffectiveCompositeSteps({ retentionGroove: "none" }),
    ).toEqual({ post: 0.05, gingiva: 0.05 });
  });

  it("카드 override를 피치로 쓴다", () => {
    expect(
      resolveEffectiveCompositeSteps({
        retentionGroove: "deep",
        compositeStepIncrementPostOverrideMm: 0.03,
        compositeStepIncrementGingivaOverrideMm: 0.1,
      }),
    ).toEqual({ post: 0.03, gingiva: 0.1 });
  });

  it("다른 의뢰 경로의 NC는 그 의뢰 것이다", () => {
    expect(
      ncOwnerRequestId(
        { filePath: "3-nc/20261016-SOURCE1/20261016-SOURCE1.nc" },
        "20261017-COPY0001",
      ),
    ).toBe("20261016-SOURCE1");
    expect(
      ncOwnerRequestId(
        { s3Key: "3-nc/20261017-COPY0001/20261017-COPY0001.nc" },
        "20261017-COPY0001",
      ),
    ).toBe("20261017-COPY0001");
  });

  it("One Pass는 포스트·치은 스텝이 같을 때만 적용한다", () => {
    expect(
      resolveOnePassEnabled({
        onePassEnabled: true,
        retentionGroove: "none",
      }),
    ).toBe(true);
    expect(
      resolveOnePassEnabled({
        onePassEnabled: true,
        retentionGroove: "deep",
      }),
    ).toBe(false);
    expect(
      resolveOnePassEnabled({
        onePassEnabled: true,
        retentionGroove: "deep",
        compositeStepIncrementPostOverrideMm: 0.1,
        compositeStepIncrementGingivaOverrideMm: 0.1,
      }),
    ).toBe(true);
    expect(
      resolveOnePassEnabled({
        onePassEnabled: false,
        retentionGroove: "none",
      }),
    ).toBe(false);
  });

  it("복사한 NC에는 원본 피치를 찍는다", () => {
    const stamped = stampCompositeStepsOnNcFile(
      { s3Key: "3-nc/20261016-SOURCE1/20261016-SOURCE1.nc" },
      {
        compositeStepIncrementPostOverrideMm: 0.05,
        compositeStepIncrementGingivaOverrideMm: 0.05,
      },
    );
    expect(stamped.compositeStepPostMm).toBe(0.05);
    expect(stamped.compositeStepGingivaMm).toBe(0.05);
    expect(
      compositeStepsMatch(stamped, { post: 0.05, gingiva: 0.03 }),
    ).toBe(false);
  });
});
