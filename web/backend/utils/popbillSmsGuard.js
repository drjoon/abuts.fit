// related files:
// - web/backend/utils/popbill.util.js
// - web/backend/controllers/auth/signupVerification.controller.js
// - web/backend/controllers/users/user.controller.js
// change-log:
// - 2026-10-27: 10초 100건을 넘으면 발송을 멈추고 관리자 알림은 한 번만 표시한다.
// - 2026-10-27: 문자 5분 동일내용 차단, 수신번호 폭주·동시호출 상한, 가입 발송 IP 한도.
import crypto from "crypto";

export const SIGNUP_SMS_DAILY_MAX = 5;
export const SMS_COOLDOWN_MS = 5 * 60 * 1000;
export const SMS_DAILY_LIMIT_MESSAGE = "하루 5건까지 문자를 보낼 수 있습니다.";
export const SMS_COOLDOWN_MESSAGE =
  "문자를 보낸 뒤 5분 동안은 다시 보낼 수 없습니다.";
export const SMS_SAME_CONTENT_MESSAGE =
  "같은 내용의 문자는 5분 뒤에 다시 보낼 수 없습니다.";
export const SMS_SEND_CHUNK_SIZE = 50;
export const SMS_LOOP_ALERT_PHONE = "01090744656";
export const SMS_URGENT_HOURLY_MAX = 10;
export const SMS_URGENT_HOURLY_MESSAGE =
  "한 시간에 10건까지 긴급 문자를 보낼 수 있습니다.";
export const SMS_URGENT_SAME_CONTENT_MESSAGE =
  "같은 내용의 긴급 문자는 보내지 않습니다.";

const DEFAULT_LIMITS = {
  maxInFlight: 30,
  phoneBurstMax: 3,
  phoneBurstWindowMs: 60 * 1000,
  globalMaxPerWindow: 100,
  globalWindowMs: 10 * 1000,
  signupIpDailyMax: 40,
  signupIpDistinctPhones: 10,
  signupVerifyMax: 50,
  signupVerifyWindowMs: 10 * 60 * 1000,
  actorHourlyMax: SMS_URGENT_HOURLY_MAX,
  actorWindowMs: 60 * 60 * 1000,
};

let limits = { ...DEFAULT_LIMITS };

const contentUntil = new Map();
const inFlightKeys = new Set();
const phoneBursts = new Map();
const globalStamps = [];
const signupIpDay = new Map();
const signupVerifyStamps = new Map();
const actorStamps = new Map();
const ephemeralPhoneSms = new Map();
let inFlightCalls = 0;
let loopAlertSentAt = 0;

export class PopbillSmsGuardError extends Error {
  constructor(message, code, retryAfterSec = 0) {
    super(message);
    this.name = "PopbillSmsGuardError";
    this.code = code;
    this.retryAfterSec = retryAfterSec;
    this.statusCode = 429;
  }
}

export function isPopbillSmsGuardError(error) {
  return error instanceof PopbillSmsGuardError || error?.name === "PopbillSmsGuardError";
}

export function resetPopbillSmsGuardForTests() {
  limits = { ...DEFAULT_LIMITS };
  contentUntil.clear();
  inFlightKeys.clear();
  phoneBursts.clear();
  globalStamps.length = 0;
  signupIpDay.clear();
  signupVerifyStamps.clear();
  actorStamps.clear();
  ephemeralPhoneSms.clear();
  inFlightCalls = 0;
  loopAlertSentAt = 0;
}

export function configurePopbillSmsGuardForTests(partial) {
  limits = { ...limits, ...partial };
}

export function readClientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = String(raw || "")
    .split(",")[0]
    .trim();
  return first || String(req?.ip || "").trim() || "unknown";
}

function contentKey(phone, text) {
  const hash = crypto.createHash("sha256").update(String(text)).digest("hex");
  return `${phone}|${hash}`;
}

function pruneMap(store, maxSize) {
  if (store.size <= maxSize) return;
  const overflow = store.size - maxSize;
  const keys = store.keys();
  for (let i = 0; i < overflow; i += 1) {
    const next = keys.next();
    if (next.done) break;
    store.delete(next.value);
  }
}

function stampsInWindow(stamps, now, windowMs) {
  return stamps.filter((ts) => now - ts < windowMs);
}

function rememberBurst(phone, now) {
  const prev = phoneBursts.get(phone) || [];
  const next = stampsInWindow(prev, now, limits.phoneBurstWindowMs);
  next.push(now);
  phoneBursts.set(phone, next);
  pruneMap(phoneBursts, 5000);
}

function burstCount(phone, now) {
  const stamps = stampsInWindow(phoneBursts.get(phone) || [], now, limits.phoneBurstWindowMs);
  if (stamps.length === 0) phoneBursts.delete(phone);
  else phoneBursts.set(phone, stamps);
  return stamps.length;
}

/**
 * 팝빌 호출 직전에만 쓴다.
 * 같은 번호·같은 내용은 5분, 한 번호에 짧은 시간 반복·프로세스 전체 폭주는 바로 거절한다.
 * 거절된 건은 팝빌로 나가지 않는다. 통과한 건은 호출 전에 쿨타임을 잡아 재시도 루프를 막는다.
 * @returns {{ messages: object[], release: () => void }}
 */
export function chunkSmsMessages(messages, size = SMS_SEND_CHUNK_SIZE) {
  const list = Array.isArray(messages) ? messages : [];
  const span = Math.max(1, Math.floor(Number(size) || SMS_SEND_CHUNK_SIZE));
  const chunks = [];
  for (let i = 0; i < list.length; i += span) {
    chunks.push(list.slice(i, i + span));
  }
  return chunks;
}

export function reservePopbillSmsMessages(messages, now = Date.now()) {
  const list = Array.isArray(messages) ? messages : [];
  if (inFlightCalls >= limits.maxInFlight) {
    throw new PopbillSmsGuardError(
      "문자 발송이 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.",
      "SMS_LOOP",
    );
  }

  const seen = new Set();
  const batchBurst = new Map();
  const allowed = [];

  for (const message of list) {
    const phone = String(message?.Receiver || "");
    const text = String(message?.Contents || "");
    if (!phone || !text) continue;
    const key = contentKey(phone, text);
    if (seen.has(key)) continue;
    if (inFlightKeys.has(key)) {
      throw new PopbillSmsGuardError(
        SMS_SAME_CONTENT_MESSAGE,
        "SMS_SAME_CONTENT",
        Math.ceil(SMS_COOLDOWN_MS / 1000),
      );
    }
    const until = contentUntil.get(key) || 0;
    if (until > now) {
      throw new PopbillSmsGuardError(
        SMS_SAME_CONTENT_MESSAGE,
        "SMS_SAME_CONTENT",
        Math.max(1, Math.ceil((until - now) / 1000)),
      );
    }
    const nextBurst = (batchBurst.get(phone) || 0) + burstCount(phone, now);
    if (nextBurst >= limits.phoneBurstMax) {
      throw new PopbillSmsGuardError(
        "같은 번호로 문자를 너무 자주 보냈습니다. 잠시 후 다시 시도해주세요.",
        "SMS_PHONE_BURST",
        Math.ceil(limits.phoneBurstWindowMs / 1000),
      );
    }
    seen.add(key);
    batchBurst.set(phone, (batchBurst.get(phone) || 0) + 1);
    allowed.push({ message, key, phone });
  }

  if (!allowed.length) {
    throw new PopbillSmsGuardError("수신번호/내용을 확인하세요.", "SMS_EMPTY");
  }

  const freshGlobal = globalStamps.filter((ts) => now - ts < limits.globalWindowMs);
  globalStamps.length = 0;
  globalStamps.push(...freshGlobal);
  const overGlobal = freshGlobal.length + allowed.length > limits.globalMaxPerWindow;
  if (!overGlobal && loopAlertSentAt && now - loopAlertSentAt >= limits.globalWindowMs) {
    loopAlertSentAt = 0;
  }
  if (overGlobal) {
    const alertAdmin = !loopAlertSentAt;
    if (!loopAlertSentAt) loopAlertSentAt = now;
    const error = new PopbillSmsGuardError(
      "문자 발송이 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.",
      "SMS_LOOP",
      Math.ceil(limits.globalWindowMs / 1000),
    );
    error.alertAdmin = alertAdmin;
    throw error;
  }

  inFlightCalls += 1;
  const heldKeys = [];
  for (const row of allowed) {
    inFlightKeys.add(row.key);
    heldKeys.push(row.key);
    contentUntil.set(row.key, now + SMS_COOLDOWN_MS);
    rememberBurst(row.phone, now);
    globalStamps.push(now);
  }
  pruneMap(contentUntil, 5000);

  let released = false;
  return {
    messages: allowed.map((row) => row.message),
    release() {
      if (released) return;
      released = true;
      inFlightCalls = Math.max(0, inFlightCalls - 1);
      for (const key of heldKeys) inFlightKeys.delete(key);
    },
  };
}

function touchDayBucket(ip, todayKey) {
  const key = `${todayKey}|${ip || "unknown"}`;
  let bucket = signupIpDay.get(key);
  if (!bucket || bucket.todayKey !== todayKey) {
    bucket = { todayKey, count: 0, phones: new Set(), at: Date.now() };
    signupIpDay.set(key, bucket);
  }
  pruneMap(signupIpDay, 2000);
  return bucket;
}

/** 가입 문자. 번호 한도와 별도로 IP당 하루 횟수·서로 다른 번호를 막는다. */
export function consumeSignupSmsIpBudget({ ip, phone, todayKey }) {
  const bucket = touchDayBucket(ip, todayKey);
  const digits = String(phone || "");
  if (bucket.count >= limits.signupIpDailyMax) {
    return {
      ok: false,
      code: "SMS_IP_LIMIT",
      message: "문자 요청이 많습니다. 내일 다시 시도해주세요.",
    };
  }
  if (bucket.phones.size >= limits.signupIpDistinctPhones && !bucket.phones.has(digits)) {
    return {
      ok: false,
      code: "SMS_IP_LIMIT",
      message: "문자 요청이 많습니다. 내일 다시 시도해주세요.",
    };
  }
  bucket.count += 1;
  if (digits) bucket.phones.add(digits);
  return { ok: true };
}

export function consumeSignupVerifyIpBudget({ ip, now = Date.now() }) {
  const key = String(ip || "unknown");
  const next = stampsInWindow(signupVerifyStamps.get(key) || [], now, limits.signupVerifyWindowMs);
  if (next.length >= limits.signupVerifyMax) {
    signupVerifyStamps.set(key, next);
    return {
      ok: false,
      code: "SMS_VERIFY_LIMIT",
      message: "인증 시도가 많습니다. 잠시 후 다시 시도해주세요.",
    };
  }
  next.push(now);
  signupVerifyStamps.set(key, next);
  pruneMap(signupVerifyStamps, 2000);
  return { ok: true };
}

/** 제조사 대표·지정 관리자의 긴급 문자. 한 시간에 서로 다른 내용 10건. 같은 내용은 세지 않고 보내지 않는다. */
export function consumeActorSmsBudget({ actorId, content = "", now = Date.now() }) {
  const key = String(actorId || "unknown");
  const text = String(content || "");
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  const prev = Array.isArray(actorStamps.get(key)) ? actorStamps.get(key) : [];
  const fresh = prev.filter(
    (row) => row && typeof row.at === "number" && now - row.at < limits.actorWindowMs,
  );
  if (fresh.some((row) => row.hash === hash)) {
    actorStamps.set(key, fresh);
    return {
      ok: false,
      code: "SMS_SAME_CONTENT",
      message: SMS_URGENT_SAME_CONTENT_MESSAGE,
    };
  }
  if (fresh.length >= limits.actorHourlyMax) {
    actorStamps.set(key, fresh);
    return {
      ok: false,
      code: "SMS_ACTOR_LIMIT",
      message: SMS_URGENT_HOURLY_MESSAGE,
    };
  }
  fresh.push({ at: now, hash });
  actorStamps.set(key, fresh);
  pruneMap(actorStamps, 2000);
  return { ok: true };
}

/**
 * 로그인 세션 없이 메모리에만 코드를 두는 인증 문자.
 * 재시작 전에는 번호당 하루 5건, 발송 후 5분이다.
 */
export function consumeEphemeralPhoneSms({ phone, todayKey, now = Date.now() }) {
  const digits = String(phone || "");
  const prev = ephemeralPhoneSms.get(digits);
  const sameDay = prev?.todayKey === todayKey;
  const count = sameDay ? Number(prev.count) || 0 : 0;
  const sentAt = sameDay ? Number(prev.sentAt) || 0 : 0;
  if (count >= SIGNUP_SMS_DAILY_MAX) {
    return {
      ok: false,
      code: "SMS_DAILY_LIMIT",
      message: SMS_DAILY_LIMIT_MESSAGE,
    };
  }
  if (sentAt && now - sentAt < SMS_COOLDOWN_MS) {
    return {
      ok: false,
      code: "SMS_COOLDOWN",
      retryAfterSec: Math.max(1, Math.ceil((SMS_COOLDOWN_MS - (now - sentAt)) / 1000)),
      message: SMS_COOLDOWN_MESSAGE,
    };
  }
  ephemeralPhoneSms.set(digits, { todayKey, count: count + 1, sentAt: now });
  pruneMap(ephemeralPhoneSms, 2000);
  return {
    ok: true,
    rollback() {
      const row = ephemeralPhoneSms.get(digits);
      if (!row || row.todayKey !== todayKey) return;
      ephemeralPhoneSms.set(digits, {
        todayKey,
        count: Math.max(0, (Number(row.count) || 1) - 1),
        sentAt: now,
      });
    },
  };
}
