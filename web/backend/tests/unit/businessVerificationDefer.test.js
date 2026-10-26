// related files:
// - web/backend/utils/businessVerificationDefer.js
import { describe, expect, test } from "@jest/globals";
import {
  HOMETAX_OUTAGE_AFTER_RETRY_MESSAGE,
  hasSubmittedBusinessRegistration,
  verifyBusinessNumberRetryingOutageOnce,
} from "../../utils/businessVerificationDefer.js";

describe("business verification defer", () => {
  test("license and business number count as already submitted", () => {
    expect(
      hasSubmittedBusinessRegistration({
        businessNumberNormalized: "1234567890",
        businessLicense: { s3Key: "license/a.jpg" },
      }),
    ).toBe(true);
  });

  test("pending verification without a new upload still counts", () => {
    expect(
      hasSubmittedBusinessRegistration({
        metadata: { businessNumber: "123-45-67890" },
        verificationPendingAt: new Date(),
      }),
    ).toBe(true);
  });

  test("missing number or license does not count", () => {
    expect(
      hasSubmittedBusinessRegistration({
        businessLicense: { fileId: "f1" },
      }),
    ).toBe(false);
    expect(
      hasSubmittedBusinessRegistration({
        businessNumberNormalized: "1234567890",
      }),
    ).toBe(false);
  });

  test("outage retries once and marks the second pending result", async () => {
    const calls = [];
    const verify = async (args) => {
      calls.push(args.businessNumber);
      return { verified: false, pending: true, message: "down" };
    };
    const result = await verifyBusinessNumberRetryingOutageOnce(verify, {
      businessNumber: "1234567890",
    });
    expect(calls).toEqual(["1234567890", "1234567890"]);
    expect(result.retried).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.message).toBe(HOMETAX_OUTAGE_AFTER_RETRY_MESSAGE);
  });

  test("a successful retry is returned without the outage flag", async () => {
    let n = 0;
    const verify = async () => {
      n += 1;
      if (n === 1) return { verified: false, pending: true };
      return { verified: true, pending: false, message: "ok" };
    };
    const result = await verifyBusinessNumberRetryingOutageOnce(verify, {});
    expect(n).toBe(2);
    expect(result.verified).toBe(true);
    expect(result.retried).toBeUndefined();
  });
});
