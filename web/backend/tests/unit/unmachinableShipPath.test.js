import assert from "node:assert/strict";
import test from "node:test";

import {
  keepsUnmachinableOnShipPath,
  normalizeUnmachinableLabPhotos,
} from "../../services/unmachinableShipPath.js";

test("세척.패킹 이후만 출고 경로로 본다", () => {
  assert.equal(keepsUnmachinableOnShipPath("세척.패킹"), true);
  assert.equal(keepsUnmachinableOnShipPath("포장.발송"), true);
  assert.equal(keepsUnmachinableOnShipPath("추적관리"), true);
  assert.equal(keepsUnmachinableOnShipPath("가공"), false);
  assert.equal(keepsUnmachinableOnShipPath("준비"), false);
  assert.equal(keepsUnmachinableOnShipPath(""), false);
});

test("전달 사진은 s3 키가 있는 항목만 남긴다", () => {
  const photos = normalizeUnmachinableLabPhotos([
    { kind: "photo", fileName: "a.jpg", s3Key: "k1", s3Url: "https://example/a" },
    { kind: "painted", fileName: "", s3Key: "k2", s3Url: "https://example/b" },
    { kind: "nope", fileName: "c.png", s3Key: "k3", location: "https://example/c" },
  ]);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].kind, "photo");
  assert.equal(photos[1].kind, "photo");
  assert.equal(photos[1].s3Url, "https://example/c");
});
