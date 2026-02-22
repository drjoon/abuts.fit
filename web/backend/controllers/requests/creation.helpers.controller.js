import axios from "axios";
import FormData from "form-data";
import CreditLedger from "../../models/creditLedger.model.js";

/**
 * 파일을 Rhino 서버의 1-stl 에 직접 업로드하고 즉시 처리를 시작하도록 요청하는 헬퍼
 */
export async function uploadToRhinoServer(fileBuffer, fileName) {
  try {
    const RHINO_SERVER_URL =
      process.env.RHINO_SERVER_URL ||
      process.env.RHINO_COMPUTE_BASE_URL ||
      "http://localhost:8000";
    const BRIDGE_SHARED_SECRET = String(
      process.env.BRIDGE_SHARED_SECRET || "",
    ).trim();
    const formData = new FormData();
    formData.append("file", fileBuffer, { filename: fileName });

    const response = await axios.post(
      `${RHINO_SERVER_URL}/api/rhino/upload-stl`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          ...(BRIDGE_SHARED_SECRET
            ? { "X-Bridge-Secret": BRIDGE_SHARED_SECRET }
            : {}),
        },
        timeout: 30000,
      },
    );

    if (response.data?.ok) {
      console.log(
        `[Rhino-Server] File upload successful, processing started: ${fileName}`,
      );
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[Rhino-Server] Failed to upload file: ${err.message}`);
    return false;
  }
}

/**
 * STL 파일명을 표준 형식으로 생성하는 헬퍼
 * 형식: {requestId}-{clinicName}-{patientName}-{tooth}{ext}
 */
export function buildStandardStlFileName({
  requestId,
  clinicName,
  patientName,
  tooth,
  originalFileName,
}) {
  const ext = originalFileName?.includes(".")
    ? `.${originalFileName.split(".").pop().toLowerCase()}`
    : ".stl";
  return `${requestId}-${clinicName}-${patientName}-${tooth}${ext}`;
}

/**
 * S3에서 파일을 다운로드하여 Rhino 서버의 1-stl 에 직접 업로드하는 헬퍼
 */
export async function uploadS3ToRhinoServer(s3Url, fileName) {
  try {
    const s3Utils = (await import("../../utils/s3.utils.js")).default;
    const buffer = await s3Utils.getObjectBufferFromS3(s3Url);
    if (buffer) {
      await uploadToRhinoServer(buffer, fileName);
    }
  } catch (err) {
    console.error(`[Rhino-Server] Failed to upload S3 file: ${err.message}`);
  }
}

export async function getOrganizationCreditBalanceBreakdown({
  organizationId,
  session,
}) {
  const rows = await CreditLedger.find({ organizationId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1 })
    .session(session || null)
    .lean();

  let paid = 0;
  let bonus = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);
    if (!Number.isFinite(amount)) continue;

    if (type === "CHARGE") {
      paid += amount;
      continue;
    }
    if (type === "BONUS") {
      bonus += amount;
      continue;
    }
    if (type === "REFUND") {
      paid += amount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = Math.abs(amount);
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidBalance = Math.max(0, Math.round(paid));
  const bonusBalance = Math.max(0, Math.round(bonus));
  return {
    balance: paidBalance + bonusBalance,
    paidBalance,
    bonusBalance,
  };
}

export const isDuplicateKeyError = (err) => {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
};
