import assert from "node:assert/strict";
import {
  isDummySampleRequest,
  releaseDummySampleAfterMachining,
} from "../../controllers/cnc/dummyProduct.js";

function fakeRequest(initial) {
  const state = structuredClone(initial);
  return {
    get source() {
      return state.source;
    },
    get requestCategory() {
      return state.requestCategory;
    },
    get manufacturerStage() {
      return state.manufacturerStage;
    },
    set manufacturerStage(value) {
      state.manufacturerStage = value;
    },
    get assignedMachine() {
      return state.assignedMachine;
    },
    get productionSchedule() {
      return state.productionSchedule;
    },
    depopulate() {},
    set(path, value) {
      const parts = String(path).split(".");
      let cursor = state;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
        cursor = cursor[key];
      }
      cursor[parts[parts.length - 1]] = value;
    },
    snapshot() {
      return state;
    },
  };
}

describe("dummy sample release after machining", () => {
  test("일반 의뢰는 그대로 둔다", () => {
    const doc = fakeRequest({
      source: "order",
      manufacturerStage: "가공",
      assignedMachine: "M4",
      productionSchedule: {
        assignedMachine: "M4",
        dummyNextUpPinnedAt: new Date("2026-10-13T07:00:00.000Z"),
      },
    });
    assert.equal(isDummySampleRequest(doc), false);
    assert.equal(releaseDummySampleAfterMachining(doc), null);
    assert.equal(doc.snapshot().manufacturerStage, "가공");
    assert.equal(doc.snapshot().assignedMachine, "M4");
  });

  test("더미는 세척.패킹으로 두지 않고 대기열에서 빼며 시간은 남긴다", () => {
    const doc = fakeRequest({
      source: "dummy_sample",
      requestCategory: "dummy_sample",
      manufacturerStage: "세척.패킹",
      assignedMachine: "M4",
      productionSchedule: {
        assignedMachine: "M4",
        dummyNextUpPinnedAt: new Date("2026-10-13T07:00:00.000Z"),
        dummySampleSourceRequestId: "RQ-ORIGIN",
        actualMachiningComplete: new Date("2026-10-13T07:05:00.000Z"),
        machiningProgress: { phase: "COMPLETED", elapsedSeconds: 300 },
        machiningRecord: { durationSeconds: 300, status: "COMPLETED" },
      },
    });

    assert.equal(releaseDummySampleAfterMachining(doc), "M4");
    const next = doc.snapshot();
    assert.equal(next.source, "dummy_sample");
    assert.equal(next.manufacturerStage, "가공");
    assert.equal(next.assignedMachine, null);
    assert.equal(next.productionSchedule.assignedMachine, null);
    assert.equal(next.productionSchedule.dummyNextUpPinnedAt, null);
    assert.equal(next.productionSchedule.actualMachiningComplete, null);
    assert.equal(next.productionSchedule.machiningRecord, null);
    assert.equal(next.productionSchedule.dummySampleSourceRequestId, "RQ-ORIGIN");
    assert.equal(next.productionSchedule.machiningProgress.elapsedSeconds, 300);
    assert.equal(next.productionSchedule.machiningProgress.phase, undefined);
  });
});
