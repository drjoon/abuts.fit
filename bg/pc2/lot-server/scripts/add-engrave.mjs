// change-log:
// - 2026-11-27: 코드를 아는 사진(UM Viewer 캡처 등)을 각인 데이터셋에 넣는다. 지금 모델로 그 코드의 글자 위치를 찾고,
//   확인용 그림(check.png: ROI에 찾은 글자 상자)을 표본 폴더에 남긴다. 위치 확률이 낮으면 상자 없이 저장(학습 제외).
// usage: npm run add:engrave -- D:\bg\lot-server\images\20261127145628.293_h6.5v3.656mm.jpg=BYX [더 많은 파일=코드] [--profile jig-1] [--dataset DIR] [--dry]
// related files:
// - bg/pc2/lot-server/src/engrave/dataset.js
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/README.md

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { datasetDir, saveSample } from "../src/engrave/dataset.js";
import { locateCode, locationTrusted } from "../src/engrave/recognize.js";
import { activeProfile, loadProfiles } from "../src/jig-profiles.js";
import { roiPixels, rotateGray, cropGray, decodeGray } from "../src/engrave/crops.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const root = flag("--dataset") || datasetDir();
const dry = args.includes("--dry");
const profileId = flag("--profile");
const profile = profileId ? loadProfiles().profiles[profileId] : activeProfile();
if (!profile) throw new Error(`지그 프로필 ${profileId}가 없습니다.`);
const pairs = args.filter((a) => /=[A-Za-z]{3}$/.test(a));
if (!pairs.length) {
  console.log("사용법: npm run add:engrave -- <사진.jpg>=<코드> ...");
  process.exit(1);
}

async function checkImage(frame, rotation, boxes, out) {
  const f = await decodeGray(frame);
  const rect = roiPixels(profile.roi, f.width, f.height);
  const rg = rotateGray(cropGray(f.gray, f.width, rect), rect.width, rect.height, rotation);
  const rects = boxes
    .map((b) => `<rect x="${(b[0] * rg.width).toFixed(1)}" y="${(b[1] * rg.height).toFixed(1)}" width="${((b[2] - b[0]) * rg.width).toFixed(1)}" height="${((b[3] - b[1]) * rg.height).toFixed(1)}" fill="none" stroke="#00ff66" stroke-width="2"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rg.width}" height="${rg.height}">${rects}</svg>`;
  await sharp(Buffer.from(rg.gray), { raw: { width: rg.width, height: rg.height, channels: 1 } })
    .toColourspace("srgb")
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(out);
}

for (const pair of pairs) {
  const i = pair.lastIndexOf("=");
  const file = pair.slice(0, i);
  const code = pair.slice(i + 1).toUpperCase();
  const frame = fs.readFileSync(file);
  const loc = await locateCode(frame, code, { profile });
  const boxed = locationTrusted(loc);
  const line = `${path.basename(file)} ${code} p=${loc ? loc.meanP.toFixed(2) : "-"} 글자다움=${loc ? loc.letterness.toFixed(2) : "-"} rot=${loc?.rotation ?? "-"} ${boxed ? "" : "(위치 못 찾음: 상자 없이 저장)"}`;
  if (dry) {
    console.log(`[dry] ${line} ${loc ? JSON.stringify(loc.boxes) : ""}`);
    continue;
  }
  const { dir } = await saveSample(
    {
      frame,
      code,
      profile,
      rotation: boxed ? loc.rotation : 0,
      boxes: boxed ? loc.boxes : null,
      source: "add-script",
      extra: { sourceFile: path.basename(file), locateMeanP: loc ? Number(loc.meanP.toFixed(3)) : null, letterness: loc ? Number(loc.letterness.toFixed(3)) : null },
    },
    root,
  );
  if (boxed) await checkImage(frame, loc.rotation, loc.boxes, path.join(dir, "check.png"));
  console.log(`+ ${line} → ${dir}`);
}
