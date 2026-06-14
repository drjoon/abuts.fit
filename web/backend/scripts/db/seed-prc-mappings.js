import "../../bootstrap/env.js";
import fs from "fs/promises";
import path from "path";
import { connectDb, disconnectDb } from "./_mongo.js";
import PrcMapping from "../../models/prcMapping.model.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";
import {
  PRC_CONNECTION_DIR,
  PRC_FACE_HOLE_DIR,
} from "../../utils/prcFilenameCatalog.js";

function toFaceHoleFileName(connectionFileName) {
  return String(connectionFileName || "").replace(
    /_Connection\.prc$/i,
    "_FaceHole.prc",
  );
}

async function buildExistingFileNameSet(dirPath, suffixRegex) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return new Set(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => suffixRegex.test(name))
      .map((name) => name.normalize("NFC")),
  );
}

async function buildMappingsFromTableSeed() {
  const connectionFiles = await buildExistingFileNameSet(
    PRC_CONNECTION_DIR,
    /_Connection\.prc$/i,
  );
  const faceHoleFiles = await buildExistingFileNameSet(
    PRC_FACE_HOLE_DIR,
    /_FaceHole\.prc$/i,
  );

  const mappings = [];
  const seen = new Set();

  for (const row of CONNECTIONS_SEED) {
    const manufacturer = String(row.manufacturer || "").trim();
    const brand = String(row.brand || "").trim();
    const family = String(row.family || "").trim();
    const type = String(row.type || "").trim();
    const connectionPrcFileName = String(row.fileName || "").trim();
    const faceHolePrcFileName = toFaceHoleFileName(connectionPrcFileName);

    const key = `${manufacturer}|${brand}|${family}|${type}`;
    if (seen.has(key)) continue;

    if (!connectionFiles.has(connectionPrcFileName.normalize("NFC"))) {
      throw new Error(
        `[seed-prc] Connection 파일 없음: ${connectionPrcFileName} (${path.join(
          PRC_CONNECTION_DIR,
          connectionPrcFileName,
        )})`,
      );
    }

    if (!faceHoleFiles.has(faceHolePrcFileName.normalize("NFC"))) {
      throw new Error(
        `[seed-prc] FaceHole 파일 없음: ${faceHolePrcFileName} (${path.join(
          PRC_FACE_HOLE_DIR,
          faceHolePrcFileName,
        )})`,
      );
    }

    seen.add(key);
    mappings.push({
      manufacturer,
      brand,
      family,
      type,
      connectionPrcFileName,
      faceHolePrcFileName,
    });
  }

  return mappings;
}

async function seedPrcMappings() {
  try {
    console.log("[db] PRC 매핑 시드 시작", {
      connectionDir: PRC_CONNECTION_DIR,
      faceHoleDir: PRC_FACE_HOLE_DIR,
    });

    await connectDb();
    console.log("[db] MongoDB 연결 성공");

    const mappings = await buildMappingsFromTableSeed();
    if (mappings.length === 0) {
      throw new Error(
        "생성할 PRC 매핑이 없습니다. CONNECTIONS_SEED를 확인하세요.",
      );
    }

    console.log(`[db] ${mappings.length}개 PRC 매핑 생성 예정`);

    await PrcMapping.deleteMany({});
    console.log("[db] 기존 PRC 매핑 데이터 삭제 완료");

    const result = await PrcMapping.insertMany(mappings);
    console.log(`[db] ${result.length}개 PRC 매핑 데이터 생성 완료`);

    for (const mapping of result) {
      console.log(
        `  - ${mapping.manufacturer} ${mapping.brand} ${mapping.family} ${mapping.type}`,
      );
      console.log(`    FaceHole: ${mapping.faceHolePrcFileName}`);
      console.log(`    Connection: ${mapping.connectionPrcFileName}`);
    }

    await disconnectDb();
    console.log("\n✅ PRC 매핑 시드 완료");
  } catch (error) {
    console.error("❌ PRC 매핑 시드 실패:", error);
    process.exit(1);
  }
}

seedPrcMappings();
