import assert from "node:assert/strict";
import {
  assertDummyRegenPossible,
  resolveDummyRegenChoice,
} from "../../controllers/cnc/dummyArtifactRegen.js";

describe("dummy artifact regen choice", () => {
  test("아무것도 고르지 않으면 재생성하지 않는다", () => {
    assert.deepEqual(resolveDummyRegenChoice({}), {
      filledStl: false,
      cam: false,
    });
  });

  test("CAM만 고르면 CAM만 한다", () => {
    assert.deepEqual(resolveDummyRegenChoice({ regenerateCam: true }), {
      filledStl: false,
      cam: true,
    });
  });

  test("filled STL을 고르면 CAM도 켠다", () => {
    assert.deepEqual(
      resolveDummyRegenChoice({ regenerateFilledStl: true, regenerateCam: false }),
      { filledStl: true, cam: true },
    );
  });

  test("원본 STL이 없으면 filled STL 재생성을 거절한다", () => {
    assert.throws(
      () =>
        assertDummyRegenPossible(
          { caseInfos: {} },
          { filledStl: true, cam: true },
        ),
      /원본 STL/,
    );
  });

  test("filled STL이 없으면 CAM만 재생성을 거절한다", () => {
    assert.throws(
      () =>
        assertDummyRegenPossible(
          { caseInfos: { file: { s3Key: "requests/a/1-stl/a.stl" } } },
          { filledStl: false, cam: true },
        ),
      /filled STL/,
    );
  });

  test("원본과 filled STL이 있으면 통과한다", () => {
    assert.doesNotThrow(() =>
      assertDummyRegenPossible(
        {
          caseInfos: {
            file: { s3Key: "requests/a/1-stl/a.stl", filePath: "a.stl" },
            stlFile: { s3Key: "requests/a/2-filled/a.filled.stl", filePath: "a.filled.stl" },
          },
        },
        { filledStl: true, cam: true },
      ),
    );
  });
});
