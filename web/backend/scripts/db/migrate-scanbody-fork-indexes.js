// 스캔바디 라이브러리·심플어벗 템플릿 고유 인덱스에 forkOf(기공소 사본)를 넣는다.
// 예전 인덱스 { ownerAnchorId, systemName } / { ownerAnchorId, kind, diameter, height }가 남으면
// 기공소가 공용 원본의 사본을 만들 때 중복 키로 막힌다. syncIndexes가 예전 것을 지우고 새 것을 만든다.
//
// cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/migrate-scanbody-fork-indexes.js
// related files:
// - web/backend/models/scanbodyLibrary.model.js
// - web/backend/models/abutmentTemplate.model.js
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import ScanbodyLibrary from "../../models/scanbodyLibrary.model.js";
import AbutmentTemplate from "../../models/abutmentTemplate.model.js";

const uri = getMongoUri();
assertSafeToMutateDb(uri);
await mongoose.connect(uri);
try {
  for (const [name, model] of [
    ["ScanbodyLibrary", ScanbodyLibrary],
    ["AbutmentTemplate", AbutmentTemplate],
  ]) {
    const dropped = await model.syncIndexes();
    const indexes = await model.collection.indexes();
    console.log(name, {
      dropped,
      indexes: indexes.map((row) => row.name),
    });
  }
} finally {
  await mongoose.disconnect();
}
