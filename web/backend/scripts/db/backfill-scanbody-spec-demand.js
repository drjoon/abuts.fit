// 지금까지의 치과 의뢰(활성)에서 스캔바디·심플 규격과 임플란트를 ScanbodySpecDemand에 쌓는다.
// 같은 의뢰는 다시 세지 않아서 여러 번 돌려도 된다. 새 의뢰는 생성·수정 때 바로 쌓인다.
//
// cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/backfill-scanbody-spec-demand.js
// related files:
// - web/backend/services/scanbodyDemand.service.js
// - web/backend/scripts/db/pending-migrations.js
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import ScanbodySpecDemand from "../../models/scanbodySpecDemand.model.js";
import { recordScanbodyDemand } from "../../services/scanbodyDemand.service.js";

const uri = getMongoUri();
assertSafeToMutateDb(uri);
await mongoose.connect(uri);
try {
  await ScanbodySpecDemand.syncIndexes();
  const cursor = PracticeTransfer.find({
    status: "active",
    "toothWorks.abutmentManufacturer": { $nin: [null, ""] },
  })
    .select({ createdAt: 1, toothWorks: 1, practiceBusinessAnchorId: 1, targetLabAnchorId: 1, assigneeLabAnchorId: 1 })
    .sort({ createdAt: 1 })
    .lean()
    .cursor();
  let transfers = 0;
  let specs = 0;
  for await (const transfer of cursor) {
    transfers += 1;
    specs += await recordScanbodyDemand(transfer);
  }
  console.log("[backfill-scanbody-spec-demand]", { transfers, added: specs, total: await ScanbodySpecDemand.countDocuments() });
} finally {
  await mongoose.disconnect();
}
