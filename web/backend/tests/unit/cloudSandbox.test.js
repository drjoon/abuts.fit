// related files:
// - web/backend/utils/cloudSandbox.js
// - web/backend/utils/mongoUri.js
import {
  CLOUD_SANDBOX_DB,
  CLOUD_SANDBOX_URI,
  assertSandboxDropAllowed,
} from "../../utils/cloudSandbox.js";
import {
  resolveMongoSourceLabel,
  resolveMongoUri,
} from "../../utils/mongoUri.js";

describe("cloud sandbox", () => {
  const prevFlag = process.env.ABUTS_CLOUD_SANDBOX;
  const prevUri = process.env.MONGODB_URI_TEST;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ABUTS_CLOUD_SANDBOX;
    else process.env.ABUTS_CLOUD_SANDBOX = prevFlag;
    if (prevUri === undefined) delete process.env.MONGODB_URI_TEST;
    else process.env.MONGODB_URI_TEST = prevUri;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  test("샌드박스 플래그가 켜지면 베타 URI를 무시하고 로컬 샌드박스만 연다", () => {
    process.env.NODE_ENV = "development";
    process.env.ABUTS_CLOUD_SANDBOX = "1";
    process.env.MONGODB_URI_TEST =
      "mongodb+srv://user:secret@cluster.example.mongodb.net/abuts_fit_test";

    expect(resolveMongoUri()).toBe(CLOUD_SANDBOX_URI);
    expect(resolveMongoSourceLabel()).toBe("SANDBOX DB");
    expect(CLOUD_SANDBOX_URI.endsWith(`/${CLOUD_SANDBOX_DB}`)).toBe(true);
  });

  test("프로덕션에서는 샌드박스 플래그를 거부한다", () => {
    process.env.NODE_ENV = "production";
    process.env.ABUTS_CLOUD_SANDBOX = "true";
    expect(() => resolveMongoUri()).toThrow(/production/i);
  });

  test("해제는 로컬 샌드박스 이름만 허용한다", () => {
    expect(() =>
      assertSandboxDropAllowed({
        host: "127.0.0.1",
        dbName: CLOUD_SANDBOX_DB,
      }),
    ).not.toThrow();
    expect(() =>
      assertSandboxDropAllowed({
        host: "cluster.example.mongodb.net",
        dbName: "abuts_fit_test",
      }),
    ).toThrow(/Refusing to drop/);
    expect(() =>
      assertSandboxDropAllowed({
        host: "127.0.0.1",
        dbName: "abuts_fit_test",
      }),
    ).toThrow(/Refusing to drop/);
  });
});
