// related files:
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/models/abutmentStlShadowRun.model.js
// - web/backend/services/abutmentStl/report.js
//
// 섀도 기록(AbutmentStlShadowRun)을 Markdown 리포트로 만든다.
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/abutment-stl-js/shadow-report.js [--since 2026-09-28] [--backfill 50] [--run]
// --backfill N: 최근 2-filled 의뢰 N건을 대기열에 넣는다(ABUTMENT_STL_SHADOW_ENABLED=true 필요)
// --run: 이 프로세스에서 대기열을 비운 뒤 리포트를 만든다(서버 워커 없이 로컬 확인용)
import fs from "fs/promises";
import path from "path";
import { connectDb, disconnectDb } from "../db/_mongo.js";
import Request from "../../models/request.model.js";
import AbutmentStlShadowRun from "../../models/abutmentStlShadowRun.model.js";
import {
  enqueueAbutmentStlShadow,
  runNextAbutmentStlShadow,
} from "../../services/abutmentStl/shadow.service.js";
import { buildMarkdownReport } from "../../services/abutmentStl/report.js";
import { REPORT_DIR } from "./goldenCache.js";

function argValue(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx < 0 ? fallback : process.argv[idx + 1] ?? fallback;
}

async function main() {
  await connectDb();
  const backfill = Number(argValue("backfill", "0"));
  if (backfill > 0) {
    const rows = await Request.find({
      "caseInfos.file.s3Key": { $exists: true, $ne: "" },
      "caseInfos.stlFile.s3Key": { $exists: true, $ne: "" },
    })
      .sort({ "caseInfos.stlFile.uploadedAt": -1 })
      .limit(backfill)
      .lean();
    let queued = 0;
    for (const row of rows) {
      if (await enqueueAbutmentStlShadow(row, { trigger: "backfill" })) queued += 1;
    }
    console.log(`[shadow-report] backfill queued=${queued}/${rows.length}`);
  }
  if (process.argv.includes("--run")) {
    let n = 0;
    while (await runNextAbutmentStlShadow()) {
      n += 1;
      if (n % 10 === 0) console.log(`[shadow-report] processed ${n}`);
    }
    console.log(`[shadow-report] processed total=${n}`);
  }

  const since = argValue("since", null);
  const filter = { status: { $in: ["done", "failed"] } };
  if (since) filter.createdAt = { $gte: new Date(`${since}T00:00:00+09:00`) };
  const runs = await AbutmentStlShadowRun.find(filter).sort({ createdAt: 1 }).lean();
  const pending = await AbutmentStlShadowRun.countDocuments({ status: { $in: ["queued", "running"] } });
  const rows = runs.map((run) => ({
    requestId: run.requestId,
    record: run.result || { status: run.status, error: run.error },
  }));
  const md = buildMarkdownReport(rows, {
    title: "Rhino ↔ JS 어벗 STL 섀도 모드 리포트",
    notes: [
      `기간: ${since ? `${since} 이후` : "전체"} · 대기/실행 중 ${pending}건`,
      "Rhino 2-filled 등록 시점 DB 값(finishLine·hexRotation·메타)과 같은 원본의 JS 결과를 비교했다",
      "Rhino 결과도 오검출이 있을 수 있다. '다름'은 오류가 아니라 사람이 볼 건이다",
    ],
  });
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(REPORT_DIR, `shadow-${stamp}.md`);
  await fs.writeFile(out, md);
  console.log(`[shadow-report] runs=${runs.length} report=${out}`);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
