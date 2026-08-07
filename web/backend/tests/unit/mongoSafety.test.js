// related files:
// - web/backend/tests/mongoSafety.js
import {
  assertLocalJestMongoUri,
  isLocalMongoUri,
  redactMongoUri,
  resolveJestMongoUri,
} from "../mongoSafety.js";

describe("mongoSafety (Jest wipe guard)", () => {
  test("localhost / 127.0.0.1 URIs are local", () => {
    expect(isLocalMongoUri("mongodb://127.0.0.1:27017/abutsFitTest")).toBe(true);
    expect(isLocalMongoUri("mongodb://localhost:27017/abutsFitTest")).toBe(true);
    expect(
      isLocalMongoUri("mongodb://user:pass@127.0.0.1:27017/abutsFitTest"),
    ).toBe(true);
  });

  test("Atlas / srv URIs are not local", () => {
    expect(
      isLocalMongoUri(
        "mongodb+srv://user:pass@cluster0.example.mongodb.net/abuts_fit_test",
      ),
    ).toBe(false);
    expect(
      isLocalMongoUri(
        "mongodb://user:pass@cluster0.example.mongodb.net:27017/abuts_fit_test",
      ),
    ).toBe(false);
  });

  test("assertLocalJestMongoUri throws on Atlas", () => {
    expect(() =>
      assertLocalJestMongoUri(
        "mongodb+srv://u:p@cluster0.jihfv0j.mongodb.net/abuts_fit_test",
      ),
    ).toThrow(/non-local MongoDB/i);
  });

  test("redactMongoUri hides credentials", () => {
    expect(
      redactMongoUri("mongodb+srv://user:secret@host/db"),
    ).toBe("mongodb+srv://***@host/db");
  });

  test("resolveJestMongoUri defaults to local abutsFitTest", () => {
    const prev = process.env.MONGODB_URI_TEST;
    delete process.env.MONGODB_URI_TEST;
    delete process.env.MONGO_URI_TEST;
    try {
      expect(resolveJestMongoUri()).toBe(
        "mongodb://127.0.0.1:27017/abutsFitTest",
      );
    } finally {
      if (prev === undefined) delete process.env.MONGODB_URI_TEST;
      else process.env.MONGODB_URI_TEST = prev;
    }
  });
});
