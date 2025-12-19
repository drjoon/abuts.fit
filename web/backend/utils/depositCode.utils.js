import Counter from "../models/counter.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";

function formatDepositCode(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 10000) return "";
  return String(num).padStart(5, "0");
}

async function getNextSequence({ key, startAt }) {
  const start = Number(startAt);
  if (!Number.isFinite(start) || start <= 0) {
    throw new Error("startAt이 유효하지 않습니다.");
  }

  const doc = await Counter.findOneAndUpdate(
    { key },
    {
      $setOnInsert: { key, seq: start - 1 },
      $inc: { seq: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return Number(doc?.seq || 0);
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
      key: "requestorOrganization.depositCode",
      startAt: 10001,
    });
    if (next > 99999) {
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
