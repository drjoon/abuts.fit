// 심플어벗 템플릿 업로드: 원본을 열기 전에 받는 meta 검증.
// related files:
// - web/backend/services/abutmentTemplateUpload.service.js
import { describe, expect, test } from "@jest/globals";
import { parseTemplateMeta } from "../../services/abutmentTemplateUpload.service.js";

const frame = { origin: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] };

describe("parseTemplateMeta", () => {
  test("정상 meta를 정리한다", () => {
    const meta = parseTemplateMeta({
      kind: "심플어벗",
      diameter: "6",
      height: "m",
      frame,
      marginHeightMm: 1.23456,
      maxDiameterMm: "6.1",
      heightMm: -1,
    });
    expect(meta).toEqual({
      kind: "심플어벗",
      diameter: "6",
      height: "M",
      frame,
      marginHeightMm: 1.235,
      maxDiameterMm: 6.1,
      heightMm: 0,
    });
  });

  test("JSON 문자열도 받는다", () => {
    expect(parseTemplateMeta(JSON.stringify({ kind: "심플밀링", diameter: "4.5", frame })).diameter).toBe("4.5");
  });

  test.each([
    [{ kind: "기타", diameter: "6", frame }, "종류"],
    [{ kind: "심플어벗", diameter: "6mm", frame }, "직경"],
    [{ kind: "심플어벗", diameter: "6", height: "<x>", frame }, "높이"],
    [{ kind: "심플어벗", diameter: "6", frame: { ...frame, axis: [0, 0] } }, "축"],
    [{ kind: "심플어벗", diameter: "6", frame: { ...frame, origin: [1e9, 0, 0] } }, "축"],
    ["{not json", "템플릿 정보"],
  ])("잘못된 meta는 400 (%#)", (raw, message) => {
    expect(() => parseTemplateMeta(raw)).toThrow(message);
  });
});
