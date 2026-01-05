import DraftRequest from "../models/draftRequest.model.js";
import axios from "axios";
import fs from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";
import { getObjectBufferFromS3, uploadFileToS3 } from "../utils/s3.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RHINO_COMPUTE_BASE_URL = String(
  process.env.RHINO_COMPUTE_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const STORE_OUT_DIR = resolve(__dirname, "../../../rhino/Stl-Stores/out");

let isProcessing = false;

async function processFillHole() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const drafts = await DraftRequest.find({
      status: "draft",
      "caseInfos.file.mimetype": "application/sla",
      $or: [
        { "caseInfos.maxDiameter": { $exists: false } },
        { "caseInfos.maxDiameter": null },
      ],
    }).limit(5);

    for (const draft of drafts) {
      let draftUpdated = false;

      for (let i = 0; i < draft.caseInfos.length; i++) {
        const caseInfo = draft.caseInfos[i];

        if (
          caseInfo.maxDiameter ||
          caseInfo.file?.mimetype !== "application/sla"
        )
          continue;

        const s3Key = caseInfo.file?.s3Key;
        if (!s3Key) continue;

        console.log(
          `[stlWorker] Processing draft ${draft._id}, file ${caseInfo.file.originalName}`
        );

        try {
          const buffer = await getObjectBufferFromS3(s3Key);

          const form = new FormData();
          form.append("file", buffer, {
            filename: caseInfo.file.originalName,
            contentType: "application/sla",
          });

          const response = await axios.post(
            `${RHINO_COMPUTE_BASE_URL}/api/rhino/fillhole/direct`,
            form,
            {
              headers: form.getHeaders(),
              timeout: 1000 * 60 * 5,
            }
          );

          if (response.data && response.data.ok) {
            const { maxDiameter, connectionDiameter, filledStlBase64 } =
              response.data;

            draft.caseInfos[i].maxDiameter = maxDiameter;
            draft.caseInfos[i].connectionDiameter = connectionDiameter;

            if (filledStlBase64) {
              const filledBuffer = Buffer.from(filledStlBase64, "base64");
              const originalName = caseInfo.file.originalName;
              const filledName = originalName.toLowerCase().endsWith(".stl")
                ? originalName.replace(/\.stl$/i, ".filled.stl")
                : `${originalName}.filled.stl`;

              const filledS3Key = s3Key.toLowerCase().endsWith(".stl")
                ? s3Key.replace(/\.stl$/i, ".filled.stl")
                : `${s3Key}.filled.stl`;

              await uploadFileToS3(
                filledBuffer,
                filledS3Key,
                "application/sla"
              );

              if (!fs.existsSync(STORE_OUT_DIR)) {
                fs.mkdirSync(STORE_OUT_DIR, { recursive: true });
              }
              const localOutPath = resolve(STORE_OUT_DIR, filledName);
              fs.writeFileSync(localOutPath, filledBuffer);

              // 여기서는 사용자의 요청에 따라 cam.stl을 ..._filled.stl로 대체하는 로직을 고려하여 camFile 정보 업데이트
              draft.caseInfos[i].camFile = {
                fileName: filledName,
                originalName: filledName,
                fileType: "3d_model",
                mimetype: "application/sla",
                size: filledBuffer.length,
                s3Key: filledS3Key,
                uploadedAt: new Date(),
              };

              draftUpdated = true;
            }
          }
        } catch (err) {
          console.error(
            `[stlWorker] Failed to process ${caseInfo.file?.originalName}:`,
            err.message
          );
        }
      }

      if (draftUpdated) {
        await draft.save();
        console.log(`[stlWorker] Draft ${draft._id} updated`);
      }
    }
  } catch (err) {
    console.error("[stlWorker] Error:", err);
  } finally {
    isProcessing = false;
  }
}

export function startStlWorker() {
  console.log("[worker] STL worker started");
  // 10초마다 체크
  setInterval(processFillHole, 10000);
}

export function getStlWorkerStatus() {
  return {
    isProcessing,
    lastRun: new Date().toISOString(),
  };
}
