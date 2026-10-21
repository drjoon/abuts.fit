// related files:
// - web/backend/services/abutmentStl/correctLambda.handler.js
// - web/backend/services/abutmentStl/preflight.service.js
// - web/backend/services/abutmentStl/runPipelineInWorker.js
//
// 완전한 보정 STL 실행 위치는 execution.js가 정한다(EBS만 람다, 로컬·테스트는 워커).
import AWS from "aws-sdk";
import { shouldUseStlLambda } from "./execution.js";
import {
  deleteFileFromS3,
  getObjectBufferFromS3,
  headObjectSizeInS3,
  putObjectToS3,
} from "../../utils/s3.utils.js";
import { runAbutmentStlPipelineInWorker } from "./runPipelineInWorker.js";

const POLL_MS = 1000;
const WAIT_MS = 150 * 1000;

/** 의뢰에 그대로 넣는 보정 STL. 람다 임시 입력·에러만 지우고 이 객체는 남긴다. */
export function correctedDesignS3Key(id) {
  return `temp/stl-correct/${id}/out.stl`;
}

export function isPersistedCorrectedDesignKey(key) {
  return /^temp\/stl-correct\/[a-f0-9]{32}\/out\.stl$/.test(String(key || "").trim());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function correctedStlLambdaName() {
  return String(process.env.ABUTMENT_STL_CORRECT_LAMBDA || "").trim();
}

let lambdaClient = null;
function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new AWS.Lambda({ region: process.env.AWS_REGION || "ap-northeast-2" });
  }
  return lambdaClient;
}

async function buildOnWorker(buffer, inputs, id) {
  const js = await runAbutmentStlPipelineInWorker(buffer, {
    targetDiameter: inputs?.targetDiameter ?? null,
    implantProfile: inputs?.implantProfile || {},
    correctDesign: true,
  });
  if (!js?.outputBuffer?.length) {
    const error = new Error("보정 STL을 만들지 못했습니다.");
    error.reason = "correction_failed";
    throw error;
  }
  await putObjectToS3(correctedDesignS3Key(id), js.outputBuffer, {
    contentType: "model/stl",
  });
  return js.outputBuffer;
}

async function pollCorrectedObject(outKey, errKey) {
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    const size = await headObjectSizeInS3(outKey);
    if (size > 0) return getObjectBufferFromS3(outKey);
    if (errKey) {
      const errSize = await headObjectSizeInS3(errKey);
      if (errSize > 0) {
        const body = await getObjectBufferFromS3(errKey);
        const reason = body.toString("utf8").trim() || "correction_failed";
        const error = new Error(reason);
        error.reason = reason === "no_tight_corners" ? "no_tight_corners" : "correction_failed";
        throw error;
      }
    }
    await sleep(POLL_MS);
  }
  const error = new Error("보정 STL 람다 대기 시간이 초과되었습니다.");
  error.reason = "correction_failed";
  throw error;
}

async function buildOnLambda(buffer, inputs, id) {
  const name = correctedStlLambdaName();
  const inKey = `temp/stl-correct/${id}/in.stl`;
  const outKey = correctedDesignS3Key(id);
  const errKey = `temp/stl-correct/${id}/error.txt`;
  const bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  await deleteFileFromS3(errKey).catch(() => null);
  await putObjectToS3(inKey, buffer, { contentType: "application/octet-stream" });
  await getLambdaClient()
    .invoke({
      FunctionName: name,
      InvocationType: "Event",
      Payload: JSON.stringify({
        bucket,
        inKey,
        outKey,
        errKey,
        targetDiameter: inputs?.targetDiameter ?? null,
        implantProfile: inputs?.implantProfile || {},
      }),
    })
    .promise();
  try {
    return await pollCorrectedObject(outKey, errKey);
  } finally {
    void deleteFileFromS3(inKey).catch(() => null);
    void deleteFileFromS3(errKey).catch(() => null);
  }
}

/** 완전한 보정 STL. EBS(프로덕션)에서만 람다, 그 외에는 로컬 워커(execution.js). out.stl은 의뢰용으로 남긴다. */
export async function buildCorrectedDesignOffRequest(buffer, inputs, id) {
  if (!/^[a-f0-9]{32}$/.test(String(id || ""))) {
    const error = new Error("보정 STL id가 없습니다.");
    error.reason = "correction_failed";
    throw error;
  }
  if (shouldUseStlLambda(correctedStlLambdaName())) return buildOnLambda(buffer, inputs, id);
  console.warn("[stl-correct] 람다를 쓰지 않아 백엔드 워커로 보정 STL을 만듭니다.");
  return buildOnWorker(buffer, inputs, id);
}
