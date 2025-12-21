import GuideProgress from "../models/guideProgress.model.js";
import User from "../models/user.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";

const normalizeTourId = (tourId) => String(tourId || "").trim();
const normalizeStepId = (stepId) => String(stepId || "").trim();

const recalcFinishedAt = (steps) => {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const allDone = steps.every((s) => s?.status === "done");
  return allDone ? new Date() : null;
};

const normalizeDigits = (input) => String(input || "").replace(/\D/g, "");

const normalizeBusinessNumber = (input) => {
  const digits = normalizeDigits(input);
  if (digits.length !== 10) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

const normalizePhoneNumber = (input) => {
  const digits = normalizeDigits(input);
  if (!digits.startsWith("0")) return "";
  if (digits.startsWith("02")) {
    if (digits.length === 9)
      return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10)
      return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return "";
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return "";
};

const isValidEmail = (input) => {
  const v = String(input || "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

const isValidAddress = (input) => String(input || "").trim().length >= 5;

const computeRequestorOnboardingDoneMap = ({ user, organization }) => {
  const done = {};

  done["requestor.account.profileImage"] = Boolean(
    String(user?.profileImage || "").trim()
  );

  const phoneVerifiedAt = user?.phoneVerifiedAt
    ? new Date(user.phoneVerifiedAt)
    : null;
  const phoneSentAt = user?.phoneVerification?.sentAt
    ? new Date(user.phoneVerification.sentAt)
    : null;

  done["requestor.phone.number"] = Boolean(phoneVerifiedAt || phoneSentAt);
  done["requestor.phone.code"] = Boolean(phoneVerifiedAt);

  done["requestor.business.licenseUpload"] = Boolean(
    String(organization?.businessLicense?.s3Key || "").trim() ||
      String(organization?.businessLicense?.originalName || "").trim() ||
      String(organization?.businessLicense?.fileId || "").trim()
  );

  done["requestor.business.companyName"] =
    String(organization?.name || "").trim().length >= 2;

  const ex = organization?.extracted || {};
  done["requestor.business.representativeName"] =
    String(ex?.representativeName || "").trim().length >= 2;
  done["requestor.business.phoneNumber"] = Boolean(
    normalizePhoneNumber(String(ex?.phoneNumber || "").trim())
  );
  done["requestor.business.businessNumber"] = Boolean(
    normalizeBusinessNumber(String(ex?.businessNumber || "").trim())
  );
  done["requestor.business.businessType"] =
    String(ex?.businessType || "").trim().length >= 2;
  done["requestor.business.businessItem"] =
    String(ex?.businessItem || "").trim().length >= 2;
  done["requestor.business.email"] = isValidEmail(
    String(ex?.email || "").trim()
  );
  done["requestor.business.address"] = isValidAddress(
    String(ex?.address || "").trim()
  );

  return done;
};

export async function getGuideProgress(req, res) {
  try {
    const tourId = normalizeTourId(req.params?.tourId);
    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId가 필요합니다.",
      });
    }

    const doc = await GuideProgress.ensureForUser(req.user._id, tourId);

    if (tourId === "requestor-onboarding") {
      const user = await User.findById(req.user._id)
        .select({
          profileImage: 1,
          phoneVerifiedAt: 1,
          phoneVerification: 1,
          organizationId: 1,
        })
        .lean();

      let organization = null;
      if (user?.organizationId) {
        organization = await RequestorOrganization.findById(user.organizationId)
          .select({ name: 1, extracted: 1, businessLicense: 1 })
          .lean();
      }

      const doneMap = computeRequestorOnboardingDoneMap({ user, organization });
      const defaultSteps = GuideProgress.getDefaultSteps(tourId);
      const prevSteps = Array.isArray(doc.steps) ? doc.steps : [];

      const nextSteps = defaultSteps.map((s) => {
        const stepId = String(s?.stepId || "").trim();
        const prev = prevSteps.find(
          (p) => String(p?.stepId || "").trim() === stepId
        );
        const isDone = Boolean(doneMap[stepId]);
        return {
          stepId,
          status: isDone ? "done" : "pending",
          doneAt: isDone ? prev?.doneAt || new Date() : null,
        };
      });

      const nextFinishedAt = recalcFinishedAt(nextSteps);
      doc.steps = nextSteps;
      doc.finishedAt = nextFinishedAt ? doc.finishedAt || nextFinishedAt : null;
      await doc.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        tourId: doc.tourId,
        steps: doc.steps || [],
        finishedAt: doc.finishedAt || null,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "가이드 진행 상태 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function patchGuideStep(req, res) {
  try {
    const tourId = normalizeTourId(req.params?.tourId);
    const stepId = normalizeStepId(req.params?.stepId);
    const done = Boolean(req.body?.done);

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId가 필요합니다.",
      });
    }

    if (!stepId) {
      return res.status(400).json({
        success: false,
        message: "stepId가 필요합니다.",
      });
    }

    const defaultSteps = GuideProgress.getDefaultSteps(tourId);
    const allowed = new Set(
      defaultSteps.map((s) => String(s?.stepId || "").trim()).filter(Boolean)
    );

    if (allowed.size > 0 && !allowed.has(stepId)) {
      return res.status(400).json({
        success: false,
        message: "허용되지 않은 stepId 입니다.",
      });
    }

    const doc = await GuideProgress.ensureForUser(req.user._id, tourId);

    const steps = Array.isArray(doc.steps) ? doc.steps : [];
    const idx = steps.findIndex((s) => s?.stepId === stepId);

    if (idx < 0) {
      steps.push({
        stepId,
        status: done ? "done" : "pending",
        doneAt: done ? new Date() : null,
      });
    } else {
      const existing = steps[idx];
      existing.status = done ? "done" : "pending";
      existing.doneAt = done ? existing.doneAt || new Date() : null;
    }

    const normalizedSteps =
      allowed.size > 0
        ? defaultSteps.map((s) => {
            const id = String(s?.stepId || "").trim();
            const found = steps.find(
              (p) => String(p?.stepId || "").trim() === id
            );
            return {
              stepId: id,
              status: String(found?.status || "pending"),
              doneAt:
                found?.status === "done" ? found?.doneAt || new Date() : null,
            };
          })
        : steps;

    doc.steps = normalizedSteps;
    doc.finishedAt = recalcFinishedAt(normalizedSteps);
    await doc.save();

    return res.status(200).json({
      success: true,
      data: {
        tourId: doc.tourId,
        steps: doc.steps || [],
        finishedAt: doc.finishedAt || null,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "가이드 스텝 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function resetGuideProgress(req, res) {
  try {
    const tourId = normalizeTourId(req.params?.tourId);
    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId가 필요합니다.",
      });
    }

    const doc = await GuideProgress.ensureForUser(req.user._id, tourId);
    doc.steps = GuideProgress.getDefaultSteps(tourId);
    doc.finishedAt = null;
    await doc.save();

    return res.status(200).json({
      success: true,
      data: {
        tourId: doc.tourId,
        steps: doc.steps || [],
        finishedAt: doc.finishedAt || null,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "가이드 진행 상태 초기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
