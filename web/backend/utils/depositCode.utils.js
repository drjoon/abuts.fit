import Counter from "../models/counter.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import ChargeOrder from "../models/chargeOrder.model.js";

const ORG_DEPOSIT_CODE_COUNTER_KEY = "requestorOrganization.depositCode.v2";
const CHARGE_ORDER_DEPOSIT_CODE_COUNTER_KEY = "chargeOrder.depositCode.v2";

function formatDepositCode(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1 || num > 99) return "";
  return String(num).padStart(2, "0");
}

async function getNextSequence({ key, startAt }) {
  const start = Number(startAt);
  if (!Number.isFinite(start) || start <= 0) {
    throw new Error("startAt이 유효하지 않습니다.");
  }

  const doc = await Counter.findOneAndUpdate(
    { key },
    {
      $setOnInsert: { key },
      $inc: { seq: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  const seq = Number(doc?.seq || 0);
  if (!Number.isFinite(seq) || seq <= 0) return 0;

  // 첫 번째 호출에서 startAt 값을 그대로 돌려주기 위해 offset 적용
  return start - 1 + seq;
}

export async function ensureOrganizationDepositCode(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId가 필요합니다.");
  }

  const org = await RequestorOrganization.findById(organizationId)
    .select({ depositCode: 1 })
    .lean();

  const existing = String(org?.depositCode || "").trim();
  if (existing) {
    return { depositCode: existing, created: false };
  }

  for (let i = 0; i < 5; i += 1) {
    const next = await getNextSequence({
      key: ORG_DEPOSIT_CODE_COUNTER_KEY,
      startAt: 1,
    });
    if (next > 99) {
      throw new Error("depositCode가 범위를 초과했습니다.");
    }

    const depositCode = formatDepositCode(next);

    let result;
    try {
      result = await RequestorOrganization.updateOne(
        {
          _id: organizationId,
          $or: [{ depositCode: "" }, { depositCode: null }],
        },
        { $set: { depositCode } }
      );
    } catch (err) {
      if (err && err.code === 11000) {
        continue;
      }
      throw err;
    }

    if (result?.modifiedCount) {
      return { depositCode, created: true };
    }

    const after = await RequestorOrganization.findById(organizationId)
      .select({ depositCode: 1 })
      .lean();
    const afterCode = String(after?.depositCode || "").trim();
    if (afterCode) {
      return { depositCode: afterCode, created: false };
    }
  }

  throw new Error("depositCode 발급에 실패했습니다.");
}

export async function generateChargeOrderDepositCode() {
  // 동시간대 99건 초과가 없다는 전제 하에 시퀀스 기반으로 01~99 순환 발급
  for (let i = 0; i < 10; i += 1) {
    const next = await getNextSequence({
      key: CHARGE_ORDER_DEPOSIT_CODE_COUNTER_KEY,
      startAt: 1,
    });
    const mod = ((next - 1) % 99) + 1; // 1~99 순환
    const depositCode = formatDepositCode(mod);

    // 현재 활성(PENDING) 건과 충돌하지 않도록 확인
    const conflict = await ChargeOrder.exists({
      depositCode,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    });
    if (conflict) continue;

    return { depositCode };
  }

  throw new Error("사용 가능한 입금자코드가 부족합니다.");
}
