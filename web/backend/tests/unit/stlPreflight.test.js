// related files:
// - web/backend/services/abutmentStl/preflight.service.js
// - web/backend/services/abutmentStl/tightCorner.js
import { describe, expect, it } from "@jest/globals";
import { rotationAxisAngle } from "../../services/abutmentStl/meshCore.js";
import {
  invertRigidMatrix,
  suggestedFilletRadiusMm,
  summarizeTightCorner,
  tightCornerOverlayInOriginalFrame,
} from "../../services/abutmentStl/preflight.service.js";

describe("stlPreflight summarizeTightCorner", () => {
  it("공구 R 0.60이면 권고 R은 0.65mm다", () => {
    expect(suggestedFilletRadiusMm(0.6)).toBe(0.65);
  });

  it("타이트 샘플이 있으면 tight와 최소·평균 R을 요약한다", () => {
    const summary = summarizeTightCorner({
      toolDiameterMm: 1.2,
      tightCount: 3,
      averageFilletRadiusMm: 0.44,
      samples: [
        { filletRadiusMm: 0.45 },
        { filletRadiusMm: 0.43 },
        { filletRadiusMm: 0.44 },
      ],
    });
    expect(summary.status).toBe("tight");
    expect(summary.tightCount).toBe(3);
    expect(summary.averageFilletRadiusMm).toBe(0.44);
    expect(summary.minFilletRadiusMm).toBe(0.43);
    expect(summary.toolRadiusMm).toBe(0.6);
    expect(summary.suggestedFilletRadiusMm).toBe(0.65);
  });

  it("정렬 행렬을 되돌리면 보정 면이 원본 좌표로 돌아온다", () => {
    const m = rotationAxisAngle([0, 0, 1], Math.PI / 2, [1, 2, 3]);
    const apply = (p) => [
      m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
      m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
      m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
    ];
    const src = [1.2, -0.4, 3.3];
    const aligned = apply(src);
    const overlay = tightCornerOverlayInOriginalFrame(
      {
        version: 6,
        tightCount: 1,
        toolDiameterMm: 1.2,
        averageFilletRadiusMm: 0.44,
        samples: [{ sampleIndex: 0, filletRadiusMm: 0.44, cornerPoint: aligned }],
        correctionSolid: {
          filletRadiusMm: 0.6,
          positions: [...aligned, ...apply([0, 1, 2]), ...apply([2, 0, 1])],
          indices: [0, 1, 2],
        },
      },
      m,
    );
    const back = overlay.samples[0].cornerPoint;
    expect(back[0]).toBeCloseTo(src[0], 2);
    expect(back[1]).toBeCloseTo(src[1], 2);
    expect(back[2]).toBeCloseTo(src[2], 2);
    expect(overlay.correctionSolid.positions[0]).toBeCloseTo(src[0], 2);
    expect(invertRigidMatrix(m)).toHaveLength(16);
  });

  it("타이트가 없으면 ok다", () => {
    const summary = summarizeTightCorner({
      toolDiameterMm: 1.2,
      tightCount: 0,
      averageFilletRadiusMm: null,
      samples: [],
    });
    expect(summary.status).toBe("ok");
    expect(summary.averageFilletRadiusMm).toBeNull();
  });
});
