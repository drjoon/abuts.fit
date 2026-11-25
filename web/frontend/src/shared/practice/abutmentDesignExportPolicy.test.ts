import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterExportableAbutmentDesignFiles,
  isPlatformAbutmentDesignExportBlocked,
} from "./abutmentDesignExportPolicy";

describe("abutmentDesignExportPolicy", () => {
  it("플랫폼 생산·프리뷰 키만 막는다", () => {
    assert.equal(
      isPlatformAbutmentDesignExportBlocked(
        "requests/R1/1-stl/platform/abc123.stl",
      ),
      true,
    );
    assert.equal(
      isPlatformAbutmentDesignExportBlocked(
        "practice-transfers/t1/custom-abutment-preview/16-abutment.stl",
      ),
      true,
    );
    assert.equal(
      isPlatformAbutmentDesignExportBlocked("requests/R1/1-stl/lab-upload.stl"),
      false,
    );
    assert.equal(
      isPlatformAbutmentDesignExportBlocked(
        "practice-transfers/t1/design/16.stl",
      ),
      false,
    );
  });

  it("기공소 업로드만 남긴다", () => {
    const files = [
      { s3Key: "requests/R1/1-stl/platform/a.stl", name: "platform" },
      { s3Key: "requests/R1/1-stl/mine.stl", name: "lab" },
    ];
    assert.deepEqual(filterExportableAbutmentDesignFiles(files), [
      { s3Key: "requests/R1/1-stl/mine.stl", name: "lab" },
    ]);
  });
});
