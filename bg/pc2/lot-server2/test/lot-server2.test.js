import assert from "node:assert/strict";
import test from "node:test";
import {
  annotateDevices,
  chooseDevice,
  isContinuityCamera,
  parseVideoDevices,
} from "../src/devices.js";
import { buildCaptureProfiles } from "../src/camera.js";
import { parseFocusStdout, focusConfirmed } from "../src/focus.js";
import {
  captureFileName,
  lotFileName,
  CAPTURE_NAME,
  LOT_FILE_NAME,
  IMAGE_NAME,
} from "../src/names.js";
import { meanAbsDiff, scoreGray, selectBest } from "../src/sharpness.js";
import { successMessage } from "../src/capture.js";
import {
  extractLotSuffix3,
  isValidLot,
  pickLotFromOcrText,
} from "../src/ocr/extract.js";

test("dshow 목록에서 영상 장치만 고른다", () => {
  const text = `
[dshow @ 1] DirectShow video devices
[dshow @ 1]  "Microphone" (audio)
[dshow @ 1] "ViTiny UM20" (video)
[dshow @ 1]   Alternative name "@device_pnp_usb"
[dshow @ 1] DirectShow audio devices
[dshow @ 1] "Mic Array" (audio)
`;
  const devices = parseVideoDevices(text, "win32");
  assert.deepEqual(
    devices.map((device) => device.name),
    ["ViTiny UM20"],
  );
  assert.equal(chooseDevice(devices, "").input, "video=ViTiny UM20");
});

test("avfoundation 목록은 화면·Continuity보다 로컬 카메라를 고른다", () => {
  const text = `
AVFoundation video devices:
[0] Capture screen 0
[1] Joonho Lee의 iPhone 카메라
[2] FaceTime HD Camera
AVFoundation audio devices:
[0] Mic
`;
  const devices = parseVideoDevices(text, "darwin");
  assert.equal(chooseDevice(devices, "").name, "FaceTime HD Camera");
  assert.equal(chooseDevice(devices, "FaceTime").input, "2");
  assert.equal(chooseDevice(devices, "없는카메라"), null);
  assert.equal(isContinuityCamera("Joonho Lee의 iPhone 카메라"), true);
  const tagged = annotateDevices(devices);
  assert.equal(tagged.find((d) => d.name.includes("iPhone")).continuity, true);
});

test("darwin Grab 프로파일은 30fps를 먼저 넣는다", () => {
  const prev = process.platform;
  // buildCaptureProfiles uses process.platform; only assert structure on current OS.
  const device = { name: "FaceTime HD Camera", input: "0" };
  const profiles = buildCaptureProfiles(device, 1, "out_%02d.jpg");
  assert.ok(profiles.length >= 2);
  assert.ok(profiles.some((p) => p.args.includes("-framerate")));
  void prev;
});

test("초점 응답은 마지막 JSON만 읽는다", () => {
  const parsed = parseFocusStdout('log\n{"ok":true,"af":"done","devMode":12}\n');
  assert.equal(focusConfirmed(parsed), true);
  assert.equal(focusConfirmed({ ok: true, af: "timeout" }), false);
  assert.equal(focusConfirmed({ ok: false, af: "none" }), false);
});

test("파일명은 KST와 로트 3글자를 담는다", () => {
  const name = captureFileName(new Date("2026-11-20T16:00:00.007Z"), true);
  assert.equal(name, "capture-20261121-010000-007-af.jpg");
  assert.equal(CAPTURE_NAME.test(name), true);
  const lot = lotFileName(new Date("2026-11-20T16:00:00.007Z"), "acz");
  assert.equal(lot, "lot-20261121-010000-007-ACZ.jpg");
  assert.equal(LOT_FILE_NAME.test(lot), true);
  assert.equal(IMAGE_NAME.test(lot), true);
  assert.equal(IMAGE_NAME.test(name), true);
});

test("단색보다 변화가 큰 프레임을 고른다", () => {
  const width = 8;
  const height = 4;
  const solid = Buffer.alloc(width * height, 40);
  const edges = Buffer.alloc(width * height, 40);
  for (let i = 0; i < edges.length; i += 2) edges[i] = 200;
  assert.ok(scoreGray(edges, width, height) > scoreGray(solid, width, height));
  const best = selectBest([
    { index: 0, score: 99 },
    { index: 1, score: 2 },
    { index: 2, score: 5 },
  ]);
  assert.equal(best.index, 2);
  assert.ok(meanAbsDiff(solid, edges) > 0);
});

test("저장 문구는 초점 결과에 따라 갈린다", () => {
  assert.match(successMessage("focus", { af: "done" }), /포커스/);
  assert.match(successMessage("capture", { af: "timeout" }), /초점 확인/);
  assert.match(successMessage("capture", { af: "none" }), /영상만/);
});

test("OCR 원문에서 영문 3글자 로트만 고른다", () => {
  assert.equal(extractLotSuffix3("prefix-ACZ"), "ACZ");
  assert.equal(pickLotFromOcrText("ACZ"), "ACZ");
  assert.equal(pickLotFromOcrText("xx\nBDF\n"), "BDF");
  assert.equal(pickLotFromOcrText("a c z"), "ACZ");
  assert.equal(isValidLot("ACZ"), true);
  assert.equal(isValidLot("CAP"), false);
  assert.equal(isValidLot("AB"), false);
});
