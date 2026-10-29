// related files:
// - web/backend/services/abutmentStl/filledLambda.service.js
// - web/backend/services/abutmentStl/pipeline.js
//
// Filled STL JS 람다 엔트리. 메모리 2048MB(vCPU 1), 타임아웃 60초, 아키텍처 arm64.
// 60초를 넘기면 함수가 중단되고, 웹이 준비 카드에 시간 초과를 남긴다.
// 이벤트: { bucket, inKey, outKey, resultKey, errKey, targetDiameter, implantProfile, connection, finishLinePoints, designAlreadyCorrected }
//
// pipeline.applyConnectionTaper가 짧은 11°를 PRC 면(prcConeHeightMm, Regular RH는 덴티움 0.33·덴티스·메가젠 0.4·그 외 0.3)까지 연장한다.
// 커프 이음은 별도 cuff 람다. 원뿔 길이·원점 규칙을 바꾸면 deploy-stl-filled-lambda.sh 도 같이 갱신한다.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { runAbutmentStlPipeline } from "./pipeline.js";

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });

function assertTempKey(key) {
  if (!/^temp\/stl-filled\/[a-f0-9]{32}\/.+/.test(String(key || ""))) {
    throw new Error("temp/stl-filled 키만 쓸 수 있습니다.");
  }
}

async function readObject(bucket, key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (typeof resp.Body?.transformToByteArray === "function") {
    return Buffer.from(await resp.Body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function writeObject(bucket, key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

function resultJson(js) {
  const { outputBuffer, logs, alignMatrix, ...rest } = js || {};
  return Buffer.from(JSON.stringify(rest));
}

export async function handler(event) {
  const bucket = String(event?.bucket || "");
  const inKey = String(event?.inKey || "");
  const outKey = String(event?.outKey || "");
  const resultKey = String(event?.resultKey || "");
  const errKey = String(event?.errKey || "");
  if (!bucket || !inKey || !outKey || !resultKey) {
    throw new Error("bucket, inKey, outKey, resultKey가 필요합니다.");
  }
  assertTempKey(outKey);
  assertTempKey(resultKey);
  if (errKey) assertTempKey(errKey);
  try {
    const input = await readObject(bucket, inKey);
    const js = await runAbutmentStlPipeline(input, {
      targetDiameter: event?.targetDiameter ?? null,
      implantProfile: event?.implantProfile || {},
      ...(event?.connection ? { connection: event.connection } : {}),
      ...(Array.isArray(event?.finishLinePoints) ? { finishLinePoints: event.finishLinePoints } : {}),
      ...(event?.designAlreadyCorrected ? { designAlreadyCorrected: true } : {}),
      ...(event?.surfacePrepared ? { surfacePrepared: true } : {}),
    });
    if (!js?.outputBuffer?.length) {
      throw new Error("JS 출력 STL이 비어 있습니다.");
    }
    await writeObject(bucket, outKey, js.outputBuffer, "application/octet-stream");
    await writeObject(bucket, resultKey, resultJson(js), "application/json");
    return { ok: true, bytes: js.outputBuffer.length };
  } catch (error) {
    const message = String(error?.message || error || "js_error").slice(0, 300);
    if (errKey) {
      await writeObject(bucket, errKey, Buffer.from(message), "text/plain").catch(() => null);
    }
    throw error;
  }
}
