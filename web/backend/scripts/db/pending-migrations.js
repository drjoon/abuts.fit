// 배포·셋업 때 DB마다 한 번씩 돌려야 하는 스크립트 목록과 실행기.
// 돌린 기록은 그 DB의 `dbmigrations` 컬렉션에 남는다. 테스트 DB에 돌렸어도 운영 DB에는 따로 남은 것으로 보인다.
// 운영에 꼭 돌려야 하는 스크립트를 새로 만들면 MIGRATIONS 맨 끝에 붙인다(순서대로 돈다). 다시 돌려도 안전해야 한다.
//
// 남은 것 보기:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/pending-migrations.js
// 남은 것 모두 돌리기:
//   ... node scripts/db/pending-migrations.js --apply
// 이미 손으로 돌린 것을 기록만:
//   ... node scripts/db/pending-migrations.js --mark <id>
// 운영: ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true (위와 같은 순서로 먼저 목록부터 본다)
// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/scripts/db/README.md
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import mongoose from "mongoose";
import { assertSafeToMutateDb, getDbNameFromMongoUri, getMongoUri } from "./_mongo.js";

/** @type {Array<{ id: string, script: string, args?: string[], note: string }>} */
const MIGRATIONS = [
  {
    id: "2026-10-01-scanbody-fork-indexes",
    script: "migrate-scanbody-fork-indexes.js",
    note: "스캔바디 라이브러리·심플 템플릿 고유 인덱스에 forkOf(기공소 사본)를 넣는다.",
  },
  {
    id: "2026-10-01-scanbody-spec-demand",
    script: "backfill-scanbody-spec-demand.js",
    note: "지금까지의 의뢰에서 스캔바디·심플 규격과 임플란트를 쌓아 관리자 대시보드에 보인다.",
  },
  {
    id: "2026-10-01-scanbody-library-groups",
    script: "migrate-scanbody-library-groups.js",
    note: "규격만 다른 스캔바디 라이브러리 코드를 제조사·브랜드·연결 한 묶음으로 합친다.",
  },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const markIdx = argv.indexOf("--mark");
const markId = markIdx >= 0 ? argv[markIdx + 1] : null;

function runScript(row) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, row.script), ...(row.args || [])], {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${row.script} exited (${code})`))));
  });
}

const uri = getMongoUri();
assertSafeToMutateDb(uri);
await mongoose.connect(uri);
const log = mongoose.connection.db.collection("dbmigrations");
try {
  const done = new Set((await log.find({}, { projection: { _id: 1 } }).toArray()).map((row) => row._id));
  const pending = MIGRATIONS.filter((row) => !done.has(row.id));
  console.log(`[migrations] db=${getDbNameFromMongoUri(uri)} 남은 것 ${pending.length}개 / 전체 ${MIGRATIONS.length}개`);
  for (const row of MIGRATIONS) {
    console.log(`  ${done.has(row.id) ? "완료" : "남음"}  ${row.id}  ${row.note}`);
  }

  if (markId) {
    const row = MIGRATIONS.find((m) => m.id === markId);
    if (!row) throw new Error(`목록에 없는 id: ${markId}`);
    await log.updateOne(
      { _id: row.id },
      { $setOnInsert: { script: row.script, appliedAt: new Date(), markedOnly: true } },
      { upsert: true },
    );
    console.log(`[migrations] ${row.id} 기록만 남겼습니다.`);
  } else if (apply) {
    for (const row of pending) {
      console.log(`[migrations] 실행 ${row.id} (${row.script})`);
      await runScript(row);
      await log.updateOne(
        { _id: row.id },
        { $set: { script: row.script, appliedAt: new Date(), markedOnly: false } },
        { upsert: true },
      );
    }
    if (pending.length) console.log("[migrations] 모두 끝났습니다.");
  } else if (pending.length) {
    console.log("[migrations] 돌리려면 --apply 를 붙입니다.");
  }
} finally {
  await mongoose.disconnect();
}
