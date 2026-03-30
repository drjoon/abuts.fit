import crypto from "crypto";
import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import BusinessAnchor from "../../../models/businessAnchor.model.js";
import { normalizeBusinessNumber } from "../../../utils/businessAnchor.utils.js";

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
    // businessAnchorId/businessId 같은 사업자 귀속 필드는 이미 온보딩 완료된 계정을 덮어쓰지 않는다.
    // 단, name/phoneNumber/role 같은 프로필 필드는 항상 spec 기준으로 업데이트한다.
    // (이전 시딩에서 이름이 잘못 저장된 경우 재시딩으로 정정 가능하게 하기 위함)
    const protectedFields = new Set(["businessAnchorId", "businessId"]);
    Object.entries(doc).forEach(([key, value]) => {
      if (protectedFields.has(key) && existing[key] && !value) return;
      existing[key] = value;
    });
    await existing.save();
    return existing;
  }
  return User.create(doc);
}

export async function findOrCreateOrganization({
  organizationType,
  businessAnchorType,
  name,
  ownerId,
  memberIds = [],
  extracted = {},
  // 시딩은 실제 사업자등록이 아니므로 기본적으로 BusinessAnchor를 생성하지 않는다.
  // 가짜 BusinessAnchor가 생성되면 소개 관계(referredByAnchorId)가 실 anchor와 어긋나는 버그가 발생한다.
  skipBusinessAnchorCreation = true,
}) {
  const businessNumberNormalized = normalizeBusinessNumber(
    extracted?.businessNumber || "",
  );

  let organization = null;
  if (!skipBusinessAnchorCreation && businessNumberNormalized) {
    organization = await BusinessAnchor.findOneAndUpdate(
      { businessNumberNormalized },
      {
        $set: {
          businessType: businessAnchorType || organizationType,
          name,
          status: "verified",
          primaryContactUserId: ownerId || null,
          owners: [ownerId].filter(Boolean),
          members: [ownerId, ...memberIds].filter(Boolean),
          metadata: {
            companyName: String(extracted?.companyName || name || "").trim(),
            representativeName: String(
              extracted?.representativeName || "",
            ).trim(),
            address: String(extracted?.address || "").trim(),
            addressDetail: String(extracted?.addressDetail || "").trim(),
            zipCode: String(extracted?.zipCode || "").trim(),
            phoneNumber: String(extracted?.phoneNumber || "").trim(),
            email: String(extracted?.email || "").trim(),
            businessItem: String(extracted?.businessItem || "").trim(),
            businessCategory: String(extracted?.businessCategory || "").trim(),
            startDate: String(extracted?.startDate || "").trim(),
            businessNumber: String(extracted?.businessNumber || "").trim(),
          },
        },
        $addToSet: {
          owners: { $each: [ownerId].filter(Boolean) },
          members: { $each: [ownerId, ...memberIds].filter(Boolean) },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } else {
    // skipBusinessAnchorCreation이 true인 경우, 기존 로직 유지를 위해 name으로 조회
    organization = await BusinessAnchor.findOne({
      businessType: organizationType,
      name,
    });

    if (!organization) {
      organization = await BusinessAnchor.create({
        businessType: organizationType,
        name,
        status: "verified",
        primaryContactUserId: ownerId || null,
        owners: [ownerId].filter(Boolean),
        members: [ownerId, ...memberIds].filter(Boolean),
        metadata: {
          companyName: String(extracted?.companyName || name || "").trim(),
          representativeName: String(
            extracted?.representativeName || "",
          ).trim(),
          address: String(extracted?.address || "").trim(),
          addressDetail: String(extracted?.addressDetail || "").trim(),
          zipCode: String(extracted?.zipCode || "").trim(),
          phoneNumber: String(extracted?.phoneNumber || "").trim(),
          email: String(extracted?.email || "").trim(),
          businessItem: String(extracted?.businessItem || "").trim(),
          businessCategory: String(extracted?.businessCategory || "").trim(),
          startDate: String(extracted?.startDate || "").trim(),
          businessNumber: String(extracted?.businessNumber || "").trim(),
        },
      });
    } else {
      const nextMembers = [ownerId, ...memberIds].filter(Boolean);
      const nextOwners = [ownerId].filter(Boolean);
      await BusinessAnchor.updateOne(
        { _id: organization._id },
        {
          $set: {
            primaryContactUserId: ownerId,
            name,
            businessType: organizationType,
            "metadata.companyName": String(
              extracted?.companyName || name || "",
            ).trim(),
            "metadata.representativeName": String(
              extracted?.representativeName || "",
            ).trim(),
            "metadata.address": String(extracted?.address || "").trim(),
            "metadata.addressDetail": String(
              extracted?.addressDetail || "",
            ).trim(),
            "metadata.zipCode": String(extracted?.zipCode || "").trim(),
            "metadata.phoneNumber": String(extracted?.phoneNumber || "").trim(),
            "metadata.email": String(extracted?.email || "").trim(),
            "metadata.businessItem": String(
              extracted?.businessItem || "",
            ).trim(),
            "metadata.businessCategory": String(
              extracted?.businessCategory || "",
            ).trim(),
            "metadata.startDate": String(extracted?.startDate || "").trim(),
            "metadata.businessNumber": String(
              extracted?.businessNumber || "",
            ).trim(),
          },
          $addToSet: {
            owners: { $each: nextOwners },
            members: { $each: nextMembers },
          },
        },
      );
      organization = await BusinessAnchor.findById(organization._id);
    }
  }

  return organization;
}

export async function attachUserToOrganization(userId, organization) {
  // businessAnchorId는 실제 사업자등록 후에만 세팅한다.
  // organization에 businessAnchorId가 없으면(시딩 등) 기존 User.businessAnchorId를 유지해야
  // 실제 등록 후 시딩이 재실행되어도 실 anchor가 null로 덮어씌워지지 않는다.
  const setFields = {
    businessId: organization._id,
    business: organization.name,
  };
  if (organization.businessAnchorId) {
    setFields.businessAnchorId = organization.businessAnchorId;
  }
  await User.updateOne({ _id: userId }, { $set: setFields });
}

export function createObjectId() {
  return new mongoose.Types.ObjectId();
}
