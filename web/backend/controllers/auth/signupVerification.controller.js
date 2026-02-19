import crypto from "crypto";
import SignupVerification from "../../models/signupVerification.model.js";
import User from "../../models/user.model.js";
import { sendEmail } from "../../utils/email.util.js";
import { toKstYmd } from "../../utils/krBusinessDays.js";

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const isProd = () => process.env.NODE_ENV === "production";

const nowMs = () => Date.now();

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const ensureVerificationDoc = async ({ channel, target }) => {
  try {
    const updateOps = {
      $setOnInsert: {
        purpose: "signup",
        channel,
        target,
        dailySendDate: "",
        dailySendCount: 0,
        attempts: 0,
        verifiedAt: null,
        consumedAt: null,
        consumedByUserId: null,
      },
    };

    console.log("[ensureVerificationDoc] query:", {
      purpose: "signup",
      channel,
      target,
    });
    console.log(
      "[ensureVerificationDoc] updateOps:",
      JSON.stringify(updateOps),
    );

    const doc = await SignupVerification.findOneAndUpdate(
      { purpose: "signup", channel, target },
      updateOps,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    console.log("[ensureVerificationDoc] result:", doc);
    return doc;
  } catch (err) {
    console.error("[ensureVerificationDoc] error:", err.message);
    throw err;
  }
};

const MAX_DAILY_VERIFICATION_EMAILS = 3;
const canSend = ({ existing, now, channel }) => {
  const todayKey = toKstYmd(new Date(now));
  const prevDailyKey = String(existing?.dailySendDate || "");
  const prevDailyCountRaw = existing?.dailySendCount;
  const prevDailyCount =
    typeof prevDailyCountRaw === "number" && Number.isFinite(prevDailyCountRaw)
      ? prevDailyCountRaw
      : 0;

  const nextDailyCount = prevDailyKey === todayKey ? prevDailyCount : 0;

  if (nextDailyCount >= MAX_DAILY_VERIFICATION_EMAILS) {
    return {
      ok: false,
      status: 429,
      message: `하루 ${MAX_DAILY_VERIFICATION_EMAILS}회까지만 인증 메일을 받을 수 있습니다.`,
    };
  }

  const lastSentAt = existing?.sentAt ? new Date(existing.sentAt).getTime() : 0;
  if (lastSentAt && now - lastSentAt < 30_000) {
    return { ok: false, status: 429, message: "잠시 후 다시 시도해주세요." };
  }

  return { ok: true, todayKey, nextDailyCount };
};

const getSesClient = () => {
  if (sesClient) return sesClient;

  const region =
    String(process.env.AWS_REGION || "").trim() || "ap-northeast-2";
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    process.env.AWS_SECRET_ACCESS_KEY || "",
  ).trim();
  const sessionToken = String(process.env.AWS_SESSION_TOKEN || "").trim();

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "SES 설정이 불완전합니다. AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY를 모두 설정하거나 모두 비워주세요.",
    );
  }

  sesClient = new SESv2Client({
    region,
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          },
        }
      : {}),
  });

  return sesClient;
};

const updateSendState = async ({
  channel,
  target,
  codeHash,
  expiresAt,
  sentAt,
  todayKey,
  nextDailyCount,
}) => {
  await SignupVerification.updateOne(
    { purpose: "signup", channel, target },
    {
      $set: {
        codeHash,
        expiresAt,
        sentAt,
        dailySendDate: todayKey,
        dailySendCount: nextDailyCount + 1,
        attempts: 0,
        verifiedAt: null,
        consumedAt: null,
        consumedByUserId: null,
      },
    },
  );
};

export async function sendSignupEmailVerification(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "이메일을 입력해주세요." });
    }

    const existingUser = await User.findOne({ email })
      .select({ _id: 1 })
      .lean();
    if (existingUser?._id) {
      return res
        .status(400)
        .json({ success: false, message: "이미 등록된 이메일입니다." });
    }

    const existing = await ensureVerificationDoc({
      channel: "email",
      target: email,
    });
    const now = nowMs();
    const gate = canSend({ existing, now, channel: "email" });
    if (!gate.ok) {
      return res
        .status(gate.status)
        .json({ success: false, message: gate.message });
    }

    const verificationCode = String(Math.floor(Math.random() * 10000)).padStart(
      4,
      "0",
    );
    const expiresAt = new Date(now + 10 * 60 * 1000);
    const sentAt = new Date(now);

    await updateSendState({
      channel: "email",
      target: email,
      codeHash: sha256(verificationCode),
      expiresAt,
      sentAt,
      todayKey: gate.todayKey,
      nextDailyCount: gate.nextDailyCount,
    });

    const subject = "[abuts.fit] 이메일 인증 코드";
    const html = `
      <p>안녕하세요,</p>
      <p>abuts.fit 이메일 인증을 위한 코드입니다.</p>
      <p style="font-size: 24px; font-weight: bold; color: #007bff; letter-spacing: 4px;">${verificationCode}</p>
      <p>이 코드는 10분 동안 유효합니다.</p>
      <p>감사합니다,<br>abuts.fit 팀</p>
    `;

    try {
      await sendEmail({
        to: email,
        subject,
        html,
        text: `인증 코드: ${verificationCode}\n10분 안에 입력해주세요.`,
      });
      console.log("[email-sent] signup verification", {
        email,
        verificationCode,
      });
    } catch (error) {
      console.error("[sendSignupEmailVerification] send failed", error);
      return res.status(500).json({
        success: false,
        message: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        expiresAt,
      },
    });
  } catch (error) {
    console.error("[sendSignupEmailVerification] failed", error);
    return res.status(500).json({
      success: false,
      message: "이메일 인증 발송 중 오류가 발생했습니다.",
    });
  }
}

export async function verifySignupEmailVerification(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "이메일이 필요합니다." });
    }

    if (!code || !/^\d{4}$/.test(code)) {
      return res
        .status(400)
        .json({ success: false, message: "인증 코드는 4자리 숫자입니다." });
    }

    const doc = await SignupVerification.findOne({
      purpose: "signup",
      channel: "email",
      target: email,
    }).lean();

    if (!doc?.codeHash || !doc?.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "먼저 인증번호 발송 버튼을 눌러주세요.",
      });
    }

    if (doc.verifiedAt) {
      return res
        .status(200)
        .json({ success: true, data: { verifiedAt: doc.verifiedAt } });
    }

    const expiresAt = new Date(doc.expiresAt).getTime();
    const now = nowMs();
    if (expiresAt < now) {
      return res.status(400).json({
        success: false,
        message: "인증 코드가 만료되었습니다. 다시 발송해주세요.",
      });
    }

    const attempts = typeof doc.attempts === "number" ? doc.attempts : 0;
    if (attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "시도 횟수를 초과했습니다. 인증 코드를 다시 발송해주세요.",
      });
    }

    const codeHash = sha256(code);
    if (codeHash !== doc.codeHash) {
      await SignupVerification.updateOne(
        { _id: doc._id },
        { $set: { attempts: attempts + 1 } },
      );

      const remainingAttempts = 5 - (attempts + 1);
      return res.status(400).json({
        success: false,
        message: `인증 코드가 일치하지 않습니다. (남은 시도: ${remainingAttempts}회)`,
      });
    }

    const verifiedAt = new Date(now);
    await SignupVerification.updateOne(
      { _id: doc._id },
      {
        $set: {
          verifiedAt,
          codeHash: null,
          expiresAt: null,
          sentAt: null,
          attempts: 0,
          consumedAt: null,
          consumedByUserId: null,
        },
      },
    );

    return res.status(200).json({ success: true, data: { verifiedAt } });
  } catch (error) {
    console.error("[verifySignupEmailVerification] failed", error);
    return res.status(500).json({
      success: false,
      message: "이메일 인증 중 오류가 발생했습니다.",
    });
  }
}

export async function consumeSignupVerifications({ email, userId }) {
  const now = new Date();
  await SignupVerification.updateOne(
    {
      purpose: "signup",
      channel: "email",
      target: email,
      verifiedAt: { $ne: null },
      consumedAt: null,
    },
    {
      $set: {
        consumedAt: now,
        consumedByUserId: userId,
      },
    },
  );
}

export async function assertSignupVerifications({ email }) {
  const emailDoc = await SignupVerification.findOne({
    purpose: "signup",
    channel: "email",
    target: email,
    verifiedAt: { $ne: null },
    consumedAt: null,
  })
    .select({ _id: 1 })
    .lean();

  return Boolean(emailDoc?._id);
}
