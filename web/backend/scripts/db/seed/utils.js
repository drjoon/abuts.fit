import crypto from "crypto";
import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Business from "../../../models/business.model.js";

export const NOW = new Date();

const REQUEST_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const REQUEST_ID_SUFFIX_LEN = 8;
const REQUEST_ID_MAX_TRIES = 8;

export function generateRequestId(createdAt, reserved = new Set()) {
  const baseDate = createdAt instanceof Date ? createdAt : new Date();
  const kst = new Date(baseDate.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const prefix = `${year}${month}${day}`;

  const makeSuffix = () => {
    const bytes = crypto.randomBytes(REQUEST_ID_SUFFIX_LEN);
    let out = "";
    for (let i = 0; i < REQUEST_ID_SUFFIX_LEN; i += 1) {
      out += REQUEST_ID_ALPHABET[bytes[i] % REQUEST_ID_ALPHABET.length];
    }
    return out;
  };

  for (let attempt = 0; attempt < REQUEST_ID_MAX_TRIES; attempt += 1) {
    const candidate = `${prefix}-${makeSuffix()}`;
    if (reserved.has(candidate)) continue;
    reserved.add(candidate);
    return candidate;
  }

  throw new Error("requestId 생성에 실패했습니다 (seed)");
}

export function randomReferralCode(len = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function toKstYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function createSalesmen({
  count = 10,
  rootCount = 3,
  password = "Abc!1234",
  now = new Date(),
  allowUnreferred = true,
} = {}) {
  const salesmen = [];
  const salesmanRoots = [];

  for (let i = 1; i <= count; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const referralCode = randomReferralCode(4);
    let referredByUserId = null;
    let referralGroupLeaderId = null;
    const isRoot = i <= rootCount;
    const isUnreferred =
      allowUnreferred && !isRoot && i !== 4 && Math.random() < 0.2;

    if (!isRoot && !isUnreferred) {
      const root = salesmanRoots.length ? pick(salesmanRoots) : null;
      const candidates = salesmen.filter(
        (s) => String(s.leaderId) === String(root?.id),
      );
      const pool = candidates.length ? candidates : salesmen;
      const parent = pool.length ? pick(pool) : null;
      referredByUserId = parent?.id || null;
      referralGroupLeaderId =
        root?.id || parent?.leaderId || parent?.id || null;
    }

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password,
      role: "salesman",
      referralCode,
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: now,
      active: true,
    });

    const leaderId = referralGroupLeaderId || salesman._id;
    const saved = {
      id: salesman._id,
      email,
      leaderId,
      parentId: referredByUserId,
    };
    salesmen.push(saved);
    if (isRoot) salesmanRoots.push({ id: salesman._id, email });
  }

  return { salesmen, salesmanRoots };
}

export async function findOrCreateUser(doc) {
  const existing = await User.findOne({ email: doc.email });
  if (existing) {
    Object.entries(doc).forEach(([key, value]) => {
      existing[key] = value;
    });
    await existing.save();
    return existing;
  }
  return User.create(doc);
}

export async function findOrCreateOrganization({
  organizationType,
  name,
  ownerId,
  memberIds = [],
  extracted = {},
}) {
  let organization = await Business.findOne({
    organizationType,
    name,
  });

  if (!organization) {
    organization = await Business.create({
      organizationType,
      name,
      owner: ownerId,
      owners: [],
      members: [ownerId, ...memberIds],
      joinRequests: [],
      extracted,
    });
  } else {
    const nextMembers = [ownerId, ...memberIds].filter(Boolean);
    const nextOwners = [ownerId].filter(Boolean);
    await Business.updateOne(
      { _id: organization._id },
      {
        $set: {
          owner: ownerId,
          name,
          extracted: {
            ...(organization.extracted || {}),
            ...extracted,
          },
        },
        $addToSet: {
          owners: { $each: nextOwners },
          members: { $each: nextMembers },
        },
      },
    );
    organization = await Business.findById(organization._id);
  }

  return organization;
}

export async function attachUserToOrganization(userId, organization) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        businessId: organization._id,
        business: organization.name,
      },
    },
  );
}

export function createObjectId() {
  return new mongoose.Types.ObjectId();
}
