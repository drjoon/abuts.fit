// related files:
// - web/backend/services/abutmentStl/execution.js
// - web/backend/services/abutmentStl/filledLambda.service.js
// - web/backend/services/abutmentStl/correctLambda.service.js
// - web/backend/services/abutmentStl/cuffBlend.service.js
import { afterEach, describe, expect, it } from "@jest/globals";
import { shouldUseStlLambda, stlExecutionMode } from "../../services/abutmentStl/execution.js";

const KEYS = ["ABUTMENT_STL_EXECUTION", "NODE_ENV"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("stlExecutionMode", () => {
  it("로컬·테스트는 워커, 프로덕션만 람다", () => {
    delete process.env.ABUTMENT_STL_EXECUTION;
    process.env.NODE_ENV = "development";
    expect(stlExecutionMode()).toBe("local");
    expect(shouldUseStlLambda("abuts-stl-filled")).toBe(false);
    process.env.NODE_ENV = "test";
    expect(stlExecutionMode()).toBe("local");
    process.env.NODE_ENV = "production";
    expect(stlExecutionMode()).toBe("lambda");
    expect(shouldUseStlLambda("abuts-stl-filled")).toBe(true);
  });

  it("람다 이름이 없으면 프로덕션에서도 워커", () => {
    delete process.env.ABUTMENT_STL_EXECUTION;
    process.env.NODE_ENV = "production";
    expect(shouldUseStlLambda("")).toBe(false);
    expect(shouldUseStlLambda(undefined)).toBe(false);
  });

  it("ABUTMENT_STL_EXECUTION으로 강제할 수 있다", () => {
    process.env.NODE_ENV = "production";
    process.env.ABUTMENT_STL_EXECUTION = "local";
    expect(shouldUseStlLambda("abuts-stl-filled")).toBe(false);
    process.env.NODE_ENV = "development";
    process.env.ABUTMENT_STL_EXECUTION = "lambda";
    expect(shouldUseStlLambda("abuts-stl-filled")).toBe(true);
  });
});
