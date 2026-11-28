import fs from "fs";
import { activeProfile } from "../src/jig-profiles.js";
import { recognizeEngraving } from "../src/engrave/recognize.js";
import { loadModel } from "../src/engrave/model-store.js";

const file = process.argv[2];
const buf = fs.readFileSync(file);
const profile = activeProfile();
const model = loadModel()?.model;
const allowed = new Set(["BZE"]);
const hint = { rot: 90 };
async function once(label, opts) {
  const t0 = Date.now();
  const r = await recognizeEngraving(buf, { profile, allowed, model, ...opts });
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ label, ms, top: r.top, reason: r.reason, rot: r.rotation, conf: r.confidence, margin: r.margin, minP: r.minP, early: !!r.early }));
  return ms;
}
console.log("bytes", buf.length, "rots", profile.rotations);
const times = {};
times.full = await once("full-no-hint", { hint: null });
times.hint90 = await once("hint-90", { hint });
times.hint90b = await once("hint-90-again", { hint });
times.hint90lh = await once("hint-90-letterH", { hint: { rot: 90, letterH: 0.12 } });
console.log("summary_ms", times);
