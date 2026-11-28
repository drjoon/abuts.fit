// change-log:
// - 2026-11-28: 내재화한 팩 출력 모듈 시험(dry-run, 실제 프린터 없음).
// related files:
// - bg/pc2/lot-server/src/pack/index.js

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { buildPackingLabelZpl, handlePackRequest, printRaw, resolvePackZplSize, safeText } from "../src/pack/index.js";

test("패킹 라벨 ZPL 폴백은 ^XA로 시작하고 로트 3글자를 담는다", () => {
  const zpl = buildPackingLabelZpl({ mailboxCode: "A1A1", lotNumber: "CA261126-BDZ", labName: "Lab", screwType: "Hex" });
  assert.match(zpl, /^\^XA/);
  assert.match(zpl, /BDZ/);
  assert.match(zpl, /A1A1/);
  const size = resolvePackZplSize({ paperProfile: "PACK_80x65", dpi: 600 });
  assert.equal(size.pw, Math.round((80 / 25.4) * 600));
  assert.equal(safeText("a^b~c", 8), "a b c");
});

test("dry-run 출력은 프린터를 건드리지 않고 파일을 남긴다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-dry-"));
  const prev = process.env.LOT_PRINT_DRY_RUN;
  const prevDir = process.env.LOT_PRINT_DRY_RUN_DIR;
  process.env.LOT_PRINT_DRY_RUN = "1";
  process.env.LOT_PRINT_DRY_RUN_DIR = dir;
  try {
    const r = await printRaw({ zpl: "^XA^FDtest^XZ", printer: "FakePrinter", title: "t" });
    assert.equal(r.success, true);
    assert.equal(r.dryRun, true);
    assert.ok(r.file && fs.existsSync(r.file));
    assert.match(fs.readFileSync(r.file, "utf8"), /\^XA/);
  } finally {
    if (prev === undefined) delete process.env.LOT_PRINT_DRY_RUN;
    else process.env.LOT_PRINT_DRY_RUN = prev;
    if (prevDir === undefined) delete process.env.LOT_PRINT_DRY_RUN_DIR;
    else process.env.LOT_PRINT_DRY_RUN_DIR = prevDir;
  }
});

test("내재화 경로 /api/printers 는 비밀 없이 JSON을 돌려준다", async () => {
  const { req, res, once } = mockHttp("GET", "/api/printers");
  const ok = await handlePackRequest(req, res, new URL("http://127.0.0.1/api/printers"));
  assert.equal(ok, true);
  const { status, body } = await once;
  assert.equal(status, 200);
  const j = JSON.parse(body);
  assert.equal(j.success, true);
  assert.ok(Array.isArray(j.printers));
  assert.equal(j.embed, true);
});

function mockHttp(method, url) {
  const { EventEmitter } = await_import();
  void EventEmitter;
  let status = 0;
  let body = "";
  let done;
  const once = new Promise((resolve) => {
    done = resolve;
  });
  const res = {
    writeHead(code) {
      status = code;
    },
    end(buf) {
      body = String(buf || "");
      done({ status, body });
    },
  };
  const req = {
    method,
    url,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    on(ev, fn) {
      if (ev === "end") queueMicrotask(fn);
      return req;
    },
  };
  return { req, res, once };
}

function await_import() {
  return { EventEmitter: null };
}
