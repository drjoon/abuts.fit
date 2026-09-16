import assert from "node:assert/strict";
import {
  buildStuckCompletedMachiningFilter,
  isRequestMachiningWorkCompleted,
  isRequestUnmachinableJudged,
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

function testUnmachinable() {
  assert.equal(isRequestUnmachinableJudged({}), false);
  assert.equal(
    isRequestUnmachinableJudged({ rnd: { unmachinableAt: new Date() } }),
    true,
  );
}

function testFilter() {
  const f = buildStuckCompletedMachiningFilter();
  assert.equal(f.manufacturerStage, "가공");
  assert.equal(f["rnd.unmachinableAt"], null);
  assert.ok(Array.isArray(f.$or));
  assert.ok(f.$or.length >= 2);
}

testIsCompleted();
testUnmachinable();
testFilter();
console.log("healStuckCompletedMachining.service.test.js ok");
