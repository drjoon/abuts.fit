import { describe, expect, it } from "@jest/globals";
import {
  compositeStepsMatch,
  finishBackStepMmFromCuffAngleDeg,
  interpretBakedCompositeSteps,
  ncOwnerRequestId,
  resolveEffectiveCompositeSteps,
  resolveFinishBackStepMm,
  // [legacy One Pass] resolveOnePassEnabled,
  stampCompositeStepsOnNcFile,
} from "../../utils/compositeStepIncrement.js";

describe("composite step NC ownership", () => {
  it("override와 커프 각도가 없으면 포스트 0.05, Finish_Back 0.07이다", () => {
    expect(
      resolveEffectiveCompositeSteps({ retentionGroove: "none" }),
    ).toEqual({ post: 0.05, gingiva: 0.07 });
  });

  it("송용원 27처럼 80° 커프는 Finish_Back 0.03, 낮은 min_z가 아니어도 그렇다", () => {
    const song = {
      retentionGroove: "deep",
      finishLine: { min_z: 1.624 },
      cuffBlend: { status: "applied", maxAngleDeg: 80.48 },
    };
    expect(resolveFinishBackStepMm(song)).toBe(0.03);
    expect(resolveEffectiveCompositeSteps(song)).toEqual({
      post: 0.2,
      gingiva: 0.03,
    });
  });

  it("커프 각도에 따라 Finish_Back 스텝이 0.01 단위로 0.03~0.07이다", () => {
    expect(finishBackStepMmFromCuffAngleDeg(50)).toBe(0.07);
    expect(finishBackStepMmFromCuffAngleDeg(63)).toBe(0.07);
    expect(finishBackStepMmFromCuffAngleDeg(64)).toBe(0.06);
    expect(finishBackStepMmFromCuffAngleDeg(70)).toBe(0.05);
    expect(finishBackStepMmFromCuffAngleDeg(72)).toBe(0.04);
    expect(finishBackStepMmFromCuffAngleDeg(75)).toBe(0.04);
    expect(finishBackStepMmFromCuffAngleDeg(76)).toBe(0.03);
    expect(finishBackStepMmFromCuffAngleDeg(78)).toBe(0.03);
    expect(finishBackStepMmFromCuffAngleDeg(89)).toBe(0.03);
  });

  it("보정이 적용된 각도를 쓰고, 없으면 제안 전 각도를 쓴다", () => {
    expect(
      resolveFinishBackStepMm({
        cuffBlend: { status: "applied", maxAngleDeg: 50 },
        cuffProposal: { maxCuffAngleDegBefore: 80 },
      }),
    ).toBe(0.07);
    expect(
      resolveFinishBackStepMm({
        cuffBlend: { status: "manual-review", maxAngleDeg: 80 },
        cuffProposal: { maxCuffAngleDegBefore: 78 },
      }),
    ).toBe(0.03);
  });

  it("치은 수동 override가 각도보다 우선한다", () => {
    expect(
      resolveFinishBackStepMm({
        compositeStepIncrementGingivaOverrideMm: 0.1,
        cuffBlend: { status: "applied", maxAngleDeg: 80.48 },
      }),
    ).toBe(0.1);
  });

  it("옛 NC의 치은 0.05는 실제 0.07이고, 각도 규칙 스탬프는 적힌 값이다", () => {
    expect(
      interpretBakedCompositeSteps(
        { compositeStepPostMm: 0.05, compositeStepGingivaMm: 0.05 },
        { cuffBlend: { status: "applied", maxAngleDeg: 80.48 } },
      ),
    ).toEqual({ post: 0.05, gingiva: 0.07 });
    expect(
      interpretBakedCompositeSteps(
        {
          compositeStepPostMm: 0.05,
          compositeStepGingivaMm: 0.05,
          gingivaStepRule: "cuff-angle-v1",
        },
        {},
      ),
    ).toEqual({ post: 0.05, gingiva: 0.05 });
    expect(
      interpretBakedCompositeSteps(
        { compositeStepPostMm: 0.05, compositeStepGingivaMm: 0.05 },
        { compositeStepIncrementGingivaOverrideMm: 0.05 },
      ),
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

  // [legacy One Pass] PreviewModal 토글 제거. Finish는 항상 2–3단.
  // it("One Pass는 항상 비활성(2–3단 Finish)", () => {
  //   expect(
  //     resolveOnePassEnabled({
  //       onePassEnabled: true,
  //       retentionGroove: "none",
  //     }),
  //   ).toBe(false);
  // });

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
