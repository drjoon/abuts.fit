import "../../bootstrap/env.js";
import fs from "fs/promises";
import { connectDb, disconnectDb } from "./_mongo.js";
import PrcMapping from "../../models/prcMapping.model.js";
import {
  parseConnectionPrcFileName,
  parseFaceHolePrcFileName,
  PRC_CONNECTION_DIR,
  PRC_FACE_HOLE_DIR,
} from "../../utils/prcFilenameCatalog.js";

/**
 * 로컬 파일 시스템에서 PRC 파일을 읽어서 매핑 데이터 생성
 */
async function readPrcMappingsFromFileSystem() {
  const mappings = new Map();

  try {
    // 1. Connection 파일 읽기
    const connectionFiles = await fs.readdir(PRC_CONNECTION_DIR, {
      withFileTypes: true,
    });
    for (const entry of connectionFiles) {
      if (!entry.isFile() || !/_Connection\.prc$/i.test(entry.name)) continue;

      const parsed = parseConnectionPrcFileName(entry.name);
      if (!parsed) {
        console.warn(`[warn] Connection 파일 파싱 실패: ${entry.name}`);
        continue;
      }

      const key = `${parsed.manufacturer}|${parsed.brand}|${parsed.family}|${parsed.type}`;
      if (!mappings.has(key)) {
        mappings.set(key, {
          manufacturer: parsed.manufacturer,
          brand: parsed.brand,
          family: parsed.family,
          type: parsed.type,
          connectionPrcFileName: parsed.fileName,
          faceHolePrcFileName: "",
        });
      } else {
        mappings.get(key).connectionPrcFileName = parsed.fileName;
      }
    }

    // 2. FaceHole 파일 읽기
    const faceHoleFiles = await fs.readdir(PRC_FACE_HOLE_DIR, {
      withFileTypes: true,
    });
    for (const entry of faceHoleFiles) {
      if (!entry.isFile() || !/_FaceHole\.prc$/i.test(entry.name)) continue;

      const parsed = parseFaceHolePrcFileName(entry.name);
      if (!parsed) {
        console.warn(`[warn] FaceHole 파일 파싱 실패: ${entry.name}`);
        continue;
      }

      const key = `${parsed.manufacturer}|${parsed.brand}|${parsed.family}|${parsed.type}`;
      if (!mappings.has(key)) {
        mappings.set(key, {
          manufacturer: parsed.manufacturer,
          brand: parsed.brand,
          family: parsed.family,
          type: parsed.type,
          connectionPrcFileName: "",
          faceHolePrcFileName: parsed.fileName,
        });
      } else {
        mappings.get(key).faceHolePrcFileName = parsed.fileName;
      }
    }
  } catch (error) {
    console.error("[error] PRC 파일 시스템 읽기 실패:", error);
    throw error;
  }

  // 3. 완전한 매핑만 반환 (FaceHole + Connection 둘 다 있는 것만)
  const completeMappings = [];
  for (const [key, mapping] of mappings) {
    if (mapping.faceHolePrcFileName && mapping.connectionPrcFileName) {
      completeMappings.push(mapping);
    } else {
      console.warn(
        `[warn] 불완전한 매핑 제외: ${key} (FaceHole=${mapping.faceHolePrcFileName}, Connection=${mapping.connectionPrcFileName})`,
      );
    }
  }

  return completeMappings;
}

async function seedPrcMappings() {
  try {
    console.log("[db] PRC 매핑 시드 시작", {
      connectionDir: PRC_CONNECTION_DIR,
      faceHoleDir: PRC_FACE_HOLE_DIR,
    });

    await connectDb();
    console.log("[db] MongoDB 연결 성공");

    // 로컬 파일 시스템에서 PRC 매핑 읽기
    const mappings = await readPrcMappingsFromFileSystem();
    if (mappings.length === 0) {
      throw new Error(
        `PRC 파일을 찾을 수 없습니다. 디렉토리를 확인하세요: ${PRC_CONNECTION_DIR}, ${PRC_FACE_HOLE_DIR}`,
      );
    }

    console.log(`[db] ${mappings.length}개 PRC 매핑 발견`);

    // 기존 데이터 삭제
    await PrcMapping.deleteMany({});
    console.log("[db] 기존 PRC 매핑 데이터 삭제 완료");

    // 새 데이터 삽입
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
