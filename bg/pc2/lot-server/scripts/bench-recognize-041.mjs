import fs from "fs";
import { activeProfile } from "../src/jig-profiles.js";
import { recognizeEngraving } from "../src/engrave/recognize.js";
import { loadModel } from "../src/engrave/model-store.js";

const file = process.argv[2] || "D:/bg/lot-server/images/bench-20261128/live-bdz.jpg";
const buf = fs.readFileSync(file);
const profile = activeProfile();
const model = loadModel()?.model;
const allowed = new Set(["BZE"]);
async function once(label, prof) {
  const t0 = Date.now();
  const r = await recognizeEngraving(buf, { profile: prof, allowed, model });
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ label, ms, top: r.top, success: r.success, reason: r.reason, rejected: r.rejected || "", rot: r.rotation, conf: r.confidence, margin: r.margin, minP: r.minP }));
  return ms;
}
console.log("profile", JSON.stringify({ id: profile.id, rotations: profile.rotations, letterH: profile.letterH, roi: profile.roi, bytes: buf.length }));
const times = [];
times.push(await once("full-profile", profile));
times.push(await once("hint-90-only", { ...profile, rotations: [90] }));
times.push(await once("hint-270-only", { ...profile, rotations: [270] }));
times.push(await once("hint-90-again", { ...profile, rotations: [90] }));
console.log("summary_ms", times);
