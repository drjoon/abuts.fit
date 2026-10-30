// 대표가 만드는 임직원 아이디는 한글 이름이다.
// 같은 이름이 이미 있으면 1, 2, … 를 붙인다. 회사와 상관없이 전체에서 찾는다.
// 로그인 식별자도 여기서 나눈다. 처음 비밀번호 규칙은 passwordPolicy.js.

import { createHash } from "node:crypto";

export const STAFF_LOGIN_EMAIL_DOMAIN = "staff.abuts.fit";
export const STAFF_BULK_MAX = 40;
/** 화면 아이디. 한글 이름, 중복이면 이름 뒤에 숫자. */
export const LOGIN_ID_PATTERN = /^[가-힣]{1,20}\d{0,4}$/;
const HANGUL_NAME = /^[가-힣]{1,20}$/;
const NAME_MESSAGE = "이름은 한글로 적어 주세요.";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function staffLoginEmail(loginId) {
  const id = String(loginId || "").trim().toLowerCase();
  const local = /^[a-z0-9]{3,20}$/.test(id)
    ? id
    : `s${createHash("sha256").update(id, "utf8").digest("hex").slice(0, 20)}`;
  return `${local}@${STAFF_LOGIN_EMAIL_DOMAIN}`;
}

export function isReservedStaffLoginEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .endsWith(`@${STAFF_LOGIN_EMAIL_DOMAIN}`);
}

export function classifyLoginCredential(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return { kind: "empty", value: "" };
  if (value.includes("@")) return { kind: "email", value };
  return { kind: "loginId", value };
}

export function loginIdBaseFromName(name) {
  const compact = String(name || "")
    .trim()
    .replace(/\s+/g, "");
  return HANGUL_NAME.test(compact) ? compact : "";
}

export function allocateLoginId(base, taken) {
  const root = String(base || "");
  if (!HANGUL_NAME.test(root)) return "";
  if (!taken.has(root)) return root;
  for (let n = 1; n <= 9999; n += 1) {
    const candidate = `${root}${n}`;
    if (!LOGIN_ID_PATTERN.test(candidate)) return "";
    if (!taken.has(candidate)) return candidate;
  }
  return "";
}

export function loginIdLookupClauses(bases) {
  return [...new Set(bases.filter(Boolean))].map((base) => ({
    loginId: { $regex: `^${escapeRegex(base)}\\d*$` },
  }));
}

function splitStaffLine(line) {
  return String(line || "")
    .split(/[,\t、，]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseStaffBulkText(text, { limit = true } = {}) {
  const lines = String(text || "").split(/\r?\n/);
  const drafts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith("#")) continue;
    const lineNo = index + 1;
    const parts = splitStaffLine(raw);
    if (parts.length !== 1) {
      drafts.push({
        lineNo,
        name: parts[0] || "",
        error: "이름은 한 줄에 하나씩 적어 주세요.",
      });
      continue;
    }
    const name = parts[0];
    if (name.length > 40) {
      drafts.push({
        lineNo,
        name,
        error: "이름은 40자 이하로 적어 주세요.",
      });
      continue;
    }
    if (!loginIdBaseFromName(name)) {
      drafts.push({
        lineNo,
        name,
        error: NAME_MESSAGE,
      });
      continue;
    }
    drafts.push({ lineNo, name, error: "" });
  }

  if (!drafts.length) {
    return { fatal: "등록할 직원 이름을 적어 주세요.", drafts: [] };
  }
  if (limit && drafts.length > STAFF_BULK_MAX) {
    return {
      fatal: `한 번에 ${STAFF_BULK_MAX}명까지 등록할 수 있습니다.`,
      drafts: [],
    };
  }
  return { fatal: "", drafts };
}

export function finalizeStaffBulkDrafts(drafts, { takenLoginIds, takenEmails }) {
  const usedLogin = new Set(
    [...takenLoginIds].map((value) => String(value || "").trim().toLowerCase()),
  );
  const usedEmail = new Set(
    [...takenEmails].map((value) => String(value || "").trim().toLowerCase()),
  );
  const ready = [];
  const failed = [];

  const fail = (draft, message) => {
    failed.push({
      line: draft.lineNo,
      name: draft.name,
      departmentName: draft.departmentName || "",
      message,
    });
  };

  for (const draft of drafts) {
    if (draft.error) {
      fail(draft, draft.error);
      continue;
    }
    const base = loginIdBaseFromName(draft.name);
    if (!base) {
      fail(draft, NAME_MESSAGE);
      continue;
    }
    const loginId = allocateLoginId(base, usedLogin);
    if (!loginId) {
      fail(draft, "아이디를 만들 수 없습니다.");
      continue;
    }
    const email = staffLoginEmail(loginId);
    if (usedLogin.has(loginId) || usedEmail.has(email)) {
      fail(draft, "이미 사용 중인 아이디입니다.");
      continue;
    }
    usedLogin.add(loginId);
    usedEmail.add(email);
    const departmentIds = collectDraftDepartmentIds(draft);
    const departmentNames = collectDraftDepartmentNames(draft);
    ready.push({
      line: draft.lineNo,
      name: draft.name,
      loginId,
      email,
      login: loginId,
      departmentId: departmentIds[0] || null,
      departmentIds,
      departmentName: departmentNames.join(" · "),
      departmentNames,
    });
  }

  return { ready, failed };
}

function collectDraftDepartmentIds(draft) {
  if (Array.isArray(draft?.departmentIds) && draft.departmentIds.length) {
    return [...new Set(draft.departmentIds.filter(Boolean))];
  }
  return draft?.departmentId ? [draft.departmentId] : [];
}

function collectDraftDepartmentNames(draft) {
  if (Array.isArray(draft?.departmentNames) && draft.departmentNames.length) {
    return [...new Set(draft.departmentNames.map((name) => String(name || "").trim()).filter(Boolean))];
  }
  const name = String(draft?.departmentName || "").trim();
  return name ? [name] : [];
}

/** 부서 칸마다 같은 순번의 같은 이름은 한 사람·여러 부서(OR)로 합친다. */
export function mergeStaffDraftsByDepartmentOccurrence(drafts) {
  const perDepartment = new Map();
  for (const draft of Array.isArray(drafts) ? drafts : []) {
    const key = String(draft?.departmentId || "");
    if (!perDepartment.has(key)) perDepartment.set(key, []);
    perDepartment.get(key).push(draft);
  }

  const merged = new Map();
  for (const list of perDepartment.values()) {
    const occurrence = new Map();
    for (const draft of list) {
      const name = loginIdBaseFromName(draft.name) || String(draft.name || "");
      const index = occurrence.get(name) || 0;
      occurrence.set(name, index + 1);
      const mergeKey = `${name}#${index}`;
      const existing = merged.get(mergeKey);
      const departmentIds = collectDraftDepartmentIds(draft);
      const departmentNames = collectDraftDepartmentNames(draft);
      if (existing) {
        existing.departmentIds = [
          ...new Set([...existing.departmentIds, ...departmentIds]),
        ];
        existing.departmentNames = [
          ...new Set([...existing.departmentNames, ...departmentNames]),
        ];
        if (draft.error && !existing.error) existing.error = draft.error;
        continue;
      }
      merged.set(mergeKey, {
        ...draft,
        departmentIds,
        departmentNames,
      });
    }
  }
  return [...merged.values()];
}

export function toStaffListFields(member) {
  const email = String(member?.email || "").trim();
  const storedLoginId = String(member?.loginId || "").trim().toLowerCase();
  const reserved = isReservedStaffLoginEmail(email);
  const loginId =
    storedLoginId || (reserved ? email.split("@")[0].toLowerCase() : "");
  return {
    email: reserved ? "" : email,
    loginId,
  };
}
