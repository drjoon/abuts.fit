// 배치 스크립트: 기존 Request 문서에 대해 STL 재분석으로 maxDiameter 채우기
// 사용법 (예시):
//   NODE_ENV=production node backend/scripts/updateMaxDiameterFromStl.js
//
// 전제 조건:
// - MongoDB 연결 정보는 backend와 동일한 .env / 설정을 사용
// - File 컬렉션에 STL 파일 메타 정보가 있고, Request와 연관(예: relatedRequest)되어 있다고 가정
// - STL 파싱을 위해 'stl' 또는 'node-stl' 등의 패키지를 설치해야 합니다.
//   예) npm install stl

import mongoose from "mongoose";
import "../bootstrap/env.js";
import fs from "fs";
import path from "path";
// STL 파서 예시 (필요에 따라 다른 라이브러리 사용 가능)
// import STL from "stl";

import Request from "../models/request.model.js";
import File from "../models/file.model.js";

async function connectDb() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    throw new Error(
      "MONGODB_URI (또는 DATABASE_URL)가 .env에 설정되어 있지 않습니다."
    );
  }
  await mongoose.connect(uri);
  console.log("[updateMaxDiameterFromStl] MongoDB connected");
}

// STL 파일에서 최대 직경을 계산하는 헬퍼 (단순 예시)
// 실제 구현 시, 프론트의 StlPreviewViewer와 동일한 로직을 Node/서버 환경에 맞게 포팅해야 합니다.
async function computeMaxDiameterFromStl(filePath) {
  // TODO: 'stl' 또는 다른 라이브러리를 사용해 STL을 파싱하고,
  //       XY 평면에서 최대 반경을 구한 뒤 2배하여 직경을 계산합니다.
  // 이 스크립트에서는 구조만 제공하고, 구현은 환경에 맞게 채워 넣도록 합니다.
  console.warn(
    `[updateMaxDiameterFromStl] STL 분석 로직은 아직 구현되지 않았습니다. path=${filePath}`
  );
  return null;
}

async function updateRequestsMaxDiameter() {
  // maxDiameter가 비어 있는 요청만 대상
  const requests = await Request.find({
    maxDiameter: { $exists: false },
  }).lean();

  console.log(
    `[updateMaxDiameterFromStl] 대상 요청 수: ${requests.length.toString()}`
  );

  for (const req of requests) {
    try {
      // 관련 STL 파일 찾기 (File 스키마에 따라 조건 수정 필요)
      const files = await File.find({
        relatedRequest: req._id, // 실제 필드 구조에 맞게 수정
        fileType: { $in: ["model/stl", "application/octet-stream"] },
      }).lean();

      if (!files.length) {
        continue;
      }

      let maxDiameter = null;

      for (const f of files) {
        // 예시: 로컬 경로를 알고 있는 경우
        const localPath = f.filePath;
        if (!localPath || !fs.existsSync(localPath)) {
          continue;
        }

        const d = await computeMaxDiameterFromStl(localPath);
        if (d != null && Number.isFinite(d)) {
          maxDiameter = maxDiameter == null ? d : Math.max(maxDiameter, d);
        }
      }

      if (maxDiameter != null && Number.isFinite(maxDiameter)) {
        await Request.updateOne({ _id: req._id }, { $set: { maxDiameter } });
        console.log(
          `[updateMaxDiameterFromStl] requestId=${
            req.requestId
          } maxDiameter=${maxDiameter.toFixed(2)}`
        );
      }
    } catch (err) {
      console.error(
        `[updateMaxDiameterFromStl] 요청 업데이트 중 오류 requestId=${req.requestId}:`,
        err
      );
    }
  }
}

(async () => {
  try {
    await connectDb();
    await updateRequestsMaxDiameter();
  } catch (err) {
    console.error("[updateMaxDiameterFromStl] 스크립트 실행 오류:", err);
  } finally {
    await mongoose.disconnect();
    console.log("[updateMaxDiameterFromStl] MongoDB disconnected");
  }
})();
