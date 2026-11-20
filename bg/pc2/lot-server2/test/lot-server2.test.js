import assert from "node:assert/strict";
import test from "node:test";
import { chooseDevice, parseVideoDevices } from "../src/devices.js";
import { parseFocusStdout, focusConfirmed } from "../src/focus.js";
import { captureFileName, CAPTURE_NAME } from "../src/names.js";
import { scoreGray, selectBest } from "../src/sharpness.js";
import { successMessage } from "../src/capture.js";

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

test("avfoundation 목록은 화면 캡처보다 카메라를 고른다", () => {
  const text = `
AVFoundation video devices:
[0] Capture screen 0
[1] FaceTime HD Camera
AVFoundation audio devices:
[0] Mic
`;
  const devices = parseVideoDevices(text, "darwin");
  assert.equal(chooseDevice(devices, "").name, "FaceTime HD Camera");
  assert.equal(chooseDevice(devices, "FaceTime").input, "1");
  assert.equal(chooseDevice(devices, "없는카메라"), null);
});

test("초점 응답은 마지막 JSON만 읽는다", () => {
  const parsed = parseFocusStdout('log\n{"ok":true,"af":"done","devMode":12}\n');
  assert.equal(focusConfirmed(parsed), true);
  assert.equal(focusConfirmed({ ok: true, af: "timeout" }), false);
  assert.equal(focusConfirmed({ ok: false, af: "none" }), false);
});

test("파일명은 KST와 초점 표시를 담는다", () => {
  const name = captureFileName(new Date("2026-11-20T16:00:00.007Z"), true);
  assert.equal(name, "capture-20261121-010000-007-af.jpg");
  assert.equal(CAPTURE_NAME.test(name), true);
  assert.equal(
    CAPTURE_NAME.test(captureFileName(new Date("2026-11-20T16:00:00.007Z"), false)),
    true,
  );
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
});

test("저장 문구는 초점 결과에 따라 갈린다", () => {
  assert.match(successMessage("focus", { af: "done" }), /포커스/);
  assert.match(successMessage("capture", { af: "timeout" }), /초점 확인/);
  assert.match(successMessage("capture", { af: "none" }), /영상만/);
});
