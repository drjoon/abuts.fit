import assert from "node:assert/strict";

import {
  CUSTOM_ABUTMENT_DESIGN_VERSION,
  CUSTOM_ABUTMENT_FIT_VERSION,
  preferFresherCustomAbutmentDesign,
  readCustomAbutmentDesign,
  rememberCustomAbutmentDesign,
  customAbutmentSessionCacheKey,
  normalizeJawPose,
  resolveCustomAbutmentReopen,
  type CachedCustomAbutmentDesign,
  type CachedCustomAbutmentTooth,
} from "./customAbutmentDesignCache";

function tooth(diameter: number, withMesh: boolean): CachedCustomAbutmentTooth {
  return {
    toothNumber: "16",
    fileName: "16.stl",
    fixture: {} as CachedCustomAbutmentTooth["fixture"],
    overrides: {},
    params: {} as CachedCustomAbutmentTooth["params"],
    metrics: { maxDiameterMm: diameter } as CachedCustomAbutmentTooth["metrics"],
    localPositions: new ArrayBuffer(withMesh ? 36 : 0),
    crownLocalPositions: new ArrayBuffer(0),
    marginLoopLocal: new ArrayBuffer(0),
    ...(withMesh ? {} : { regenFromMeta: true }),
  };
}

function design(
  savedAt: number,
  diameter: number,
  withMesh: boolean,
  key = "case",
): CachedCustomAbutmentDesign {
  return {
    key,
    version: CUSTOM_ABUTMENT_DESIGN_VERSION,
    fitVersion: CUSTOM_ABUTMENT_FIT_VERSION,
    savedAt,
    alignedScans: [],
    teeth: [tooth(diameter, withMesh)],
    chat: [],
  };
}

const local = design(1, 10.22, true);
const serverMeta = design(2, 8.96, false);
const chosen = preferFresherCustomAbutmentDesign(local, serverMeta, { preferServerOnTie: true });
assert.equal(chosen?.savedAt, 2);
assert.equal(chosen?.teeth[0]?.metrics.maxDiameterMm, 8.96);
assert.equal(chosen?.teeth[0]?.localPositions.byteLength, 36);

const serverMesh = design(2, 9.1, true);
assert.equal(
  preferFresherCustomAbutmentDesign(local, serverMesh, { preferServerOnTie: true }),
  serverMesh,
);

const tieLocal = design(5, 10.22, true);
const tieServer = design(5, 8.96, false);
const tieChosen = preferFresherCustomAbutmentDesign(tieLocal, tieServer, {
  preferServerOnTie: true,
});
assert.equal(tieChosen?.savedAt, 5);
assert.equal(tieChosen?.teeth[0]?.metrics.maxDiameterMm, 8.96);
assert.equal(tieChosen?.teeth[0]?.localPositions.byteLength, 36);

const newerLocal = design(3, 10.22, true);
const olderServer = design(1, 8.96, false);
assert.equal(
  preferFresherCustomAbutmentDesign(newerLocal, olderServer, { preferServerOnTie: true }),
  newerLocal,
);

rememberCustomAbutmentDesign(design(9, 10.22, true, "mem-key"));
rememberCustomAbutmentDesign(design(8, 8.96, true, "mem-key"));
const mem = await readCustomAbutmentDesign("mem-key");
assert.equal(mem?.savedAt, 9);
assert.equal(mem?.teeth[0]?.metrics.maxDiameterMm, 10.22);
assert.equal(mem?.designFresh, true);

const reopenBase = {
  alignedMatched: false,
  hasWorkScans: true,
  jawsAgree: false,
  rebuildFromMeta: true,
  designFresh: true,
  isLabViewer: false,
  biteCheck: null,
  savedAt: 20,
};
const reopened = resolveCustomAbutmentReopen(reopenBase);
assert.equal(reopened.restored, true);
assert.equal(reopened.meshRestore, false);
assert.equal(reopened.biteCheck.qualityOk, true);
assert.equal(reopened.biteCheck.checkedAt, 20);

const mesh = resolveCustomAbutmentReopen({
  ...reopenBase,
  hasWorkScans: false,
  jawsAgree: true,
  rebuildFromMeta: false,
});
assert.equal(mesh.restored, false);
assert.equal(mesh.meshRestore, true);

const keptBite = resolveCustomAbutmentReopen({
  ...reopenBase,
  alignedMatched: true,
  biteCheck: { checkedAt: 9, qualityOk: false, moved: true, source: "manual" },
});
assert.equal(keptBite.restored, true);
assert.equal(keptBite.biteCheck.qualityOk, false);
assert.equal(keptBite.biteCheck.checkedAt, 9);

assert.equal(customAbutmentSessionCacheKey("PTX-1", "scan-a"), customAbutmentSessionCacheKey("PTX-1", "scan-b"));
assert.notEqual(customAbutmentSessionCacheKey("", "scan-a"), customAbutmentSessionCacheKey("", "scan-b"));
const pose = normalizeJawPose({
  upper: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 3, 1],
  lower: [],
});
assert.equal(pose?.upper?.[14], 3);
assert.equal(pose?.lower, undefined);
assert.equal(normalizeJawPose({ upper: [1] }), null);

console.log("custom abutment reopen prefer ok");
