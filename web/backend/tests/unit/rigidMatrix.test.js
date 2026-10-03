// related files:
// - web/backend/utils/rigidMatrix.js
import { describe, expect, it } from "@jest/globals";
import { isRigidRowMajorMatrix } from "../../utils/rigidMatrix.js";

const c = Math.cos(0.4);
const s = Math.sin(0.4);

describe("isRigidRowMajorMatrix", () => {
  it("accepts rotation + translation", () => {
    expect(isRigidRowMajorMatrix([c, -s, 0, 3, s, c, 0, -2, 0, 0, 1, 1.5, 0, 0, 0, 1])).toBe(true);
    expect(isRigidRowMajorMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(true);
  });

  it("rejects scale, mirror, projection, far translation and bad input", () => {
    expect(isRigidRowMajorMatrix([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(false);
    expect(isRigidRowMajorMatrix([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(false);
    expect(isRigidRowMajorMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0, 0, 1])).toBe(false);
    expect(isRigidRowMajorMatrix([1, 0, 0, 900, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(false);
    expect(isRigidRowMajorMatrix([1, 0, 0])).toBe(false);
    expect(isRigidRowMajorMatrix(null)).toBe(false);
    expect(isRigidRowMajorMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, "1"])).toBe(false);
  });
});
