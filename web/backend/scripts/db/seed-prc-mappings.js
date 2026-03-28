import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import PrcMapping from "../../models/prcMapping.model.js";

const PRC_MAPPINGS = [
  {
    manufacturer: "MEGAGEN",
    brand: "AnyOne",
    family: "Regular",
    type: "Hex",
    faceHolePrcFileName: "메가젠_AnyOne_RH_FaceHole.prc",
    connectionPrcFileName: "메가젠_AnyOne_RH_Connection.prc",
  },
  {
    manufacturer: "NEO",
    brand: "IS",
    family: "Regular",
    type: "Hex",
    faceHolePrcFileName: "네오_IS_RH_FaceHole.prc",
    connectionPrcFileName: "네오_IS_RH_Connection.prc",
  },
  {
    manufacturer: "DENTIS",
    brand: "SQ",
    family: "Regular",
    type: "Hex",
    faceHolePrcFileName: "덴티스_SQ_RH_FaceHole.prc",
    connectionPrcFileName: "덴티스_SQ_RH_Connection.prc",
  },
  {
    manufacturer: "DENTIUM",
    brand: "SuperLine",
    family: "Regular",
    type: "Hex",
    faceHolePrcFileName: "덴티움_SuperLine_RH_FaceHole.prc",
    connectionPrcFileName: "덴티움_SuperLine_RH_Connection.prc",
  },
  {
    manufacturer: "OSSTEM",
    brand: "TS",
    family: "Regular",
    type: "Hex",
    faceHolePrcFileName: "오스템_TS_RH_FaceHole.prc",
    connectionPrcFileName: "오스템_TS_RH_Connection.prc",
  },
  {
    manufacturer: "DIO",
    brand: "UF",
    family: "Regular",
    type: "Hex",
    faceHolePrcFileName: "디오_UF_RH_FaceHole.prc",
    connectionPrcFileName: "디오_UF_RH_Connection.prc",
  },
];

async function seedPrcMappings() {
  try {
    await connectDb();
    console.log("MongoDB 연결 성공");

    await PrcMapping.deleteMany({});
    console.log("기존 PRC 매핑 데이터 삭제 완료");

    const result = await PrcMapping.insertMany(PRC_MAPPINGS);
    console.log(`${result.length}개 PRC 매핑 데이터 생성 완료`);

    for (const mapping of result) {
      console.log(
        `  - ${mapping.manufacturer} ${mapping.brand} ${mapping.family} ${mapping.type}`,
      );
    }

    await disconnectDb();
    console.log("\n✅ PRC 매핑 시드 완료");
  } catch (error) {
    console.error("❌ PRC 매핑 시드 실패:", error);
    process.exit(1);
  }
}

seedPrcMappings();
