// related files:
// - web/backend/scripts/abutment-stl-js/fetch-golden.js (먼저 실행)
// - web/backend/services/abutmentStl/evaluate.js
// - web/backend/services/abutmentStl/report.js
//
// 골든 캐시(원본 1-stl + Rhino 2-filled + DB 기준값)로 JS 파이프라인을 돌려 리포트를 만든다.
// DB·S3는 건드리지 않는다. JS 결과 STL은 각 폴더의 js.filled.stl로 남긴다(뷰어로 비교용).
//
//   cd web/backend && node scripts/abutment-stl-js/compare-golden.js [--limit 50] [--concurrency 4]
import fs from "fs/promises";
import path from "path";
import os from "os";
import { GOLDEN_CACHE_DIR, REPORT_DIR } from "./goldenCache.js";
import { evaluateAgainstRhinoInWorker } from "../../services/abutmentStl/runPipelineInWorker.js";
import { buildMarkdownReport } from "../../services/abutmentStl/report.js";
import {
  SCREWHOLE_PARAMS,
  SCREWHOLE_PARAMS_LEGACY,
} from "../../services/abutmentStl/fillScrewholes.js";

/** fill_screwholes.py 탐사 원 2.9mm 커밋(8a90d1593) 시각. 그 전 Rhino 결과는 2.5mm로 만들어졌다. */
const SCREWHOLE_PARAMS_CHANGED_AT = new Date("2026-09-28T11:50:55+09:00");

function argValue(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx < 0 ? fallback : process.argv[idx + 1] ?? fallback;
}

const limit = Number(argValue("limit", "100000"));
const concurrency = Number(argValue("concurrency", String(Math.max(1, Math.min(6, os.cpus().length - 2)))));

async function main() {
  const ids = (await fs.readdir(GOLDEN_CACHE_DIR)).sort();
  const seen = new Set();
  const cases = [];
  for (const id of ids) {
    const dir = path.join(GOLDEN_CACHE_DIR, id);
    let meta;
    try {
      meta = JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));
    } catch {
      continue;
    }
    if (seen.has(meta.originalS3Key)) continue;
    seen.add(meta.originalS3Key);
    cases.push({ id, dir, meta });
    if (cases.length >= limit) break;
  }
  console.log(`[compare-golden] cases=${cases.length} concurrency=${concurrency}`);

  const rows = new Array(cases.length);
  let next = 0;
  let done = 0;
  const started = Date.now();
  const worker = async () => {
    while (next < cases.length) {
      const i = next;
      next += 1;
      const { id, dir, meta } = cases[i];
      const uploadedAt = meta.rhinoFilledUploadedAt ? new Date(meta.rhinoFilledUploadedAt) : null;
      const legacy = uploadedAt && uploadedAt < SCREWHOLE_PARAMS_CHANGED_AT;
      let record;
      try {
        record = await evaluateAgainstRhinoInWorker({
          inputBuffer: await fs.readFile(path.join(dir, "input.stl")),
          rhinoFilledBuffer: await fs.readFile(path.join(dir, "rhino.filled.stl")),
          rhino: meta.rhino,
          inputs: meta.inputs,
          screwholeParams: legacy ? SCREWHOLE_PARAMS_LEGACY : SCREWHOLE_PARAMS,
        });
      } catch (error) {
        record = { status: "compare_failed", error: String(error?.message || error) };
      }
      if (record.outputBuffer) {
        await fs.writeFile(path.join(dir, "js.filled.stl"), record.outputBuffer);
        delete record.outputBuffer;
      }
      rows[i] = { requestId: id, record };
      done += 1;
      if (done % 10 === 0 || done === cases.length) {
        console.log(`[compare-golden] ${done}/${cases.length} ${((Date.now() - started) / 1000).toFixed(0)}s`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  await fs.mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const md = buildMarkdownReport(rows, {
    title: "Rhino ↔ JS 어벗 STL 파이프라인 골든 비교",
    notes: [
      "기준: 테스트 DB에서 현재 정렬 모듈 버전(2026-08-18.connection-z-origin-v1)으로 처리된 의뢰, 원본 STL 기준 중복 제거",
      `스크류홀 탐사 원: ${SCREWHOLE_PARAMS_CHANGED_AT.toISOString()} 이전 Rhino 결과는 legacy(2.5mm/2.75mm)로 맞춰 돌렸다`,
      "Rhino 결과도 오검출이 있을 수 있다. '다름'은 오류가 아니라 사람이 볼 건이다",
    ],
  });
  const mdPath = path.join(REPORT_DIR, `golden-${stamp}.md`);
  const jsonPath = path.join(REPORT_DIR, `golden-${stamp}.json`);
  await fs.writeFile(mdPath, md);
  await fs.writeFile(jsonPath, JSON.stringify(rows, null, 1));
  console.log(`[compare-golden] report=${mdPath}`);
  console.log(`[compare-golden] json=${jsonPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
