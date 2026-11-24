import assert from "node:assert/strict";
import test from "node:test";
import { zipStoreBlobs } from "./zipStoreBlobs";

test("zipStoreBlobs는 로컬 헤더·중앙 디렉터리 시그니처를 넣는다", async () => {
  const blob = await zipStoreBlobs([
    { name: "a.ply", blob: new Blob([new Uint8Array([1, 2, 3])]) },
    { name: "b.ply", blob: new Blob([new Uint8Array([4, 5])]) },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);
  // EOCD
  const eocd = bytes.subarray(bytes.length - 22);
  assert.equal(eocd[0], 0x50);
  assert.equal(eocd[1], 0x4b);
  assert.equal(eocd[2], 0x05);
  assert.equal(eocd[3], 0x06);
  assert.equal(eocd[8], 2); // entries
  assert.equal(eocd[10], 2);
});
