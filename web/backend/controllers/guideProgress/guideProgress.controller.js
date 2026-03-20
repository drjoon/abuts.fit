import GuideProgress from "../../models/guideProgress.model.js";
import { emitAppEventToUser } from "../../socket.js";

const GUIDE_PROGRESS_EVENT = "guide-progress:updated";
const __guideProgressCache = new Map();
const __guideProgressInFlight = new Map();

const getGuideProgressCacheValue = (key) => {
  const hit = __guideProgressCache.get(key);
  if (!hit) return null;
  if (typeof hit.expiresAt !== "number" || hit.expiresAt <= Date.now()) {
    __guideProgressCache.delete(key);
    return null;
  }
  return hit.value;
};

const setGuideProgressCacheValue = (key, value, ttlMs) => {
  __guideProgressCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

const clearGuideProgressCacheValue = (key) => {
  __guideProgressCache.delete(key);
};

const withGuideProgressInFlight = async (key, factory) => {
  const existing = __guideProgressInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (__guideProgressInFlight.get(key) === promise) {
        __guideProgressInFlight.delete(key);
      }
    });

  __guideProgressInFlight.set(key, promise);
  return promise;
};

const emitGuideProgressUpdated = (userId, doc) => {
  const uid = String(userId || "").trim();
  if (!uid || !doc) return;

  emitAppEventToUser(uid, GUIDE_PROGRESS_EVENT, {
    tourId: doc.tourId,
    steps: doc.steps || [],
    finishedAt: doc.finishedAt || null,
    updatedAt: doc.updatedAt,
  });
};

const normalizeTourId = (tourId) => String(tourId || "").trim();
const normalizeStepId = (stepId) => String(stepId || "").trim();

const recalcFinishedAt = (steps) => {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const allDone = steps.every((s) => s?.status === "done");
  return allDone ? new Date() : null;
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

    const cacheKey = `guide-progress:${String(req.user?._id || "")}:${tourId}`;
    const cached = getGuideProgressCacheValue(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const responseData = await withGuideProgressInFlight(cacheKey, async () => {
      const doc = await GuideProgress.ensureForUser(req.user._id, tourId);

      const built = {
        tourId: doc.tourId,
        steps: doc.steps || [],
        finishedAt: doc.finishedAt || null,
        updatedAt: doc.updatedAt,
      };
      setGuideProgressCacheValue(cacheKey, built, 30 * 1000);
      return built;
    });

    return res.status(200).json({
      success: true,
      data: responseData,
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
      defaultSteps.map((s) => String(s?.stepId || "").trim()).filter(Boolean),
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
              (p) => String(p?.stepId || "").trim() === id,
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
    clearGuideProgressCacheValue(
      `guide-progress:${String(req.user?._id || "")}:${tourId}`,
    );
    emitGuideProgressUpdated(req.user?._id, doc);

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
    clearGuideProgressCacheValue(
      `guide-progress:${String(req.user?._id || "")}:${tourId}`,
    );
    emitGuideProgressUpdated(req.user?._id, doc);

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
