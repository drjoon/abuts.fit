import assert from "node:assert/strict";

import {
  CUSTOM_ABUTMENT_DESIGN_VERSION,
  CUSTOM_ABUTMENT_FIT_VERSION,
  preferFresherCustomAbutmentDesign,
  readCustomAbutmentDesign,
  rememberCustomAbutmentDesign,
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
assert.equal(chosen, local);
assert.equal(chosen?.teeth[0]?.metrics.maxDiameterMm, 10.22);

const serverMesh = design(2, 9.1, true);
assert.equal(
  preferFresherCustomAbutmentDesign(local, serverMesh, { preferServerOnTie: true }),
  serverMesh,
);

const tieLocal = design(5, 10.22, true);
const tieServer = design(5, 8.96, false);
assert.equal(
  preferFresherCustomAbutmentDesign(tieLocal, tieServer, { preferServerOnTie: true }),
  tieLocal,
);

rememberCustomAbutmentDesign(design(9, 10.22, true, "mem-key"));
rememberCustomAbutmentDesign(design(8, 8.96, true, "mem-key"));
const mem = await readCustomAbutmentDesign("mem-key");
assert.equal(mem?.savedAt, 9);
assert.equal(mem?.teeth[0]?.metrics.maxDiameterMm, 10.22);
assert.equal(mem?.designFresh, true);

console.log("custom abutment reopen prefer ok");
