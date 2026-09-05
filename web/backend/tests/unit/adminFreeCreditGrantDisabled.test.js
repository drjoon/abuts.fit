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

describe("admin free credit grant disabled", () => {
  test("override request free credit returns 403", async () => {
    const res = mockRes();
    await adminOverrideRequestFreeCredit({ body: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body?.success).toBe(false);
    expect(String(res.body?.message || "")).toMatch(/중단/);
  });

  test("grant free shipping credit returns 403", async () => {
    const res = mockRes();
    await adminGrantFreeShippingCredit({ body: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body?.success).toBe(false);
  });
});
