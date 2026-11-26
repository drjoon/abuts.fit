// change-log:
// - 2026-11-26: 완전한 JPEG 판별·Otsu·글자 영역·투표·합성 이미지 OCR(학습 데이터 캐시가 있을 때만).
// related files:
// - bg/pc2/lot-server2/src/camera.js
// - bg/pc2/lot-server2/src/ocr/locate.js
// - bg/pc2/lot-server2/src/ocr/index.js

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { isCompleteJpeg } from "../src/camera.js";
import { locateTextBoxes, otsuThreshold } from "../src/ocr/locate.js";
import { pickBestRead } from "../src/ocr/index.js";
import { OCR_CACHE_DIR } from "../src/ocr/engine.js";

async function lotImage(text, { x = 430, y = 320, size = 90, fg = "#333", bg = "#aaa", blur = 1 } = {}) {
  const svg = `<svg width="1024" height="576" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${bg}"/><text x="${x}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}" fill="${fg}">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).blur(blur).jpeg({ quality: 75 }).toBuffer();
}

test("덮어쓰기 중 잘린 JPEG는 버린다", async () => {
  const jpg = await lotImage("ABC");
  assert.equal(isCompleteJpeg(jpg), true);
  assert.equal(isCompleteJpeg(jpg.subarray(0, Math.floor(jpg.length / 2))), false);
  assert.equal(isCompleteJpeg(Buffer.alloc(0)), false);
  assert.equal(isCompleteJpeg(Buffer.concat([jpg, Buffer.alloc(8)])), true);
});

test("Otsu는 두 봉우리 사이를 고른다", () => {
  const gray = Buffer.alloc(200);
  gray.fill(30, 0, 100);
  gray.fill(220, 100);
  const t = otsuThreshold(gray);
  assert.ok(t >= 30 && t < 220);
});

test("글자 영역을 찾고 흐린 빈 화면에선 찾지 않는다", async () => {
  const boxes = await locateTextBoxes(await lotImage("BDF", { x: 120, y: 480 }));
  assert.ok(boxes.length >= 1);
  const b = boxes[0];
  assert.ok(b.left < 200 && b.left + b.width > 260, JSON.stringify(b));
  assert.ok(b.top < 420 && b.top + b.height > 470, JSON.stringify(b));
  const blank = await sharp({
    create: { width: 640, height: 360, channels: 3, background: { r: 150, g: 150, b: 150 } },
  })
    .jpeg()
    .toBuffer();
  assert.equal((await locateTextBoxes(blank)).length, 0);
});

test("판독 투표는 최소 신뢰도 미만·예약어를 버린다", () => {
  assert.equal(pickBestRead([{ lot: "HIT", confidence: 40 }], 50), null);
  assert.equal(pickBestRead([{ lot: "CAP", confidence: 95 }], 50), null);
  const best = pickBestRead(
    [
      { lot: "HIT", confidence: 71 },
      { lot: "HJT", confidence: 60 },
      { lot: "HJT", confidence: 66 },
    ],
    50,
  );
  assert.equal(best.lot, "HJT");
  assert.equal(best.confidence, 66);
});

const hasTrainedData =
  fs.existsSync(path.join(OCR_CACHE_DIR, "eng.traineddata")) || Boolean(process.env.LOT_OCR_LANG_PATH);

test("합성 각인 이미지에서 3글자를 읽는다", { skip: !hasTrainedData && "ocr-cache/eng.traineddata 없음" }, async () => {
  const { recognizeLot, disposeOcrWorker } = await import("../src/ocr/index.js");
  try {
    for (const [text, opts] of [
      ["KXR", {}],
      ["WYE", { x: 100, y: 500, size: 70 }],
      ["ACZ", { fg: "#eee", bg: "#666" }],
    ]) {
      const result = await recognizeLot(await lotImage(text, opts));
      assert.equal(result.lot, text, JSON.stringify(result));
    }
    const blank = await sharp({
      create: { width: 640, height: 360, channels: 3, background: { r: 170, g: 170, b: 170 } },
    })
      .blur(8)
      .jpeg()
      .toBuffer();
    assert.equal((await recognizeLot(blank)).success, false);
  } finally {
    await disposeOcrWorker();
  }
});
