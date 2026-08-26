// related files:
// - web/backend/utils/scannerIntegrationCrypto.js
// - web/backend/services/integrations/threeShape/client.js
import {
  decryptScannerCredentials,
  encryptScannerCredentials,
} from "../../utils/scannerIntegrationCrypto.js";
import {
  getThreeShapeClientMode,
  listNewThreeShapeCases,
  validateThreeShapeCredentials,
} from "../../services/integrations/threeShape/client.js";

describe("scannerIntegrationCrypto", () => {
  const prev = process.env.SCANNER_INTEGRATION_SECRET;

  beforeAll(() => {
    process.env.SCANNER_INTEGRATION_SECRET = "unit-test-scanner-secret";
  });

  afterAll(() => {
    if (prev == null) delete process.env.SCANNER_INTEGRATION_SECRET;
    else process.env.SCANNER_INTEGRATION_SECRET = prev;
  });

  test("encrypt/decrypt roundtrip", () => {
    const payload = { email: "lab@example.com", password: "secret" };
    const cipher = encryptScannerCredentials(payload);
    expect(cipher.split(".")).toHaveLength(3);
    expect(decryptScannerCredentials(cipher)).toEqual(payload);
  });
});

describe("threeShape client fixture", () => {
  const prevMode = process.env.THREE_SHAPE_CLIENT_MODE;
  const prevBase = process.env.THREE_SHAPE_API_BASE_URL;

  beforeAll(() => {
    process.env.THREE_SHAPE_CLIENT_MODE = "fixture";
    delete process.env.THREE_SHAPE_API_BASE_URL;
  });

  afterAll(() => {
    if (prevMode == null) delete process.env.THREE_SHAPE_CLIENT_MODE;
    else process.env.THREE_SHAPE_CLIENT_MODE = prevMode;
    if (prevBase == null) delete process.env.THREE_SHAPE_API_BASE_URL;
    else process.env.THREE_SHAPE_API_BASE_URL = prevBase;
  });

  test("fixture mode validates and lists a stable case", async () => {
    expect(getThreeShapeClientMode()).toBe("fixture");
    const validated = await validateThreeShapeCredentials({
      email: "Lab@Example.com",
      password: "x",
    });
    expect(validated.ok).toBe(true);
    expect(validated.externalAccountEmail).toBe("lab@example.com");

    const cases = await listNewThreeShapeCases({
      credentials: { email: "lab@example.com" },
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].externalCaseId).toBe("fixture-case-lab@example.com");
    expect(cases[0].assets[0].buffer.length).toBeGreaterThan(0);
  });
});

describe("threeShape client live pending", () => {
  const prevMode = process.env.THREE_SHAPE_CLIENT_MODE;
  const prevBase = process.env.THREE_SHAPE_API_BASE_URL;

  beforeAll(() => {
    process.env.THREE_SHAPE_CLIENT_MODE = "live";
    delete process.env.THREE_SHAPE_API_BASE_URL;
  });

  afterAll(() => {
    if (prevMode == null) delete process.env.THREE_SHAPE_CLIENT_MODE;
    else process.env.THREE_SHAPE_CLIENT_MODE = prevMode;
    if (prevBase == null) delete process.env.THREE_SHAPE_API_BASE_URL;
    else process.env.THREE_SHAPE_API_BASE_URL = prevBase;
  });

  test("live without base URL keeps connect pending and lists empty", async () => {
    const validated = await validateThreeShapeCredentials({
      email: "lab@example.com",
      password: "x",
    });
    expect(validated.ok).toBe(false);
    expect(validated.pending).toBe(true);

    const cases = await listNewThreeShapeCases({
      credentials: { email: "lab@example.com" },
    });
    expect(cases).toEqual([]);
  });
});
