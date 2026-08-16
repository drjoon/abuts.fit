// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/jobs/labAutoMatchParticipationBillingWorker.js
// - web/backend/utils/abutsLabCertification.js
// - web/frontend/src/features/settings/tabs/LabAutoMatchParticipationTab.tsx
// change-log:
// - 2026-08-14: 기공소 자동 매칭 월 참여(구독). 활성 시 practiceTransferAutoMatchEnabled=true.
// - 2026-08-16: 인증 신청·테스트 통과 후 풀 참여. 기공소 즉시 ON 금지.
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  addCalendarMonthsKst,
  resolveNextBillingAt,
} from "./practiceMembership.service.js";
import {
  ABUTS_LAB_CERT_STATUS,
  ABUTS_LAB_TEST_STATUS,
  buildCertificationApplySet,
  buildCertificationPassedFields,
  buildCertificationRejectedFields,
  buildCertificationTestingSet,
  canLabApplyAbutsCertification,
  isAbutsLabCertificationCertified,
  normalizeAbutsLabCertMemo,
  normalizeAbutsLabCertStatus,
  normalizeAbutsLabTestStatus,
  toAbutsLabCertificationApi,
} from "../utils/abutsLabCertification.js";

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function buildAutoMatchJoinSet(now = new Date()) {
  return {
    practiceTransferAutoMatchEnabled: true,
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationCanceledAt: null,
    autoMatchParticipationStartedAt: now,
    autoMatchParticipationNextBillingAt: addCalendarMonthsKst(now, 1),
    ...buildCertificationPassedFields(now),
  };
}

export function buildAutoMatchResumeSet() {
  return {
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationCanceledAt: null,
  };
}

export function buildAutoMatchCancelSet({
  nextBillingAt,
  startedAt,
  now = new Date(),
} = {}) {
  const existing = toDate(nextBillingAt);
  return {
    autoMatchParticipationCancelAtPeriodEnd: true,
    autoMatchParticipationCanceledAt: now,
    autoMatchParticipationNextBillingAt:
      existing || resolveNextBillingAt({ from: startedAt || now, now }),
  };
}

export function buildAutoMatchExpireSet() {
  return {
    practiceTransferAutoMatchEnabled: false,
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationNextBillingAt: null,
  };
}

export function autoMatchParticipationResponseFields(anchor) {
  const active = Boolean(anchor?.practiceTransferAutoMatchEnabled);
  return {
    practiceTransferAutoMatchEnabled: active,
    autoMatchParticipationActive: active,
    autoMatchParticipationCancelAtPeriodEnd: Boolean(
      anchor?.autoMatchParticipationCancelAtPeriodEnd,
    ),
    autoMatchParticipationNextBillingAt: anchor?.autoMatchParticipationNextBillingAt
      ? new Date(anchor.autoMatchParticipationNextBillingAt).toISOString()
      : null,
    abutsLabCertification: toAbutsLabCertificationApi(anchor),
  };
}

async function persist(anchorId, set) {
  await BusinessAnchor.updateOne({ _id: anchorId }, { $set: set });
  const { invalidateMyBusinessCache } = await import(
    "../controllers/businesses/business.controller.js"
  );
  invalidateMyBusinessCache(anchorId);
  return BusinessAnchor.findById(anchorId).lean();
}

/** 기공소 인증 신청(미신청·반려만). 풀 ON은 하지 않음. */
export async function applyAbutsLabCertification(
  anchor,
  { now = new Date() } = {},
) {
  if (!canLabApplyAbutsCertification(anchor)) {
    return { anchor, applied: false };
  }
  const next = await persist(anchor._id, buildCertificationApplySet(now));
  return { anchor: next, applied: true };
}

export async function applyAutoMatchParticipationJoin(
  anchor,
  { now = new Date() } = {},
) {
  if (!isAbutsLabCertificationCertified(anchor)) {
    return anchor;
  }
  if (anchor.practiceTransferAutoMatchEnabled) {
    if (anchor.autoMatchParticipationCancelAtPeriodEnd) {
      return persist(anchor._id, buildAutoMatchResumeSet());
    }
    return anchor;
  }
  return persist(anchor._id, {
    practiceTransferAutoMatchEnabled: true,
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationCanceledAt: null,
    autoMatchParticipationStartedAt: now,
    autoMatchParticipationNextBillingAt: addCalendarMonthsKst(now, 1),
  });
}

export async function applyAutoMatchParticipationCancel(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor.practiceTransferAutoMatchEnabled) {
    return { anchor, expiredNow: false };
  }
  const canceled = await persist(
    anchor._id,
    buildAutoMatchCancelSet({
      nextBillingAt: anchor.autoMatchParticipationNextBillingAt,
      startedAt: anchor.autoMatchParticipationStartedAt,
      now,
    }),
  );
  const processed = await processDueAutoMatchParticipation(canceled, { now });
  return {
    anchor: processed.anchor || canceled,
    expiredNow: Boolean(processed.expired),
  };
}

export async function applyAutoMatchParticipationForceOff(anchor) {
  if (
    !anchor?.practiceTransferAutoMatchEnabled &&
    !anchor?.autoMatchParticipationCancelAtPeriodEnd
  ) {
    return anchor;
  }
  return persist(anchor._id, {
    ...buildAutoMatchExpireSet(),
    autoMatchParticipationCanceledAt: new Date(),
  });
}

export async function applyAutoMatchParticipationForceOn(
  anchor,
  { now = new Date() } = {},
) {
  if (
    anchor?.practiceTransferAutoMatchEnabled &&
    !anchor?.autoMatchParticipationCancelAtPeriodEnd
  ) {
    const cert = toAbutsLabCertificationApi(anchor);
    if (
      cert.status === ABUTS_LAB_CERT_STATUS.CERTIFIED &&
      normalizeAbutsLabCertStatus(anchor?.abutsLabCertification?.status) ===
        ABUTS_LAB_CERT_STATUS.NONE
    ) {
      return persist(anchor._id, buildCertificationPassedFields(now));
    }
    return anchor;
  }
  if (anchor?.practiceTransferAutoMatchEnabled) {
    return persist(anchor._id, {
      ...buildAutoMatchResumeSet(),
      ...buildCertificationPassedFields(now),
    });
  }
  return persist(anchor._id, buildAutoMatchJoinSet(now));
}

/**
 * 관리자 인증 필드 패치.
 * enabled / status / testStatus / memo 조합.
 */
export async function applyAdminAbutsLabCertificationPatch(
  anchor,
  {
    enabled,
    status,
    testStatus,
    memo,
    now = new Date(),
  } = {},
) {
  const set = {};
  const hasEnabled = typeof enabled === "boolean";
  const hasStatus = status != null && String(status).trim() !== "";
  const hasTest = testStatus != null && String(testStatus).trim() !== "";
  const hasMemo = memo !== undefined;

  if (hasMemo) {
    set["abutsLabCertification.memo"] = normalizeAbutsLabCertMemo(memo);
  }

  let nextStatus = hasStatus ? normalizeAbutsLabCertStatus(status) : null;
  let nextTest = hasTest ? normalizeAbutsLabTestStatus(testStatus) : null;

  if (hasEnabled && enabled === true) {
    nextStatus = ABUTS_LAB_CERT_STATUS.CERTIFIED;
    nextTest = ABUTS_LAB_TEST_STATUS.PASSED;
  } else if (hasEnabled && enabled === false) {
    if (!nextStatus || nextStatus === ABUTS_LAB_CERT_STATUS.CERTIFIED) {
      nextStatus = ABUTS_LAB_CERT_STATUS.REJECTED;
    }
    if (!nextTest || nextTest === ABUTS_LAB_TEST_STATUS.PASSED) {
      nextTest = ABUTS_LAB_TEST_STATUS.FAILED;
    }
  }

  if (nextTest === ABUTS_LAB_TEST_STATUS.PASSED) {
    nextStatus = ABUTS_LAB_CERT_STATUS.CERTIFIED;
  } else if (nextTest === ABUTS_LAB_TEST_STATUS.FAILED) {
    nextStatus = ABUTS_LAB_CERT_STATUS.REJECTED;
  } else if (nextTest === ABUTS_LAB_TEST_STATUS.PENDING && !nextStatus) {
    nextStatus = ABUTS_LAB_CERT_STATUS.TESTING;
  }

  if (nextStatus === ABUTS_LAB_CERT_STATUS.TESTING) {
    Object.assign(set, buildCertificationTestingSet(now));
  } else if (nextStatus === ABUTS_LAB_CERT_STATUS.CERTIFIED) {
    Object.assign(set, buildCertificationPassedFields(now));
  } else if (nextStatus === ABUTS_LAB_CERT_STATUS.REJECTED) {
    Object.assign(
      set,
      buildCertificationRejectedFields({
        testStatus: nextTest || ABUTS_LAB_TEST_STATUS.FAILED,
        now,
      }),
    );
  } else if (nextStatus === ABUTS_LAB_CERT_STATUS.APPLIED) {
    Object.assign(set, buildCertificationApplySet(now));
  } else if (nextStatus === ABUTS_LAB_CERT_STATUS.NONE) {
    set["abutsLabCertification.status"] = ABUTS_LAB_CERT_STATUS.NONE;
    set["abutsLabCertification.testStatus"] = ABUTS_LAB_TEST_STATUS.NONE;
  } else if (nextTest) {
    set["abutsLabCertification.testStatus"] = nextTest;
    if (nextTest === ABUTS_LAB_TEST_STATUS.PENDING) {
      set["abutsLabCertification.testedAt"] = now;
    }
  }

  const shouldEnable =
    nextStatus === ABUTS_LAB_CERT_STATUS.CERTIFIED ||
    (hasEnabled && enabled === true);
  const shouldDisable =
    nextStatus === ABUTS_LAB_CERT_STATUS.REJECTED ||
    nextStatus === ABUTS_LAB_CERT_STATUS.NONE ||
    nextStatus === ABUTS_LAB_CERT_STATUS.APPLIED ||
    nextStatus === ABUTS_LAB_CERT_STATUS.TESTING ||
    (hasEnabled && enabled === false);

  let next = anchor;
  if (shouldEnable) {
    next = await applyAutoMatchParticipationForceOn(anchor, { now });
    if (Object.keys(set).length > 0) {
      next = await persist(next._id, set);
    }
    return next;
  }
  if (shouldDisable) {
    next = await applyAutoMatchParticipationForceOff(anchor);
    if (Object.keys(set).length > 0) {
      next = await persist(next._id, set);
    }
    return next;
  }
  if (Object.keys(set).length === 0) return anchor;
  return persist(anchor._id, set);
}

export async function processDueAutoMatchParticipation(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor?.practiceTransferAutoMatchEnabled) {
    return { anchor, expired: false, renewed: false };
  }
  const dueAt = toDate(anchor.autoMatchParticipationNextBillingAt);
  if (!dueAt || dueAt.getTime() > now.getTime()) {
    return { anchor, expired: false, renewed: false };
  }
  if (anchor.autoMatchParticipationCancelAtPeriodEnd) {
    const expired = await persist(anchor._id, buildAutoMatchExpireSet());
    return { anchor: expired, expired: true, renewed: false, charged: false };
  }
  let nextBillingAt = dueAt;
  let guard = 0;
  while (nextBillingAt.getTime() <= now.getTime() && guard < 120) {
    nextBillingAt = addCalendarMonthsKst(nextBillingAt, 1);
    guard += 1;
  }
  const renewed = await persist(anchor._id, {
    autoMatchParticipationNextBillingAt: nextBillingAt,
  });
  return {
    anchor: renewed,
    expired: false,
    renewed: true,
    charged: false,
  };
}

export async function processDueAutoMatchParticipations({
  now = new Date(),
} = {}) {
  const due = await BusinessAnchor.find({
    practiceTransferAutoMatchEnabled: true,
    autoMatchParticipationNextBillingAt: { $lte: now },
  })
    .select({
      practiceTransferAutoMatchEnabled: 1,
      autoMatchParticipationCancelAtPeriodEnd: 1,
      autoMatchParticipationNextBillingAt: 1,
      autoMatchParticipationStartedAt: 1,
    })
    .lean();

  let expired = 0;
  let renewed = 0;
  for (const row of due) {
    const result = await processDueAutoMatchParticipation(row, { now });
    if (result.expired) expired += 1;
    if (result.renewed) renewed += 1;
  }
  return { due: due.length, expired, renewed };
}
