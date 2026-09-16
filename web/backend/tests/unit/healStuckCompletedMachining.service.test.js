import assert from "node:assert/strict";
import {
  buildStuckCompletedMachiningFilter,
  isRequestMachiningWorkCompleted,
} from "../../services/healStuckCompletedMachining.service.js";

function testIsCompleted() {
  assert.equal(isRequestMachiningWorkCompleted(null), false);
  assert.equal(isRequestMachiningWorkCompleted({}), false);
  assert.equal(
    isRequestMachiningWorkCompleted({
      productionSchedule: { actualMachiningComplete: new Date() },
    }),
    true,
  );
  assert.equal(
    isRequestMachiningWorkCompleted({
      productionSchedule: { machiningProgress: { phase: "COMPLETED" } },
    }),
    true,
  );
  assert.equal(
    isRequestMachiningWorkCompleted({
      productionSchedule: {
        machiningRecord: { status: "COMPLETED", completedAt: new Date() },
      },
    }),
    true,
  );
  assert.equal(
    isRequestMachiningWorkCompleted({
      productionSchedule: { machiningProgress: { phase: "RUNNING" } },
    }),
    false,
  );
}

function testFilter() {
  const f = buildStuckCompletedMachiningFilter();
  assert.equal(f.manufacturerStage, "가공");
  assert.ok(Array.isArray(f.$or));
  assert.ok(f.$or.length >= 2);
}

testIsCompleted();
testFilter();
console.log("healStuckCompletedMachining.service.test.js ok");
