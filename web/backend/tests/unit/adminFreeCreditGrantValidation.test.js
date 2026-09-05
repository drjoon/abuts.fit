// related files:
// - web/backend/controllers/admin/adminFreeCreditGrant.controller.js
import { describe, expect, test } from "@jest/globals";
import {
  adminOverrideRequestFreeCredit,
  adminGrantFreeShippingCredit,
} from "../../controllers/admin/adminFreeCreditGrant.controller.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("admin free credit grant validation", () => {
  test("override request free credit requires business number", async () => {
    const res = mockRes();
    await adminOverrideRequestFreeCredit({ body: { reason: "test" } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.success).toBe(false);
    expect(String(res.body?.message || "")).toMatch(/사업자등록번호/);
  });

  test("grant free shipping credit requires business number", async () => {
    const res = mockRes();
    await adminGrantFreeShippingCredit({ body: { reason: "test" } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.success).toBe(false);
  });
});
