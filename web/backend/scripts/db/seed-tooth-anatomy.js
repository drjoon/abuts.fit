// FDI 32개 영구치(#11~#48) 부위별 정상 크기·해부 형태·커스텀어벗 1mm 컷백 DB 구축 스크립트.
// 실행:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/seed-tooth-anatomy.js
// related files:
// - web/backend/models/toothAnatomy.model.js
// - web/backend/services/toothAnatomy.seed.js
import { connectDb, disconnectDb } from "./_mongo.js";
import { ensureToothAnatomySeeded } from "../../services/toothAnatomy.seed.js";

async function main() {
  await connectDb();
  const rows = await ensureToothAnatomySeeded({ forceUpdate: true });
  console.log(`[seed-tooth-anatomy] upserted ${rows.length} FDI teeth (#11~#48)`);
  for (const row of rows.filter((r) => r.quadrant === 1 || r.quadrant === 3)) {
    console.log(
      `  #${row.toothNumber} (${row.toothClass} ${row.koreanName}): crownEq=${row.crown.equator.mdMm}x${row.crown.equator.blMm}mm | cerv=${row.crown.cervical.mdMm}x${row.crown.cervical.blMm}mm | abutMargin=${row.abutmentCutback.marginMdMm}x${row.abutmentCutback.marginBlMm}mm | shape=${row.morphology.sectionShape}`,
    );
  }
  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[seed-tooth-anatomy] failed", err);
  try {
    await disconnectDb();
  } catch {}
  process.exit(1);
});
