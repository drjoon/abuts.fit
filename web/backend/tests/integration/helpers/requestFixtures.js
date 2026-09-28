// related files:
// - web/backend/tests/integration/request.test.js
// - web/backend/utils/requestorCapabilities.js
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/services/generalLedger.service.js
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../../../models/user.model";
import BusinessAnchor from "../../../models/businessAnchor.model";
import Request from "../../../models/request.model";
import Connection from "../../../models/connection.model";
import { postGeneralLedgerJournal } from "../../../services/generalLedger.service";
import { normalizeImplantFields } from "../../../utils/implantCanonical";
import { generateToken } from "../../../utils/jwt.util";
import { ABUTS_LAB_DISPLAY_NAME } from "../../../utils/practiceTransferAutoMatchCore";

// 가입·비밀번호 변경 규칙(10자 이상 + 특수문자)을 따른다.
export const TEST_PASSWORD = "password123!";

// 크라운 1치만 받는 최소 기공수가표. 수락·견적은 마스터 On + 제공 항목 단가>0이어야 한다.
export const CROWN_ONLY_LAB_FEE_SCHEDULE = Object.freeze({
  active: true,
  updatedAt: new Date("2026-01-01T00:00:00+09:00"),
  items: [
    {
      id: "crown",
      name: "크라운",
      unit: "perTooth",
      enabled: true,
      price: 60000,
      remake: 0,
      tiers: [],
    },
  ],
});

export const TEST_IMPLANT = Object.freeze(
  normalizeImplantFields({
    implantManufacturer: "OSSTEM",
    implantBrand: "TS",
    implantFamily: "Regular",
    implantType: "Hex",
  }),
);

let seq = 0;
const nextSeq = () => {
  seq += 1;
  return `${process.pid}-${Date.now().toString(36)}-${seq}`;
};

export async function createAnchor({
  name,
  businessType = "requestor",
  requestorKind = null,
  status = "verified",
  ...rest
} = {}) {
  return BusinessAnchor.create({
    businessNumberNormalized: crypto.randomInt(1e9, 1e10 - 1).toString(),
    businessType,
    name: name || `테스트 사업자 ${nextSeq()}`,
    status,
    ...(requestorKind
      ? {
          requestorKind,
          requestorServices: { free: false, paid: true },
        }
      : {}),
    ...rest,
  });
}

// resolveDevopsEscrowOwnerId는 첫 조회 id를 프로세스에 캐시한다. 테스트마다 컬렉션을 비우므로
// 같은 _id로 다시 만들어 캐시와 DB가 어긋나지 않게 한다.
const DEVOPS_ESCROW_ANCHOR_ID = new mongoose.Types.ObjectId("0000000000000000000d0e05");

/** 크레딧 보류(에스크로) 상대 개발운영사 앵커. 보류 저널이 이 앵커를 요구한다. */
export const ensureDevopsEscrowAnchor = () =>
  BusinessAnchor.updateOne(
    { _id: DEVOPS_ESCROW_ANCHOR_ID },
    {
      $setOnInsert: {
        businessNumberNormalized: "0000000000",
        businessType: "devops",
        name: "테스트 개발운영사",
        status: "verified",
      },
    },
    { upsert: true },
  );

/** 치과(의뢰 발신자). */
export const createPracticeAnchor = (overrides = {}) =>
  createAnchor({ name: "테스트 치과", requestorKind: "practice", ...overrides });

/** 기공소(의뢰 수신자·CA 생산의뢰자). */
export const createLabAnchor = (overrides = {}) =>
  createAnchor({
    name: "테스트 기공소",
    requestorKind: "lab",
    shippingPolicy: { weeklyBatchDays: ["mon", "tue", "wed", "thu", "fri"] },
    ...overrides,
  });

/** 어벗츠기공소(원청, internalLab). resolveInternalLabAnchor가 이 앵커를 고른다. */
export const createAbutsLabAnchor = (overrides = {}) =>
  createAnchor({
    name: ABUTS_LAB_DISPLAY_NAME,
    businessType: "internalLab",
    labFeeSchedule: CROWN_ONLY_LAB_FEE_SCHEDULE,
    ...overrides,
  });

export async function createUser({
  role = "requestor",
  anchor = null,
  subRole = anchor && role === "requestor" ? "owner" : null,
  name,
  ...rest
} = {}) {
  const id = nextSeq();
  const user = await User.create({
    name: name || `테스트 ${role} ${id}`,
    email: `${role}-${id}@example.com`,
    password: TEST_PASSWORD,
    phoneNumber: "010-1234-5678",
    role,
    subRole,
    active: true,
    approvedAt: new Date(),
    businessAnchorId: anchor?._id || null,
    ...rest,
  });
  if (anchor && !anchor.primaryContactUserId && role !== "admin") {
    await BusinessAnchor.updateOne(
      { _id: anchor._id },
      { $set: { primaryContactUserId: user._id }, $addToSet: { owners: user._id } },
    );
    anchor.primaryContactUserId = user._id;
  }
  return { user, token: generateToken(user) };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** 유료 크레딧 충전(CHARGE_PAID 저널). 잔액 SSOT는 GL 집계다. */
export async function grantPaidCredit(anchorId, amount) {
  return postGeneralLedgerJournal({
    idempotencyKey: `test:charge:${String(anchorId)}:${nextSeq()}`,
    eventType: "CHARGE_PAID",
    businessAnchorId: anchorId,
    refType: "TEST",
    lines: [
      {
        accountCode: "REQ_PAID_CREDIT",
        ownerRole: "requestor",
        ownerId: anchorId,
        amount,
        amountExcludingVat: amount,
        vatAmount: 0,
        amountIncludingVat: amount,
        creditKind: "PAID",
      },
    ],
  });
}

/** 주문 가능(isActive) 임플란트 조합. 생성·수정 시 assertOrderableImplantPresetOrThrow가 본다. */
export const seedOrderableConnection = () =>
  Connection.create({
    manufacturer: TEST_IMPLANT.implantManufacturer,
    brand: TEST_IMPLANT.implantBrand,
    family: TEST_IMPLANT.implantFamily,
    type: TEST_IMPLANT.implantType,
    category: "hanhwa-connection",
    fileName: "test-connection.stl",
    isActive: true,
  });

export async function seedRequest({
  requestor,
  anchor = null,
  manufacturerStage = "준비",
  patientName = "홍길동",
  tooth = "16",
  createdAt,
} = {}) {
  return Request.create({
    requestId: `REQ-TEST-${nextSeq()}`,
    requestor: requestor._id,
    businessAnchorId: anchor?._id || requestor.businessAnchorId || null,
    manufacturerStage,
    caseInfos: {
      clinicName: "테스트 치과",
      patientName,
      tooth,
      ...TEST_IMPLANT,
    },
    ...(createdAt ? { createdAt } : {}),
  });
}

/** KST 기준 오늘 + n일(YYYY-MM-DD). 기공의뢰 치과도착일 메모용. */
export function kstYmdAfterDays(days) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * POST /api/practice/transfers 본문. 파일은 S3에 미리 올라간 메타만 보낸다(여기서 S3 호출 없음).
 * 크라운 1치 — 커스텀어벗이 없어 어벗 프리셋·어벗츠 어벗 단가가 필요 없다.
 */
export function buildTransferBody({ targetLabAnchorId, targetLabName } = {}) {
  const id = nextSeq();
  return {
    transferId: `PTX-TEST-${id}`,
    ...(targetLabAnchorId ? { targetLabAnchorId: String(targetLabAnchorId) } : {}),
    ...(targetLabName ? { targetLabName } : {}),
    transferMemo: `[환자명: 김환자] [치과도착일: ${kstYmdAfterDays(21)}]`,
    toothWorks: [{ toothNumber: "16", prosthesisType: "크라운" }],
    caseInfos: [
      {
        patientName: "김환자",
        tooth: "16",
        file: {
          originalName: `scan-${id}.stl`,
          mimetype: "model/stl",
          size: 1024,
          s3Key: `test/practice-transfers/${id}/scan.stl`,
        },
        newSystemRequest: { tag: "practice_file_transfer" },
      },
    ],
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 응답 뒤 fire-and-forget 작업(보류·알림)을 기다린다. */
export async function waitFor(fn, { timeoutMs = 2500, intervalMs = 50 } = {}) {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) return value;
    await sleep(intervalMs);
  }
}
