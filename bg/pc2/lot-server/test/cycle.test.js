// change-log:
// - 2026-11-28: 패킹 한 바퀴 상태 기계·기록 시험.
// related files:
// - bg/pc2/lot-server/src/cycle.js

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { CYCLE, createCycleTracker, cyclePrompt, summarizeCycles } from "../src/cycle.js";

test("인식→출력→제거가 한 바퀴로 이어지고 다음 대기 안내를 한다", () => {
  const file = path.join(os.tmpdir(), `cycle-${Date.now()}.jsonl`);
  const t = createCycleTracker({ logFile: file, write: true });
  t.watchPhase("idle");
  assert.equal(t.snapshot().stage, CYCLE.WAITING);
  assert.match(cyclePrompt(t.snapshot()).message, /거세요/);
  t.watchPhase("moving");
  t.watchPhase("ocr");
  assert.equal(t.snapshot().stage, CYCLE.RECOGNIZING);
  t.recognized("BDZ", { ms: 3500 });
  assert.equal(t.snapshot().title, "BDZ");
  assert.equal(t.snapshot().tone, "ok");
  t.matched("BDZ");
  t.printed("BDZ");
  assert.match(t.snapshot().message, /제거하고/);
  t.watchPhase("moving");
  const snap = t.snapshot();
  assert.equal(snap.stage, CYCLE.MOVING);
  assert.equal(snap.code, "");
  const sum = summarizeCycles({ file, since: "2000-01-01T00:00:00.000Z" });
  assert.equal(sum.recognized, 1);
  assert.equal(sum.printed, 1);
  assert.equal(sum.counts.removed, 1);
  assert.ok(fs.existsSync(file));
});

test("목록 밖 거절은 빨간 안내, 2위로 바꾸지 않는다", () => {
  const t = createCycleTracker({ write: false });
  t.rejected("BDZ", { reason: "not_in_queue" });
  const p = t.snapshot();
  assert.equal(p.stage, CYCLE.REJECTED);
  assert.equal(p.tone, "bad");
  assert.equal(p.title, "BDZ");
  assert.match(p.message, /대기 목록/);
});
