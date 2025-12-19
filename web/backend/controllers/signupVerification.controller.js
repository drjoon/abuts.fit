import crypto from "crypto";
import AWS from "aws-sdk";
import { SolapiMessageService } from "solapi";
import SignupVerification from "../models/signupVerification.model.js";
import User from "../models/user.model.js";

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const normalizePhone = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return { digits: "", e164: "" };

  if (s.startsWith("+")) {
    const e164 = s.replace(/\s+/g, "");
    if (!e164.startsWith("+82")) return { digits: "", e164: "" };
    const rest = e164.slice(3).replace(/\D/g, "").slice(0, 10);
    const digits = rest ? `0${rest}` : "";
    return { digits, e164: rest ? `+82${rest}` : "" };
  }

  const digits = s.replace(/\D/g, "").slice(0, 11);
  if (!/^\d{10,11}$/.test(digits)) return { digits, e164: "" };
  if (!digits.startsWith("0")) return { digits, e164: "" };

  return { digits, e164: `+82${digits.slice(1)}` };
};

const isProd = () => process.env.NODE_ENV === "production";

const nowMs = () => Date.now();

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const ensureVerificationDoc = async ({ channel, target, phoneE164 }) => {
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

    if (phoneE164 && channel === "phone") {
      updateOps.$set = { phoneE164 };
    } else if (channel === "phone") {
      updateOps.$setOnInsert.phoneE164 = "";
    }

    console.log("[ensureVerificationDoc] query:", {
      purpose: "signup",
      channel,
      target,
    });
    console.log(
      "[ensureVerificationDoc] updateOps:",
      JSON.stringify(updateOps)
    );

    const doc = await SignupVerification.findOneAndUpdate(
      { purpose: "signup", channel, target },
      updateOps,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    console.log("[ensureVerificationDoc] result:", doc);
    return doc;
  } catch (err) {
    console.error("[ensureVerificationDoc] error:", err.message);
    throw err;
  }
};

const canSend = ({ existing, now, channel }) => {
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const prevDailyKey = String(existing?.dailySendDate || "");
  const prevDailyCountRaw = existing?.dailySendCount;
  const prevDailyCount =
    typeof prevDailyCountRaw === "number" && Number.isFinite(prevDailyCountRaw)
      ? prevDailyCountRaw
      : 0;

  const nextDailyCount = prevDailyKey === todayKey ? prevDailyCount : 0;

  if (channel === "phone" && nextDailyCount >= 3) {
    return {
      ok: false,
      status: 429,
      message:
        "오늘 인증번호 발송 횟수를 초과했습니다. 내일 다시 시도해주세요.",
    };
  }

  const lastSentAt = existing?.sentAt ? new Date(existing.sentAt).getTime() : 0;
  if (lastSentAt && now - lastSentAt < 30_000) {
    return { ok: false, status: 429, message: "잠시 후 다시 시도해주세요." };
  }

  return { ok: true, todayKey, nextDailyCount };
};

const updateSendState = async ({
  channel,
  target,
  phoneE164,
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
        ...(phoneE164 ? { phoneE164 } : {}),
        codeHash,
        expiresAt,
        sentAt,
        dailySendDate: todayKey,
        dailySendCount: nextDailyCount + 1,
        attempts: 0,
        verifiedAt: null,
      },
    }
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

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = sha256(code);
    const expiresAt = new Date(now + 5 * 60_000);
    const sentAt = new Date(now);

    await updateSendState({
      channel: "email",
      target: email,
      codeHash,
      expiresAt,
      sentAt,
      todayKey: gate.todayKey,
      nextDailyCount: gate.nextDailyCount,
    });

    const devLogCode = !isProd() && process.env.EMAIL_DEV_LOG_CODE !== "false";
    const devExposeCode =
      !isProd() && process.env.EMAIL_DEV_EXPOSE_CODE !== "false";

    if (isProd()) {
      const from = String(process.env.SES_FROM || "").trim();
      const region =
        String(process.env.AWS_REGION || "").trim() || "ap-northeast-2";

      if (!from) {
        return res.status(500).json({
          success: false,
          message: "이메일 발송 설정이 누락되었습니다.",
        });
      }

      const ses = new AWS.SES({ region });
      const subject = "[abuts.fit] 이메일 인증번호";
      const text = `인증번호: ${code}\n\n5분 이내에 입력해주세요.`;

      await ses
        .sendEmail({
          Source: from,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } },
          },
        })
        .promise();
    } else {
      if (devLogCode)
        console.log("[email-dev] signup verification", { email, code });
      else console.log("[email-dev] signup verification", { email });
    }

    return res.status(200).json({
      success: true,
      data: {
        expiresAt,
        ...(devExposeCode ? { devCode: code } : {}),
      },
    });
  } catch (error) {
    console.error("[sendSignupEmailVerification] failed", error);
    return res.status(500).json({
      success: false,
      message: "이메일 인증번호 발송 중 오류가 발생했습니다.",
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
        .json({ success: false, message: "이메일을 입력해주세요." });
    }

    if (!/^\d{4,8}$/.test(code)) {
      return res
        .status(400)
        .json({ success: false, message: "인증번호는 4~8자리 숫자입니다." });
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
        message: "인증번호가 만료되었습니다. 다시 발송해주세요.",
      });
    }

    const attempts = typeof doc.attempts === "number" ? doc.attempts : 0;
    if (attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const codeHash = sha256(code);
    if (codeHash !== doc.codeHash) {
      await SignupVerification.updateOne(
        { _id: doc._id },
        { $set: { attempts: attempts + 1 } }
      );
      return res
        .status(400)
        .json({ success: false, message: "인증번호가 올바르지 않습니다." });
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
        },
      }
    );

    return res.status(200).json({ success: true, data: { verifiedAt } });
  } catch (error) {
    console.error("[verifySignupEmailVerification] failed", error);
    return res.status(500).json({
      success: false,
      message: "이메일 인증번호 확인 중 오류가 발생했습니다.",
    });
  }
}

export async function sendSignupPhoneVerification(req, res) {
  try {
    const { digits, e164 } = normalizePhone(req.body?.phoneNumber);
    if (!e164 || !e164.startsWith("+82")) {
      return res.status(400).json({
        success: false,
        message: "현재는 국내(+82) 번호만 지원합니다.",
      });
    }

    if (!/^\d{10,11}$/.test(digits)) {
      return res
        .status(400)
        .json({ success: false, message: "전화번호 형식을 확인해주세요." });
    }

    const existingUser = await User.findOne({
      phoneNumber: digits,
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (existingUser?._id) {
      return res
        .status(400)
        .json({ success: false, message: "이미 등록된 전화번호입니다." });
    }

    const target = digits;
    const existing = await ensureVerificationDoc({
      channel: "phone",
      target,
      phoneE164: e164,
    });
    const now = nowMs();
    const gate = canSend({ existing, now, channel: "phone" });
    if (!gate.ok) {
      return res
        .status(gate.status)
        .json({ success: false, message: gate.message });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = sha256(code);
    const expiresAt = new Date(now + 5 * 60_000);
    const sentAt = new Date(now);

    await updateSendState({
      channel: "phone",
      target,
      phoneE164: e164,
      codeHash,
      expiresAt,
      sentAt,
      todayKey: gate.todayKey,
      nextDailyCount: gate.nextDailyCount,
    });

    const devLogCode = !isProd() && process.env.SMS_DEV_LOG_CODE !== "false";
    const devExposeCode =
      !isProd() && process.env.SMS_DEV_EXPOSE_CODE !== "false";

    if (isProd()) {
      const apiKey = String(process.env.SOLAPI_API_KEY || "").trim();
      const apiSecret = String(process.env.SOLAPI_API_SECRET || "").trim();
      const from = String(process.env.SOLAPI_FROM || "").trim();

      if (!apiKey || !apiSecret || !from) {
        return res.status(500).json({
          success: false,
          message: "문자 발송 설정이 누락되었습니다.",
        });
      }

      const to = `0${e164.slice(3)}`;
      const text = `[abuts.fit] 인증번호: ${code}`;

      try {
        const messageService = new SolapiMessageService(apiKey, apiSecret);
        await messageService.send({ to, from, text });
      } catch (sendError) {
        console.error("[sms] signup phone verification send failed", {
          phoneNumber: e164,
          message: sendError?.message,
        });

        await SignupVerification.updateOne(
          { purpose: "signup", channel: "phone", target },
          {
            $set: {
              codeHash: null,
              expiresAt: null,
              sentAt: null,
              dailySendDate: gate.todayKey,
              dailySendCount: gate.nextDailyCount,
              attempts: 0,
            },
          }
        );

        return res
          .status(500)
          .json({ success: false, message: "인증번호 발송에 실패했습니다." });
      }
    } else {
      if (devLogCode)
        console.log("[sms-dev] signup phone verification", {
          phoneNumber: e164,
          code,
        });
      else
        console.log("[sms-dev] signup phone verification", {
          phoneNumber: e164,
        });
    }

    return res.status(200).json({
      success: true,
      data: {
        expiresAt,
        ...(devExposeCode ? { devCode: code } : {}),
      },
    });
  } catch (error) {
    console.error("[sendSignupPhoneVerification] failed", error);
    return res.status(500).json({
      success: false,
      message: "인증번호 발송 중 오류가 발생했습니다.",
    });
  }
}

export async function verifySignupPhoneVerification(req, res) {
  try {
    const { digits, e164 } = normalizePhone(req.body?.phoneNumber);
    const code = String(req.body?.code || "").trim();

    if (!digits || !e164) {
      return res
        .status(400)
        .json({ success: false, message: "전화번호를 확인해주세요." });
    }

    if (!/^\d{4,8}$/.test(code)) {
      return res
        .status(400)
        .json({ success: false, message: "인증번호는 4~8자리 숫자입니다." });
    }

    const doc = await SignupVerification.findOne({
      purpose: "signup",
      channel: "phone",
      target: digits,
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
        message: "인증번호가 만료되었습니다. 다시 발송해주세요.",
      });
    }

    const attempts = typeof doc.attempts === "number" ? doc.attempts : 0;
    if (attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const codeHash = sha256(code);
    if (codeHash !== doc.codeHash) {
      await SignupVerification.updateOne(
        { _id: doc._id },
        { $set: { attempts: attempts + 1 } }
      );
      const remainingAttempts = 5 - (attempts + 1);
      return res.status(400).json({
        success: false,
        message: `인증번호가 일치하지 않습니다. (남은 시도: ${remainingAttempts}회)`,
      });
    }

    const verifiedAt = new Date(now);
    await SignupVerification.updateOne(
      { _id: doc._id },
      {
        $set: {
          verifiedAt,
          phoneE164: doc.phoneE164 || e164,
          codeHash: null,
          expiresAt: null,
          sentAt: null,
          attempts: 0,
        },
      }
    );

    return res.status(200).json({
      success: true,
      data: { verifiedAt, phoneE164: doc.phoneE164 || e164 },
    });
  } catch (error) {
    console.error("[verifySignupPhoneVerification] failed", error);
    return res.status(500).json({
      success: false,
      message: "인증번호 확인 중 오류가 발생했습니다.",
    });
  }
}

export async function consumeSignupVerifications({
  email,
  phoneDigits,
  userId,
}) {
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
    }
  );

  await SignupVerification.updateOne(
    {
      purpose: "signup",
      channel: "phone",
      target: phoneDigits,
      verifiedAt: { $ne: null },
      consumedAt: null,
    },
    {
      $set: {
        consumedAt: now,
        consumedByUserId: userId,
      },
    }
  );
}

export async function assertSignupVerifications({ email, phoneDigits }) {
  const [emailDoc, phoneDoc] = await Promise.all([
    SignupVerification.findOne({
      purpose: "signup",
      channel: "email",
      target: email,
      verifiedAt: { $ne: null },
      consumedAt: null,
    })
      .select({ _id: 1 })
      .lean(),
    SignupVerification.findOne({
      purpose: "signup",
      channel: "phone",
      target: phoneDigits,
      verifiedAt: { $ne: null },
      consumedAt: null,
    })
      .select({ _id: 1 })
      .lean(),
  ]);

  return Boolean(emailDoc?._id && phoneDoc?._id);
}
