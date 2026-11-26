// change-log:
// - 2026-11-26: 세척.패킹 작업 카드 필터(우편함 배정 건만) 테스트.
// related files:
// - bg/pc2/lot-server/src/packing-queue.js
import assert from "node:assert/strict";
import test from "node:test";
import {
  diameterBucketIndex,
  filterPackingQueueBody,
  queueFilterOptionsFromEnv,
} from "../src/packing-queue.js";

const body = {
  statusCode: 200,
  success: true,
  message: "Success",
  data: {
    total: 4,
    labels: ["6", "8", "10", "12"],
    counts: [1, 2, 0, 1],
    items: [
      { _id: "a", mailboxCode: "A1A1", maxDiameter: 7.8 },
      { _id: "b", mailboxCode: " A1A3 ", maxDiameter: 5.2 },
      { _id: "c", mailboxCode: "", maxDiameter: 7.1 },
      { _id: "d", maxDiameter: null },
    ],
  },
};

test("우편함이 배정된 건만 남기고 total·counts를 다시 센다", () => {
  const out = filterPackingQueueBody(body, { requireMailbox: true });
  assert.deepEqual(out.data.items.map((i) => i._id), ["a", "b"]);
  assert.equal(out.data.total, 2);
  assert.deepEqual(out.data.counts, [1, 1, 0, 0]);
  assert.equal(out.data.hidden, 2);
  assert.equal(out.success, true);
  assert.equal(body.data.items.length, 4, "원본은 바꾸지 않는다");
});

test("requireMailbox=false면 전부 남긴다", () => {
  const out = filterPackingQueueBody(body, { requireMailbox: false });
  assert.equal(out.data.total, 4);
  assert.deepEqual(out.data.counts, [1, 2, 0, 1]);
  assert.equal(out.data.hidden, 0);
});

test("오류 응답·모양이 다른 본문은 그대로 돌려준다", () => {
  const err = { success: false, message: "x" };
  assert.equal(filterPackingQueueBody(err), err);
  assert.equal(filterPackingQueueBody(null), null);
});

test("직경 구간은 백엔드와 같다", () => {
  assert.deepEqual([6, 6.01, 8, 10, 10.5, null, "abc"].map(diameterBucketIndex), [0, 1, 1, 2, 3, 3, 3]);
});

test("LOT_QUEUE_REQUIRE_MAILBOX 기본 1, 0이면 끔", () => {
  assert.equal(queueFilterOptionsFromEnv({}).requireMailbox, true);
  assert.equal(queueFilterOptionsFromEnv({ LOT_QUEUE_REQUIRE_MAILBOX: "0" }).requireMailbox, false);
});
