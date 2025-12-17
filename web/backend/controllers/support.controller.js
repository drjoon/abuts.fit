import { randomBytes } from "crypto";
import { uploadFileToS3 } from "../utils/s3.utils.js";

/**
 * 게스트 문의 접수 후 S3에 JSON으로 저장
 * @route POST /api/support/guest-inquiries
 */
export async function createGuestInquiry(req, res) {
  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "이름, 이메일, 문의 내용은 모두 필수입니다.",
      });
    }

    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const randomId = randomBytes(8).toString("hex");

    const payload = {
      name,
      email,
      message,
      createdAt: now.toISOString(),
      ip: req.ip,
      userAgent: req.get("user-agent") || null,
    };

    const jsonBuffer = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const key = `guest-inquiries/${y}/${m}/${d}/${Date.now()}-${randomId}.json`;

    const result = await uploadFileToS3(
      jsonBuffer,
      key,
      "application/json; charset=utf-8"
    );

    return res.status(201).json({
      success: true,
      message: "문의가 성공적으로 접수되었습니다.",
      data: {
        key: result.key || key,
        location: result.location || null,
      },
    });
  } catch (error) {
    console.error("게스트 문의 저장 중 오류:", error);
    return res.status(500).json({
      success: false,
      message: "문의 저장 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

export default {
  createGuestInquiry,
};
