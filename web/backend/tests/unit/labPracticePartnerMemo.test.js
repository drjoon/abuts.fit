// related files:
// - web/backend/utils/labPracticePartnerMemo.js
import {
  findLabPracticePartnerMemo,
  normalizeLabPracticePartnerMemo,
  upsertLabPracticePartnerMemoList,
} from "../../utils/labPracticePartnerMemo.js";

const OID_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OID_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("labPracticePartnerMemo", () => {
  test("normalizeLabPracticePartnerMemo trims and caps length", () => {
    expect(normalizeLabPracticePartnerMemo("  hello  ")).toBe("hello");
    expect(normalizeLabPracticePartnerMemo("x".repeat(600)).length).toBe(500);
  });

  test("upsertLabPracticePartnerMemoList replaces by practice", () => {
    const first = upsertLabPracticePartnerMemoList([], OID_A, "첫 메모");
    expect(first).toHaveLength(1);
    expect(findLabPracticePartnerMemo(first, OID_A)?.memo).toBe("첫 메모");

    const second = upsertLabPracticePartnerMemoList(first, OID_A, "둘째 메모");
    expect(second).toHaveLength(1);
    expect(findLabPracticePartnerMemo(second, OID_A)?.memo).toBe("둘째 메모");

    const both = upsertLabPracticePartnerMemoList(second, OID_B, "B 메모");
    expect(both).toHaveLength(2);
  });

  test("empty memo removes existing row", () => {
    const seeded = upsertLabPracticePartnerMemoList([], OID_A, "메모");
    const cleared = upsertLabPracticePartnerMemoList(seeded, OID_A, "   ");
    expect(cleared).toHaveLength(0);
  });
});
