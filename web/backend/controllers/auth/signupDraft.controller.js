// related files:
// - web/backend/rules.md
// - web/backend/models/signupDraft.model.js
// - web/backend/modules/auth/auth.routes.js
// - web/frontend/src/features/auth/SignupPage.tsx
import SignupDraft from "../../models/signupDraft.model.js";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_ROLES = new Set([
  "requestor",
  "practice",
  "salesman",
  "manufacturer",
  "admin",
  "devops",
  "labTeam",
  "salesTeam",
]);

const toSafeDraft = (doc) => {
  if (!doc) return null;
  const row = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    sessionId: String(row.sessionId || ""),
    path: String(row.path || "/signup"),
    wizardStep: [1, 2, 3, 4].includes(Number(row.wizardStep))
      ? Number(row.wizardStep)
      : 1,
    signupRole: ALLOWED_ROLES.has(String(row.signupRole || ""))
      ? String(row.signupRole)
      : "requestor",
    enteredReferralCode: String(row.enteredReferralCode || "").trim() || undefined,
    selectedMethod: String(row.selectedMethod || "") === "email" ? "email" : null,
    emailVerificationSent: Boolean(row.emailVerificationSent),
    lastEmailVerificationSentAt: row.lastEmailVerificationSentAt
      ? new Date(row.lastEmailVerificationSentAt).toISOString()
      : null,
    name: String(row.name || ""),
    email: String(row.email || "").trim().toLowerCase(),
    password: String(row.password || ""),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
};

/**
 * 회원가입 중간 상태 저장
 * @route PUT /api/auth/signup/draft
 */
export async function upsertSignupDraft(req, res) {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId || sessionId.length < 8 || sessionId.length > 120) {
      return res.status(400).json({
        success: false,
        message: "sessionId가 올바르지 않습니다.",
      });
    }

    const wizardStep = Number(req.body?.wizardStep);
    const signupRole = String(req.body?.signupRole || "requestor").trim();
    const path = String(req.body?.path || "/signup").trim() || "/signup";
    const enteredReferralCode = String(
      req.body?.enteredReferralCode || "",
    ).trim();
    const selectedMethod =
      req.body?.selectedMethod === "email" ? "email" : "";
    const emailVerificationSent = Boolean(req.body?.emailVerificationSent);
    const lastRaw = req.body?.lastEmailVerificationSentAt;
    const lastEmailVerificationSentAt = lastRaw ? new Date(lastRaw) : null;
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 200);
    const password = String(req.body?.password || "").slice(0, 200);

    const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

    const update = {
      path,
      wizardStep: [1, 2, 3, 4].includes(wizardStep) ? wizardStep : 1,
      signupRole: ALLOWED_ROLES.has(signupRole) ? signupRole : "requestor",
      enteredReferralCode,
      selectedMethod,
      emailVerificationSent,
      lastEmailVerificationSentAt:
        lastEmailVerificationSentAt &&
        !Number.isNaN(lastEmailVerificationSentAt.getTime())
          ? lastEmailVerificationSentAt
          : null,
      name,
      email,
      expiresAt,
    };

    // 비밀번호는 값이 있을 때만 갱신 (빈 값으로 덮어쓰지 않음)
    if (password) {
      update.password = password;
    }

    const doc = await SignupDraft.findOneAndUpdate(
      { sessionId },
      { $set: update, $setOnInsert: { sessionId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(200).json({
      success: true,
      data: toSafeDraft(doc),
    });
  } catch (error) {
    console.error("[signup-draft] upsert failed", error);
    return res.status(500).json({
      success: false,
      message: "가입 임시저장에 실패했습니다.",
    });
  }
}

/**
 * 회원가입 중간 상태 조회
 * @route GET /api/auth/signup/draft?sessionId=
 */
export async function getSignupDraft(req, res) {
  try {
    const sessionId = String(req.query?.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId가 필요합니다.",
      });
    }

    const doc = await SignupDraft.findOne({ sessionId }).lean();
    if (!doc) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) {
      await SignupDraft.deleteOne({ _id: doc._id });
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      data: toSafeDraft(doc),
    });
  } catch (error) {
    console.error("[signup-draft] get failed", error);
    return res.status(500).json({
      success: false,
      message: "가입 임시저장 조회에 실패했습니다.",
    });
  }
}

/**
 * 회원가입 중간 상태 삭제
 * @route DELETE /api/auth/signup/draft
 */
export async function deleteSignupDraft(req, res) {
  try {
    const sessionId = String(
      req.body?.sessionId || req.query?.sessionId || "",
    ).trim();
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId가 필요합니다.",
      });
    }

    await SignupDraft.deleteOne({ sessionId });
    return res.status(200).json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error("[signup-draft] delete failed", error);
    return res.status(500).json({
      success: false,
      message: "가입 임시저장 삭제에 실패했습니다.",
    });
  }
}

export async function deleteSignupDraftBySessionId(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return;
  try {
    await SignupDraft.deleteOne({ sessionId: id });
  } catch (error) {
    console.error("[signup-draft] deleteBySession failed", error);
  }
}
