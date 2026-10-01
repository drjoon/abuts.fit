// 코드만 다른 스캔바디 라이브러리(`BG41_LS`, `BG41_LL_H55`)를 연결 하나·규격 여러 키트로 합친다.
// 파일 이름에 제조사/브랜드 경로가 있으면 그 메타도 남긴다. 다시 돌려도 이미 묶인 문서는 그대로다.
//
// cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/migrate-scanbody-library-groups.js
// related files:
// - web/backend/utils/scanbodyLibraryIdentity.js
// - web/backend/models/scanbodyLibrary.model.js
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import ScanbodyLibrary from "../../models/scanbodyLibrary.model.js";
import { describeLibrary, splitScanbodyCode } from "../../utils/scanbodyLibraryIdentity.js";

const uri = getMongoUri();
assertSafeToMutateDb(uri);
await mongoose.connect(uri);

function plain(value) {
  return value?.toObject?.() ?? value;
}

function union(a, b) {
  return [...new Set([...(a || []), ...(b || [])].filter(Boolean))];
}

try {
  const docs = await ScanbodyLibrary.find({}).exec();
  const groups = new Map();
  for (const doc of docs) {
    const filePath = (doc.fileNames || []).find((name) => String(name).includes("/")) || "";
    const identity = describeLibrary({
      systemName: doc.systemName,
      filePath,
      meta: {
        manufacturer: doc.implantManufacturer,
        brand: doc.brand,
        type: doc.implantType,
      },
    });
    const key = [String(doc.ownerAnchorId || ""), String(doc.forkOf || ""), doc.source || "", identity.groupKey].join("::");
    const bucket = groups.get(key) ?? [];
    bucket.push({ doc, identity });
    groups.set(key, bucket);
  }

  let merged = 0;
  let removed = 0;
  for (const members of groups.values()) {
    const should =
      members.length > 1 || members.some((row) => row.identity.spec && row.doc.systemName !== row.identity.title);
    if (!should || !members.some((row) => row.identity.spec)) continue;
    const keeper = members.find((row) => row.doc.systemName === row.identity.title) || members[0];
    const parts = new Map();
    const kits = new Map();
    let fileNames = [];
    let containerVersions = [];
    let manufacturers = [];
    for (const { doc, identity } of members) {
      fileNames = union(fileNames, doc.fileNames);
      containerVersions = union(containerVersions, doc.containerVersions);
      manufacturers = union(manufacturers, doc.manufacturers);
      if (identity.manufacturer) manufacturers = union(manufacturers, [identity.manufacturer]);
      for (const part of doc.parts || []) parts.set(part.partId, plain(part));
      for (const kit of doc.kits || []) {
        const row = plain(kit);
        const code = splitScanbodyCode(row.code || identity.code || doc.systemName);
        const next = {
          ...row,
          spec: row.spec || identity.spec || code.spec,
          code: row.code || identity.code || code.code,
          name: row.spec || identity.spec || code.spec || row.name,
        };
        const prev = [...kits.values()].find((item) => item.code && item.code === next.code);
        if (!prev) kits.set(next.kitId, next);
        else if ((next.catalogIds || []).length > (prev.catalogIds || []).length) prev.catalogIds = next.catalogIds;
      }
    }
    const identity = keeper.identity;
    keeper.doc.systemName = identity.title;
    keeper.doc.implantManufacturer = identity.manufacturer || keeper.doc.implantManufacturer || "";
    keeper.doc.brand = identity.brand || keeper.doc.brand || "";
    keeper.doc.implantType = identity.implantType || keeper.doc.implantType || "";
    keeper.doc.parts = [...parts.values()];
    keeper.doc.kits = [...kits.values()];
    keeper.doc.fileNames = fileNames;
    keeper.doc.containerVersions = containerVersions.sort();
    keeper.doc.manufacturers = manufacturers;
    const drop = members.filter((row) => row.doc._id !== keeper.doc._id).map((row) => row.doc._id);
    if (drop.length > 0) {
      await ScanbodyLibrary.deleteMany({ _id: { $in: drop } });
      removed += drop.length;
    }
    await keeper.doc.save();
    merged += 1;
  }
  console.log("[scanbody-groups]", { groups: groups.size, merged, removed });
} finally {
  await mongoose.disconnect();
}
