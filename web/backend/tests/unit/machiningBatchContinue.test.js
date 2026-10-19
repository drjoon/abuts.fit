import { describe, expect, it } from "@jest/globals";
import { shouldRequeueSameRequestAfterComplete } from "../../controllers/cnc/machiningBatchContinue.js";

describe("shouldRequeueSameRequestAfterComplete", () => {
  it("남은 수량이 있고 완료 시각이 없으면 같은 의뢰를 다시 넣는다", () => {
    expect(
      shouldRequeueSameRequestAfterComplete({ machiningQty: 4 }),
    ).toBe(true);
    expect(
      shouldRequeueSameRequestAfterComplete({
        machiningQty: 1,
        actualMachiningComplete: null,
      }),
    ).toBe(true);
  });

  it("수량이 없거나 이번 묶음이 끝나면 다시 넣지 않는다", () => {
    expect(shouldRequeueSameRequestAfterComplete({ machiningQty: 0 })).toBe(
      false,
    );
    expect(shouldRequeueSameRequestAfterComplete(null)).toBe(false);
    expect(
      shouldRequeueSameRequestAfterComplete({
        machiningQty: 1,
        actualMachiningComplete: new Date(),
      }),
    ).toBe(false);
  });
});
