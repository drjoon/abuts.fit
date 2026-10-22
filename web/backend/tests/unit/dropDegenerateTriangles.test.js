import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";
import { dropDegenerateTriangles } from "../../services/abutmentStl/cuffBlendJob.js";

describe("dropDegenerateTriangles", () => {
  it("가장 짧은 변이 1e-6mm 미만인 퇴화 삼각형만 뺀다", () => {
    const good = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    // 두 정점이 6e-7mm 떨어진 슬리버 (ESPRIT 솔리드 인정 실패 사례 ZKCXTDQQ)
    const sliver = [0, 0, 1, 1, 0, 1, 1 + 6e-7, 0, 1];
    // 가장 짧은 변 2.8e-6mm인 삼각형은 남긴다 (정상 가공 사례 하한)
    const tinyButKept = [0, 0, 2, 1, 0, 2, 1 + 2.8e-6, 0, 2];
    const buffer = writeBinaryStl({
      positions: Float64Array.from([...good, ...sliver, ...tinyButKept]),
      attributes: new Uint16Array(3),
    });
    const { buffer: out, dropped } = dropDegenerateTriangles(buffer);
    expect(dropped).toBe(1);
    expect(parseStl(out).positions.length / 9).toBe(2);
  });

  it("퇴화가 없으면 버퍼를 그대로 돌려준다", () => {
    const buffer = writeBinaryStl({
      positions: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      attributes: new Uint16Array(1),
    });
    const { buffer: out, dropped } = dropDegenerateTriangles(buffer);
    expect(dropped).toBe(0);
    expect(out).toBe(buffer);
  });
});
