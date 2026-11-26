// change-log:
// - 2026-11-26: UM20 실측 프레임(AF 전 흐림 / AF 후 "BDZ")으로 선명도·글자 단위 OCR, 시리얼 스크립트 점검.
// related files:
// - bg/pc2/lot-server2/src/sharpness.js
// - bg/pc2/lot-server2/src/ocr/chars.js
// - bg/pc2/lot-server2/src/um-serial.ps1

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { analyzeImage } from "../src/capture.js";
import { tileFocusScore } from "../src/sharpness.js";
import { voteChars, segmentChars } from "../src/ocr/chars.js";
import { pickCharCandidate } from "../src/ocr/index.js";
import { OCR_CACHE_DIR } from "../src/ocr/engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FOCUSED = path.join(here, "fixtures", "um20-bdz-focused.jpg");
const BLURRY = path.join(here, "fixtures", "um20-blurry.jpg");

test("타일 선명도는 AF 전후를 크게 가른다(임계 6)", async () => {
  const blurry = await analyzeImage(BLURRY);
  const focused = await analyzeImage(FOCUSED);
  assert.ok(blurry.score < 6, `blurry=${blurry.score}`);
  assert.ok(focused.score > 6, `focused=${focused.score}`);
  assert.ok(focused.score > blurry.score * 3);
  assert.equal(tileFocusScore(Buffer.alloc(64 * 64, 120), 64, 64), 0);
});

test("글자 칸 나누기와 자리별 투표", () => {
  const w = 30;
  const h = 10;
  const bin = Buffer.alloc(w * h, 255);
  for (const x0 of [2, 12, 22]) for (let y = 1; y < 9; y += 1) for (let x = x0; x < x0 + 5; x += 1) bin[y * w + x] = 0;
  assert.equal(segmentChars(bin, w, h).length, 3);
  const r = (s, c) => s.split("").map((letter) => ({ letter, confidence: c }));
  const vote = voteChars([r("BDZ", 70), r("8DZ".replace("8", "B"), 60), [{ letter: "", confidence: 0 }, ...r("DZ", 80)], null]);
  assert.equal(vote.lot, "BDZ");
  assert.equal(vote.runs, 3);
  assert.equal(vote.agree, 2);
});

test("뒤집어도 글자처럼 읽히면(W/M) 확정하지 않는다", () => {
  const ok = pickCharCandidate([
    { lot: "BDZ", score: 1400, confidence: 70, angle: 90 },
    { lot: "ZGE", score: 500, confidence: 30, angle: 270 },
  ]);
  assert.equal(ok.lot, "BDZ");
  const amb = pickCharCandidate([
    { lot: "WYE", score: 1434, confidence: 64, angle: 0 },
    { lot: "EAM", score: 1525, confidence: 65, angle: 180 },
  ]);
  assert.equal(typeof amb, "symbol");
});

test("um-serial.ps1은 ASCII이고 UM Viewer 프로토콜 키를 쓴다", () => {
  const ps1 = fs.readFileSync(path.join(here, "../src/um-serial.ps1"), "utf8");
  assert.equal(/[^\x00-\x7f]/.test(ps1), false);
  for (const cmd of ['"W014F"', '"W0155"', '"W0156"', '"W0E"', "115200"]) assert.ok(ps1.includes(cmd), cmd);
});

const hasTrainedData =
  fs.existsSync(path.join(OCR_CACHE_DIR, "eng.traineddata")) || Boolean(process.env.LOT_OCR_LANG_PATH);

test("UM20 실측 각인 BDZ를 어느 방향이든 읽는다", { skip: !hasTrainedData && "ocr-cache/eng.traineddata 없음" }, async () => {
  const { recognizeLot, disposeOcrWorker } = await import("../src/ocr/index.js");
  try {
    for (const angle of [0, 90, 180, 270]) {
      const img = await sharp(FOCUSED).rotate(angle).jpeg({ quality: 92 }).toBuffer();
      const r = await recognizeLot(img);
      assert.equal(r.lot, "BDZ", `angle=${angle} ${JSON.stringify(r)}`);
    }
    assert.equal((await recognizeLot(BLURRY)).success, false);
  } finally {
    await disposeOcrWorker();
  }
});
