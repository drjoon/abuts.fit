import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import File from "../../models/file.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import { verifyBusinessNumber } from "../../services/hometax.service.js";
import { DEFAULT_DELIVERY_ETA_LEAD_DAYS } from "../requests/utils.js";
import {
  ORGANIZATION_ALLOWED_ROLE_SET,
  resolveOrganizationType,
  assertOrganizationRole,
  buildOrganizationTypeFilter,
} from "./organizationRole.util.js";
import { emitCreditBalanceUpdatedToOrganization } from "../../utils/creditRealtime.js";

const WELCOME_BONUS_AMOUNT = 30000;
const SALESMAN_REFERRAL_BONUS_AMOUNT = 50000;

function extractPostalCodeFromGeocodingResult(result) {
  const components = Array.isArray(result?.address_components)
    ? result.address_components
    : [];
  const postal = components.find(
    (item) => Array.isArray(item?.types) && item.types.includes("postal_code"),
  );
  return String(postal?.long_name || postal?.short_name || "").trim();
}

function buildAddressCandidates(address) {
  const raw = String(address || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) return [];

  const withoutParen = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const beforeComma = raw.split(",")[0]?.trim() || "";
  const beforeDongHo = raw
    .replace(/\b\d+동\b.*$/u, "")
    .replace(/\b\d+호\b.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return [
    ...new Set([raw, withoutParen, beforeComma, beforeDongHo].filter(Boolean)),
  ];
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractFirstXmlTagValue(xml, tagName) {
  const match = String(xml || "").match(
    new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"),
  );
  return decodeXmlText(match?.[1] || "");
}

function extractXmlItemList(xml) {
  const source = String(xml || "");
  const matches = [...source.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return matches.map((match) => {
    const itemXml = match?.[1] || "";
    return {
      zipNo: extractFirstXmlTagValue(itemXml, "zipNo"),
      lnmAdres: extractFirstXmlTagValue(itemXml, "lnmAdres"),
      rnAdres: extractFirstXmlTagValue(itemXml, "rnAdres"),
      ctpNm: extractFirstXmlTagValue(itemXml, "ctpNm"),
      sggNm: extractFirstXmlTagValue(itemXml, "sggNm"),
      emdNm: extractFirstXmlTagValue(itemXml, "emdNm"),
      liNm: extractFirstXmlTagValue(itemXml, "liNm"),
      rn: extractFirstXmlTagValue(itemXml, "rn"),
      buldMnnm: extractFirstXmlTagValue(itemXml, "buldMnnm"),
      buldSlno: extractFirstXmlTagValue(itemXml, "buldSlno"),
    };
  });
}

async function requestEpostPostalLookup(address) {
  const serviceKey = String(
    process.env.EPOST_POSTAL_SERVICE_KEY ||
      process.env.DATA_GO_KR_SERVICE_KEY ||
      process.env.SERVICE_KEY ||
      "",
  )
    .trim()
    .replace(/^"|"$/g, "");

  if (!serviceKey) {
    throw Object.assign(new Error("SERVICE_KEY가 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }

  const url = new URL(
    "http://openapi.epost.go.kr/postal/retrieveLotNumberAdressAreaCdService/retrieveLotNumberAdressAreaCdService/getDetailListAreaCd",
  );
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("searchSe", "road");
  url.searchParams.set("srchwrd", address);
  url.searchParams.set("countPerPage", "10");
  url.searchParams.set("currentPage", "1");

  const response = await fetch(url.toString(), { method: "GET" });
  const xml = await response.text();

  if (!response.ok) {
    throw Object.assign(new Error("epost 주소 우편번호 조회에 실패했습니다."), {
      statusCode: response.status || 502,
      data: xml,
    });
  }

  const items = extractXmlItemList(xml);
  const first =
    items.find((item) => String(item.zipNo || "").trim()) || items[0];

  return {
    postalCode: String(first?.zipNo || "").trim(),
    formattedAddress: String(first?.rnAdres || first?.lnmAdres || "").trim(),
    raw: xml,
  };
}

async function requestGoogleGeocode(address) {
  const apiKey = String(process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw Object.assign(new Error("GOOGLE_API_KEY가 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "ko");
  url.searchParams.set("region", "kr");

  const response = await fetch(url.toString(), { method: "GET" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error("주소 우편번호 조회에 실패했습니다."), {
      statusCode: response.status || 502,
      data,
    });
  }

  return data;
}

async function lookupPostalCodeByAddress(address) {
  const candidates = buildAddressCandidates(address);
  let lastData = null;

  for (const candidate of candidates) {
    try {
      const epostData = await requestEpostPostalLookup(candidate);
      lastData = epostData.raw;
      if (epostData.postalCode) {
        return {
          postalCode: epostData.postalCode,
          formattedAddress: epostData.formattedAddress,
          matchedAddress: candidate,
          provider: "epost",
          raw: epostData.raw,
        };
      }
    } catch (error) {
      lastData = error?.data || lastData;
    }

    try {
      const data = await requestGoogleGeocode(candidate);
      lastData = data;
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const result of results) {
        const postalCode = extractPostalCodeFromGeocodingResult(result);
        if (postalCode) {
          return {
            postalCode,
            formattedAddress: String(result?.formatted_address || "").trim(),
            matchedAddress: candidate,
            provider: "google",
            raw: data,
          };
        }
      }
    } catch (error) {
      lastData = error?.data || lastData;
    }
  }

  return {
    postalCode: "",
    formattedAddress: String(
      lastData?.results?.[0]?.formatted_address || "",
    ).trim(),
    matchedAddress: candidates[0] || "",
    provider: "",
    raw: lastData,
  };
}

async function normalizeOrganizationAddressFields({ address, zipCode }) {
  const rawAddress = String(address || "").trim();
  const rawZipCode = String(zipCode || "").trim();
  if (!rawAddress) {
    return {
      address: "",
      zipCode: rawZipCode,
      provider: "",
      matchedAddress: "",
    };
  }

  try {
    const lookup = await lookupPostalCodeByAddress(rawAddress);
    const normalizedAddress = String(
      lookup?.formattedAddress || rawAddress,
    ).trim();
    const normalizedZipCode = String(lookup?.postalCode || rawZipCode).trim();

    return {
      address: normalizedAddress || rawAddress,
      zipCode: normalizedZipCode,
      provider: String(lookup?.provider || "").trim(),
      matchedAddress: String(lookup?.matchedAddress || "").trim(),
    };
  } catch (error) {
    return {
      address: rawAddress,
      zipCode: rawZipCode,
      provider: "",
      matchedAddress: rawAddress,
    };
  }
}

function normalizeBusinessNumberDigits(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
}

function formatBusinessNumber(input) {
  const digits = normalizeBusinessNumberDigits(input);
  if (!digits) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

async function findOrganizationByAnchors({
  organizationType,
  businessId,
  businessNumber,
  userId,
  businessName,
}) {
  const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

  if (businessId) {
    const byId = await RequestorOrganization.findOne({
      _id: businessId,
      ...orgTypeFilter,
    });
    if (byId) return byId;
  }

  if (userId) {
    const byMembership = await RequestorOrganization.findOne({
      ...orgTypeFilter,
      $or: [
        { owner: userId },
        { owners: userId },
        { members: userId },
        { "joinRequests.user": userId },
      ],
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (byMembership) return byMembership;
  }

  const safeBusinessName = String(businessName || "").trim();
  if (safeBusinessName) {
    const matches = await RequestorOrganization.find({
      ...orgTypeFilter,
      name: safeBusinessName,
      $or: [{ owner: userId }, { owners: userId }, { members: userId }],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1);
    if (Array.isArray(matches) && matches[0]) return matches[0];
  }

  const normalizedBusinessNumber = formatBusinessNumber(businessNumber);
  if (normalizedBusinessNumber) {
    const byBusinessNumber = await RequestorOrganization.findOne({
      ...orgTypeFilter,
      "extracted.businessNumber": normalizedBusinessNumber,
    });
    if (byBusinessNumber) return byBusinessNumber;
  }

  return null;
}

export async function checkBusinessNumberDuplicate(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    if (!businessNumberRaw) {
      return res.status(400).json({
        success: false,
        message: "businessNumber가 필요합니다.",
      });
    }

    const normalizeBusinessNumber = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (digits.length !== 10) return "";
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    };

    const businessNumber = normalizeBusinessNumber(businessNumberRaw);
    if (!businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    // 현재 사용자의 organization 조회
    const freshUser = await User.findById(req.user._id)
      .select({
        businessId: 1,
        business: 1,
        organizationId: 1,
        organization: 1,
      })
      .lean();
    const effectiveBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId ||
      null;

    // 같은 사업자등록번호를 가진 다른 organization 확인
    const existingOrg = await RequestorOrganization.findOne({
      ...orgTypeFilter,
      "extracted.businessNumber": businessNumber,
      ...(effectiveBusinessId ? { _id: { $ne: effectiveBusinessId } } : {}),
    })
      .select({ _id: 1, owner: 1 })
      .lean();

    if (existingOrg) {
      const meId = String(req.user._id);
      const existingOwnerId = String(existingOrg.owner || "");

      // 현재 사용자가 소유한 organization이 아니면 중복
      if (existingOwnerId !== meId) {
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message:
            "이미 등록된 사업자등록번호입니다. 기존 조직에 가입 요청을 진행해주세요.",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        duplicate: false,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "사업자등록번호 중복 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function lookupPostalCode(req, res) {
  try {
    const address = String(
      req.body?.address || req.query?.address || "",
    ).trim();

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "address가 필요합니다.",
      });
    }

    const data = await lookupPostalCodeByAddress(address);
    return res.status(200).json({
      success: true,
      data: {
        address,
        zipCode: data.postalCode,
        formattedAddress: data.formattedAddress,
        matchedAddress: data.matchedAddress,
        provider: data.provider,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "주소 우편번호 조회 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}

export async function updateRequestorOrganizationShippingAddress(req, res) {
  try {
    const actorRole = String(req.user?.role || "").trim();
    if (!["manufacturer", "admin"].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const businessId = String(
      req.body?.businessId || req.body?.organizationId || "",
    ).trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessId 또는 organizationId가 필요합니다.",
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "address가 필요합니다.",
      });
    }

    if (!addressDetail) {
      return res.status(400).json({
        success: false,
        message: "addressDetail이 필요합니다.",
      });
    }

    const normalizedAddressFields = await normalizeOrganizationAddressFields({
      address,
      zipCode,
    });

    const org = await RequestorOrganization.findOne({
      _id: businessId,
      ...buildOrganizationTypeFilter("requestor"),
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "의뢰인 조직을 찾을 수 없습니다.",
      });
    }

    const nextExtracted = {
      ...(org.extracted ? org.extracted.toObject?.() || org.extracted : {}),
      address: normalizedAddressFields?.address || address,
      addressDetail,
      zipCode: normalizedAddressFields?.zipCode || zipCode,
    };

    await RequestorOrganization.findByIdAndUpdate(org._id, {
      $set: {
        extracted: nextExtracted,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        businessId: String(org._id),
        organizationId: String(org._id),
        address: nextExtracted.address || "",
        addressDetail: nextExtracted.addressDetail || "",
        zipCode: nextExtracted.zipCode || "",
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: "의뢰인 배송지 수정 중 오류가 발생했습니다.",
      error: error.message,
      data: error?.data,
    });
  }
}

function isDuplicateKeyErrorForMongo(err) {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 ||
    name.includes("MongoServerError") ||
    msg.includes("E11000")
  );
}

async function grantWelcomeBonusIfEligible({ organizationId, userId }) {
  if (!organizationId) return null;

  const org = await RequestorOrganization.findById(organizationId)
    .select({ organizationType: 1, extracted: 1 })
    .lean();
  if (!org) return null;
  if (String(org.organizationType || "") !== "requestor") return null;

  const businessNumber = normalizeBusinessNumberDigits(
    org?.extracted?.businessNumber,
  );
  if (!businessNumber) return null;

  let grant = await BonusGrant.findOne({
    type: "WELCOME_BONUS",
    businessNumber,
    isOverride: false,
  })
    .select({ _id: 1, creditLedgerId: 1 })
    .lean();

  if (!grant) {
    try {
      const created = await BonusGrant.create({
        type: "WELCOME_BONUS",
        businessNumber,
        amount: WELCOME_BONUS_AMOUNT,
        businessId: organizationId,
        userId: userId || null,
        isOverride: false,
        source: "auto",
        grantedByUserId: null,
      });
      grant = { _id: created._id, creditLedgerId: created.creditLedgerId };
    } catch (e) {
      if (isDuplicateKeyErrorForMongo(e)) {
        grant = await BonusGrant.findOne({
          type: "WELCOME_BONUS",
          businessNumber,
          isOverride: false,
        })
          .select({ _id: 1, creditLedgerId: 1 })
          .lean();
      } else {
        throw e;
      }
    }
  }

  if (!grant?._id) return null;
  if (grant?.creditLedgerId) return null;

  const uniqueKey = `bonus_grant:${String(grant._id)}`;
  const result = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        businessId: organizationId,
        userId: userId || null,
        type: "BONUS",
        amount: WELCOME_BONUS_AMOUNT,
        refType: "WELCOME_BONUS",
        refId: organizationId,
        uniqueKey,
      },
    },
    { upsert: true },
  );

  if (!result?.upsertedCount) return null;

  const ledgerDoc = await CreditLedger.findOne({ uniqueKey })
    .select({ _id: 1 })
    .lean();

  await BonusGrant.updateOne(
    { _id: grant._id },
    { $set: { creditLedgerId: ledgerDoc?._id || null } },
  );

  await emitCreditBalanceUpdatedToOrganization({
    organizationId,
    balanceDelta: WELCOME_BONUS_AMOUNT,
    reason: "welcome_bonus",
    refId: ledgerDoc?._id || grant._id,
  });

  return WELCOME_BONUS_AMOUNT;
}

async function grantSalesmanReferralBonusIfEligible({
  organizationId,
  userId,
}) {
  if (!organizationId) return null;
  if (!userId) return null;

  const user = await User.findById(userId)
    .select({ referredByUserId: 1 })
    .lean();
  const referrerId = user?.referredByUserId;
  if (!referrerId) return null;

  const referrer = await User.findById(referrerId)
    .select({ role: 1, active: 1 })
    .lean();
  if (!referrer || referrer.active === false) return null;
  if (referrer.role !== "salesman") return null;

  const uniqueKey = `salesman_referral_bonus:org:${String(organizationId)}`;
  const result = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        organizationId,
        userId,
        type: "BONUS",
        amount: SALESMAN_REFERRAL_BONUS_AMOUNT,
        refType: "SALESMAN_REFERRAL_BONUS",
        refId: organizationId,
        uniqueKey,
      },
    },
    { upsert: true },
  );

  if (!result?.upsertedCount) return null;

  await emitCreditBalanceUpdatedToOrganization({
    organizationId,
    balanceDelta: SALESMAN_REFERRAL_BONUS_AMOUNT,
    reason: "salesman_referral_bonus",
    refId: organizationId,
  });

  return SALESMAN_REFERRAL_BONUS_AMOUNT;
}

export async function getMyOrganization(req, res) {
  try {
    res.set("x-abuts-handler", "requestorOrganization.getMyOrganization");
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    let orgName = "";
    orgName = String(req.user.business || req.user.organization || "").trim();
    const freshUser = await User.findById(req.user._id)
      .select({
        businessId: 1,
        business: 1,
        organizationId: 1,
        organization: 1,
      })
      .lean();
    const freshBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId;
    const freshBusinessName = String(
      freshUser?.business ||
        req.user.business ||
        freshUser?.organization ||
        req.user.organization ||
        "",
    ).trim();
    let org = await findOrganizationByAnchors({
      organizationType,
      businessId: freshBusinessId,
      businessNumber: "",
      userId: req.user._id,
      businessName: freshBusinessName || orgName,
    });
    console.info("[Organization] getMyOrganization anchors", {
      userId: String(req.user._id),
      organizationType,
      tokenBusinessId: String(req.user.businessId || ""),
      tokenOrganizationId: String(req.user.organizationId || ""),
      freshBusinessId: String(freshBusinessId || ""),
      tokenBusinessName: String(req.user.business || ""),
      tokenOrganizationName: orgName,
      freshBusinessName,
      resolvedBusinessId: String(org?._id || ""),
      resolvedBusinessName: String(org?.name || ""),
    });

    if (
      !org &&
      orgName &&
      String(req.user.referralCode || "").startsWith("mock_")
    ) {
      try {
        org = await RequestorOrganization.create({
          organizationType,
          name: orgName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          joinRequests: [],
        });
        await User.findByIdAndUpdate(req.user._id, {
          $set: {
            businessId: org._id,
            business: org.name,
            organizationId: org._id,
            organization: org.name,
          },
        });
      } catch (error) {
        return res.status(403).json({
          success: false,
          message: "내 사업자 생성 중 오류가 발생했습니다.",
          error: error.message,
        });
      }
    }

    if (!org) {
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
          shippingPolicy: {},
        },
      });
    }

    const ownerId = String(org.owner);
    const meId = String(req.user._id);
    const isOwner =
      Array.isArray(org.owners) && org.owners.some((c) => String(c) === meId);

    let membership = "none";
    if (ownerId === meId || isOwner) {
      membership = "owner";
    } else if (
      Array.isArray(org.members) &&
      org.members.some((m) => String(m) === meId)
    ) {
      membership = "member";
    } else if (
      Array.isArray(org.joinRequests) &&
      org.joinRequests.some(
        (r) => String(r?.user) === meId && String(r?.status) === "pending",
      )
    ) {
      membership = "pending";
    }

    if (
      (req.user.businessId || req.user.organizationId) &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessId: null,
          business: "",
          organizationId: null,
          organization: "",
        },
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          organization: null,
          hasBusinessNumber: false,
          businessVerified: false,
          extracted: {},
          businessLicense: {},
          shippingPolicy: org?.shippingPolicy || {},
        },
      });
    }

    if (
      !(req.user.businessId || req.user.organizationId) &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessId: org._id,
          business: org.name,
          organizationId: org._id,
          organization: org.name,
        },
      });
    }

    const safeOrg = {
      _id: org._id,
      name: org.name,
      owner: org.owner,
    };

    const businessNumber = String(org?.extracted?.businessNumber || "").trim();
    const hasBusinessNumber = !!businessNumber;
    const businessVerified = !!org?.verification?.verified;

    const shippingPolicy = org?.shippingPolicy || {};
    const safeShippingPolicy = { ...shippingPolicy };
    console.info("[Organization] getMyOrganization response", {
      userId: String(req.user._id),
      organizationId: String(org?._id || ""),
      membership,
      name: String(org?.name || ""),
      extracted: {
        companyName: String(org?.extracted?.companyName || "").trim(),
        businessNumber: String(org?.extracted?.businessNumber || "").trim(),
        address: String(org?.extracted?.address || "").trim(),
        addressDetail: String(org?.extracted?.addressDetail || "").trim(),
        zipCode: String(org?.extracted?.zipCode || "").trim(),
        phoneNumber: String(org?.extracted?.phoneNumber || "").trim(),
        email: String(org?.extracted?.email || "").trim(),
        representativeName: String(
          org?.extracted?.representativeName || "",
        ).trim(),
        businessType: String(org?.extracted?.businessType || "").trim(),
        businessItem: String(org?.extracted?.businessItem || "").trim(),
        startDate: String(org?.extracted?.startDate || "").trim(),
      },
      businessVerified,
    });

    return res.json({
      success: true,
      data: {
        membership,
        organization: safeOrg,
        hasBusinessNumber,
        businessVerified,
        extracted: org?.extracted || {},
        businessLicense: org?.businessLicense || {},
        shippingPolicy: safeShippingPolicy,
      },
    });
  } catch (error) {
    res.set("x-abuts-handler", "requestorOrganization.getMyOrganization");
    return res.status(500).json({
      success: false,
      message: "내 사업자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function searchOrganizations(req, res) {
  try {
    const userRole = String(req.user?.role || "").trim();
    if (!ORGANIZATION_ALLOWED_ROLE_SET.has(userRole) && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const rawType = String(req.query?.organizationType || "").trim();
    const requestedType = ORGANIZATION_ALLOWED_ROLE_SET.has(rawType)
      ? rawType
      : null;
    const organizationType =
      rawType === "all"
        ? null
        : requestedType || resolveOrganizationType(req.user, null);
    const orgTypeFilter = organizationType
      ? buildOrganizationTypeFilter(organizationType)
      : {};

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const orgs = await RequestorOrganization.find({
      ...orgTypeFilter,
      $or: [{ name: regex }, { "extracted.representativeName": regex }],
    })
      .select({ name: 1, extracted: 1 })
      .limit(20)
      .lean();

    const data = (orgs || []).map((o) => ({
      _id: o._id,
      name: o.name,
      representativeName: o?.extracted?.representativeName || "",
      businessNumber: o?.extracted?.businessNumber || "",
      address: o?.extracted?.address || "",
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공소 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateMyOrganization(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

    const hasOwn = (obj, key) =>
      !!obj && Object.prototype.hasOwnProperty.call(obj, key);

    const isDuplicateKeyError = (err) => {
      const code = err?.code;
      const name = String(err?.name || "");
      const msg = String(err?.message || "");
      return (
        code === 11000 || name === "MongoServerError" || msg.includes("E11000")
      );
    };

    const normalizeBusinessNumber = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (digits.length !== 10) return "";
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    };

    const normalizePhoneNumber = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
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

    const isValidAddress = (input) => {
      const v = String(input || "").trim();
      return v.length >= 5;
    };

    const normalizeStartDate = (input) => {
      const digits = String(input || "").replace(/\D/g, "");
      if (digits.length !== 8) return "";
      return digits;
    };

    const nextName = String(req.body?.name || "").trim();

    const representativeNameProvided = hasOwn(req.body, "representativeName");
    const businessItemProvided = hasOwn(req.body, "businessItem");
    const phoneNumberProvided = hasOwn(req.body, "phoneNumber");
    const businessNumberProvided = hasOwn(req.body, "businessNumber");
    const businessTypeProvided = hasOwn(req.body, "businessType");
    const emailProvided = hasOwn(req.body, "email");
    const addressProvided = hasOwn(req.body, "address");
    const addressDetailProvided = hasOwn(req.body, "addressDetail");
    const zipCodeProvided = hasOwn(req.body, "zipCode");
    const startDateProvided = hasOwn(req.body, "startDate");
    const shippingPolicyProvided = hasOwn(req.body, "shippingPolicy");

    const freshUser = await User.findById(req.user._id)
      .select({
        businessId: 1,
        business: 1,
        organizationId: 1,
        organization: 1,
      })
      .lean();
    const effectiveBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId ||
      null;
    const effectiveBusinessName = String(
      freshUser?.business ||
        req.user.business ||
        freshUser?.organization ||
        req.user.organization ||
        "",
    ).trim();
    const nextNameProvided = hasOwn(req.body, "name");
    let org = await findOrganizationByAnchors({
      organizationType,
      businessId: effectiveBusinessId,
      businessNumber: req.body?.businessNumber,
      userId: req.user._id,
      businessName: effectiveBusinessName,
    });
    const hasOrganization = Boolean(org?._id || effectiveBusinessId);
    console.info("[Organization] updateMyOrganization anchors", {
      userId: String(req.user._id),
      organizationType,
      tokenBusinessId: String(req.user.businessId || ""),
      freshBusinessId: String(freshUser?.businessId || ""),
      tokenOrganizationId: String(req.user.organizationId || ""),
      effectiveBusinessId: String(effectiveBusinessId || ""),
      tokenBusinessName: String(req.user.business || ""),
      tokenOrganizationName: String(req.user.organization || ""),
      effectiveBusinessName,
      resolvedBusinessId: String(org?._id || ""),
      resolvedBusinessName: String(org?.name || ""),
      payloadBusinessNumber: String(req.body?.businessNumber || ""),
      payloadName: String(req.body?.name || ""),
    });
    if (hasOrganization) {
      const meId = String(req.user._id);
      const canEdit =
        org &&
        (String(org.owner) === meId ||
          (Array.isArray(org.owners) &&
            org.owners.some((c) => String(c) === meId)));
      const nonShippingProvided =
        hasOwn(req.body, "name") ||
        representativeNameProvided ||
        businessItemProvided ||
        phoneNumberProvided ||
        businessNumberProvided ||
        businessTypeProvided ||
        emailProvided ||
        addressProvided ||
        addressDetailProvided ||
        zipCodeProvided ||
        startDateProvided ||
        hasOwn(req.body, "businessLicense");
      if (!canEdit && (nonShippingProvided || !shippingPolicyProvided)) {
        return res.status(403).json({
          success: false,
          message: "대표자 계정만 수정할 수 있습니다.",
        });
      }
    }

    const representativeName = String(
      req.body?.representativeName || "",
    ).trim();
    const businessItem = String(req.body?.businessItem || "").trim();
    const phoneNumberRaw = String(req.body?.phoneNumber || "").trim();
    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    const businessType = String(req.body?.businessType || "").trim();
    const email = String(req.body?.email || "").trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();
    const startDateRaw = String(req.body?.startDate || "").trim();
    const startDate = normalizeStartDate(startDateRaw);

    const businessLicenseInput = req.body?.businessLicense || null;
    const businessLicense = businessLicenseInput
      ? {
          fileId: businessLicenseInput?.fileId || null,
          s3Key: String(businessLicenseInput?.s3Key || "").trim(),
          originalName: String(businessLicenseInput?.originalName || "").trim(),
          uploadedAt: new Date(),
        }
      : null;

    const phoneNumber = phoneNumberRaw
      ? normalizePhoneNumber(phoneNumberRaw)
      : "";
    const businessNumber = businessNumberRaw
      ? normalizeBusinessNumber(businessNumberRaw)
      : "";
    const currentBusinessNumber = formatBusinessNumber(
      org?.extracted?.businessNumber || "",
    );
    const isBusinessNumberChanging =
      businessNumberProvided &&
      Boolean(currentBusinessNumber) &&
      Boolean(businessNumber) &&
      currentBusinessNumber !== businessNumber;
    const isVerifiedOrganization = Boolean(org?.verification?.verified);

    if (phoneNumberRaw && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "전화번호 형식이 올바르지 않습니다.",
      });
    }

    if (businessNumberRaw && !businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    if (isVerifiedOrganization && isBusinessNumberChanging) {
      return res.status(400).json({
        success: false,
        reason: "business_number_locked",
        message:
          "검증 완료된 사업자의 사업자등록번호는 직접 변경할 수 없습니다. 관리자에게 사업자 전환을 요청해주세요.",
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "세금계산서 이메일 형식이 올바르지 않습니다.",
      });
    }

    if (address && !isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "주소 형식이 올바르지 않습니다.",
      });
    }

    if (startDateRaw && !startDate) {
      return res.status(400).json({
        success: false,
        message: "개업연월일은 YYYYMMDD 8자리로 입력해주세요.",
      });
    }

    const normalizedAddressFields =
      addressProvided || zipCodeProvided
        ? await normalizeOrganizationAddressFields({ address, zipCode })
        : null;

    const originalBusinessId =
      freshUser?.businessId ||
      req.user.businessId ||
      freshUser?.organizationId ||
      req.user.organizationId ||
      null;
    let attachToOrg = null;
    if (businessNumber && isBusinessNumberChanging) {
      const existingOrgByBusinessNumber = await RequestorOrganization.findOne({
        ...orgTypeFilter,
        "extracted.businessNumber": businessNumber,
      });
      const meId = String(req.user._id);

      if (existingOrgByBusinessNumber) {
        const existingOwnerId = String(existingOrgByBusinessNumber.owner || "");
        const existingIsOwner =
          Array.isArray(existingOrgByBusinessNumber.owners) &&
          existingOrgByBusinessNumber.owners.some((c) => String(c) === meId);
        const existingIsMember =
          Array.isArray(existingOrgByBusinessNumber.members) &&
          existingOrgByBusinessNumber.members.some((m) => String(m) === meId);
        const isMyExistingOrg =
          existingOwnerId === meId || existingIsOwner || existingIsMember;

        if (isMyExistingOrg) {
          console.info(
            "[Organization] updateMyOrganization same-business own org",
            {
              userId: meId,
              currentResolvedOrgId: String(org?._id || ""),
              existingOrgByBusinessNumberId: String(
                existingOrgByBusinessNumber?._id || "",
              ),
              businessNumber,
            },
          );
          attachToOrg = existingOrgByBusinessNumber;
          org = existingOrgByBusinessNumber;
        }
      }

      if (
        existingOrgByBusinessNumber &&
        !attachToOrg &&
        (!org || String(existingOrgByBusinessNumber._id) !== String(org._id))
      ) {
        if (hasOrganization) {
          console.info("[Organization] updateMyOrganization conflict", {
            reason: "business_number_switch_requires_admin",
            userId: String(req.user._id),
            resolvedOrganizationId: String(org?._id || ""),
            existingOrgByBusinessNumberId: String(
              existingOrgByBusinessNumber?._id || "",
            ),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "business_number_switch_requires_admin",
            message:
              "기존 조직에 연결된 상태에서는 사업자등록번호로 다른 조직으로 전환할 수 없습니다. 관리자에게 사업자 전환을 요청해주세요.",
          });
        }
        const ownerId = String(existingOrgByBusinessNumber.owner || "");
        const isOwner =
          Array.isArray(existingOrgByBusinessNumber.owners) &&
          existingOrgByBusinessNumber.owners.some((c) => String(c) === meId);
        const isMember =
          Array.isArray(existingOrgByBusinessNumber.members) &&
          existingOrgByBusinessNumber.members.some((m) => String(m) === meId);

        if (ownerId === meId || isOwner || isMember) {
          console.info("[Organization] updateMyOrganization attachToOrg", {
            userId: String(req.user._id),
            attachToOrgId: String(existingOrgByBusinessNumber?._id || ""),
            businessNumber,
          });
          attachToOrg = existingOrgByBusinessNumber;
          org = existingOrgByBusinessNumber;
        } else {
          console.info("[Organization] updateMyOrganization conflict", {
            reason: "duplicate_business_number",
            userId: String(req.user._id),
            resolvedOrganizationId: String(org?._id || ""),
            existingOrgByBusinessNumberId: String(
              existingOrgByBusinessNumber?._id || "",
            ),
            businessNumber,
          });
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 조직에 가입 요청을 진행해주세요.",
          });
        }
      }
    }

    const patch = {};
    const unsetPatch = {};
    if (nextNameProvided && nextName) patch.name = nextName;

    if (
      businessLicense &&
      (businessLicense.s3Key || businessLicense.originalName)
    ) {
      patch.businessLicense = businessLicense;
    }

    const extractedPatch = {};
    if (nextNameProvided) extractedPatch.companyName = nextName;
    if (representativeNameProvided)
      extractedPatch.representativeName = representativeName;
    if (businessItemProvided) extractedPatch.businessItem = businessItem;
    if (phoneNumberProvided) extractedPatch.phoneNumber = phoneNumber;
    if (businessTypeProvided) extractedPatch.businessType = businessType;
    if (emailProvided) extractedPatch.email = email;
    if (addressProvided)
      extractedPatch.address =
        normalizedAddressFields?.address != null
          ? normalizedAddressFields.address
          : address;
    if (addressDetailProvided) extractedPatch.addressDetail = addressDetail;
    if (zipCodeProvided)
      extractedPatch.zipCode =
        normalizedAddressFields?.zipCode != null
          ? normalizedAddressFields.zipCode
          : zipCode;
    if (startDateProvided) extractedPatch.startDate = startDate;

    if (businessNumberProvided) {
      if (!businessNumber) {
        unsetPatch["extracted.businessNumber"] = 1;
      } else {
        extractedPatch.businessNumber = businessNumber;
      }
    }

    if (shippingPolicyProvided) {
      const rawDays = req.body?.shippingPolicy?.weeklyBatchDays;
      if (Array.isArray(rawDays)) {
        const normalizedDays = rawDays
          .map((day) => String(day).trim())
          .filter((day) => ["mon", "tue", "wed", "thu", "fri"].includes(day));
        patch["shippingPolicy.weeklyBatchDays"] = Array.from(
          new Set(normalizedDays),
        );
      }

      if (
        hasOwn(req.body?.shippingPolicy, "leadTimes") &&
        req.body?.shippingPolicy?.leadTimes
      ) {
        const clampLead = (v, fallback) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) return fallback;
          return Math.floor(n);
        };
        const rawLeadTimes = req.body?.shippingPolicy?.leadTimes || {};
        const nextLeadTimes = {};
        ["d6", "d8", "d10", "d12"].forEach((key) => {
          const entry = rawLeadTimes?.[key] || {};
          const min = clampLead(entry.minBusinessDays, 1);
          const max = clampLead(entry.maxBusinessDays, Math.max(min, 1));
          nextLeadTimes[key] = {
            minBusinessDays: Math.min(min, max),
            maxBusinessDays: Math.max(min, max),
          };
        });
        patch["shippingPolicy.leadTimes"] = nextLeadTimes;
      }

      patch["shippingPolicy.updatedAt"] = new Date();
    }

    if (businessNumber && !attachToOrg) {
      const query = {
        "extracted.businessNumber": businessNumber,
        ...orgTypeFilter,
      };
      if (org?._id) {
        query._id = { $ne: org._id };
      }
      const dup = await RequestorOrganization.findOne(query)
        .select({ _id: 1 })
        .lean();
      if (dup) {
        console.info("[Organization] updateMyOrganization conflict", {
          reason: "duplicate_business_number_post_patch",
          userId: String(req.user._id),
          resolvedOrganizationId: String(org?._id || ""),
          duplicateOrganizationId: String(dup?._id || ""),
          businessNumber,
        });
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message:
            "이미 등록된 사업자등록번호입니다. 기존 기공소에 가입 요청을 진행해주세요.",
        });
      }
    }

    let verificationResult = null;
    if (businessNumber) {
      verificationResult = await verifyBusinessNumber({
        businessNumber,
        companyName: nextName || org?.name || "",
        representativeName,
        startDate,
      });
      if (!verificationResult?.verified) {
        return res.status(400).json({
          success: false,
          reason: "business_verification_failed",
          message:
            verificationResult?.message ||
            "사업자등록번호 검증에 실패했습니다. 정보를 다시 확인해주세요.",
        });
      }
    }

    if (!hasOrganization && attachToOrg) {
      const priorLedgerCount = originalBusinessId
        ? await CreditLedger.countDocuments({ businessId: originalBusinessId })
        : 0;
      console.error("[ORGANIZATION_ATTACH_SWITCH]", {
        userId: String(req.user._id),
        originalBusinessId: originalBusinessId
          ? String(originalBusinessId)
          : null,
        nextBusinessId: String(attachToOrg._id),
        priorLedgerCount,
      });
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            businessId: attachToOrg._id,
            business: attachToOrg.name,
            organizationId: attachToOrg._id,
            organization: attachToOrg.name,
          },
        },
        { new: true },
      );

      const meId = String(req.user._id);
      const isMember =
        Array.isArray(attachToOrg.members) &&
        attachToOrg.members.some((m) => String(m) === meId);
      if (!isMember && String(attachToOrg.owner || "") !== meId) {
        await RequestorOrganization.findByIdAndUpdate(attachToOrg._id, {
          $addToSet: { members: req.user._id },
        });
      }

      return res.json({
        success: true,
        data: {
          attached: true,
          organizationId: attachToOrg._id,
          organizationName: attachToOrg.name,
        },
      });
    }

    if (!hasOrganization && !attachToOrg) {
      const requiredMissing =
        !nextName ||
        !representativeName ||
        !businessType ||
        !businessItem ||
        !address ||
        !email ||
        !phoneNumber ||
        !businessNumber ||
        !startDate;
      if (requiredMissing) {
        return res.status(400).json({
          success: false,
          message: "사업자 정보를 모두 입력해주세요.",
        });
      }

      try {
        const created = await RequestorOrganization.create({
          organizationType,
          name: nextName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          ...(businessLicense &&
          (businessLicense.s3Key || businessLicense.originalName)
            ? { businessLicense }
            : {}),
          extracted: {
            companyName: nextName,
            representativeName,
            businessItem,
            businessType,
            address,
            email,
            phoneNumber,
            businessNumber,
            startDate,
          },
          verification: verificationResult
            ? {
                verified: !!verificationResult.verified,
                provider: verificationResult.provider || "hometax",
                message: verificationResult.message || "",
                checkedAt: new Date(),
              }
            : undefined,
        });

        await User.findByIdAndUpdate(
          req.user._id,
          {
            $set: {
              businessId: created._id,
              business: created.name,
              organizationId: created._id,
              organization: created.name,
            },
          },
          { new: true },
        );

        const priorLedgerCount = originalBusinessId
          ? await CreditLedger.countDocuments({
              businessId: originalBusinessId,
            })
          : 0;
        console.error("[ORGANIZATION_CREATED_AND_ATTACHED]", {
          userId: String(req.user._id),
          originalBusinessId: originalBusinessId
            ? String(originalBusinessId)
            : null,
          createdBusinessId: String(created._id),
          priorLedgerCount,
          businessNumber,
        });

        const welcomeBonusAmount = await grantWelcomeBonusIfEligible({
          organizationId: created._id,
          userId: req.user._id,
        });
        await grantSalesmanReferralBonusIfEligible({
          organizationId: created._id,
          userId: req.user._id,
        });

        return res.json({
          success: true,
          data: {
            created: true,
            organizationId: created._id,
            organizationName: created.name,
            verification: created.verification || null,
            welcomeBonusGranted: !!welcomeBonusAmount,
            welcomeBonusAmount: Number(welcomeBonusAmount || 0),
          },
        });
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          const msg = String(e?.message || "");
          if (msg.includes("extracted.businessNumber")) {
            return res.status(409).json({
              success: false,
              reason: "duplicate_business_number",
              message:
                "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
            });
          }
        }
        throw e;
      }
    }

    if (verificationResult) {
      patch.verification = {
        verified: !!verificationResult.verified,
        provider: verificationResult.provider || "hometax",
        message: verificationResult.message || "",
        checkedAt: new Date(),
      };
    }

    for (const [k, v] of Object.entries(extractedPatch)) {
      patch[`extracted.${k}`] = v;
    }

    if (
      Object.keys(patch).length === 0 &&
      Object.keys(unsetPatch).length === 0
    ) {
      return res.json({ success: true, data: { updated: false } });
    }

    try {
      const update = {};
      if (Object.keys(patch).length > 0) update.$set = patch;
      if (Object.keys(unsetPatch).length > 0) update.$unset = unsetPatch;
      console.info("[Organization] updateMyOrganization persist", {
        userId: String(req.user._id),
        organizationId: String(org?._id || ""),
        patch,
        extractedPatch,
        unsetPatch,
      });
      await RequestorOrganization.findByIdAndUpdate(org._id, update);
      const persistedOrg = await RequestorOrganization.findById(org._id)
        .select({ name: 1, extracted: 1, verification: 1 })
        .lean();
      console.info("[Organization] updateMyOrganization persisted result", {
        organizationId: String(persistedOrg?._id || org?._id || ""),
        name: String(persistedOrg?.name || ""),
        extracted: {
          companyName: String(
            persistedOrg?.extracted?.companyName || "",
          ).trim(),
          businessNumber: String(
            persistedOrg?.extracted?.businessNumber || "",
          ).trim(),
          address: String(persistedOrg?.extracted?.address || "").trim(),
          addressDetail: String(
            persistedOrg?.extracted?.addressDetail || "",
          ).trim(),
          zipCode: String(persistedOrg?.extracted?.zipCode || "").trim(),
          phoneNumber: String(
            persistedOrg?.extracted?.phoneNumber || "",
          ).trim(),
          email: String(persistedOrg?.extracted?.email || "").trim(),
          representativeName: String(
            persistedOrg?.extracted?.representativeName || "",
          ).trim(),
          businessType: String(
            persistedOrg?.extracted?.businessType || "",
          ).trim(),
          businessItem: String(
            persistedOrg?.extracted?.businessItem || "",
          ).trim(),
          startDate: String(persistedOrg?.extracted?.startDate || "").trim(),
        },
        businessVerified: Boolean(persistedOrg?.verification?.verified),
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const msg = String(e?.message || "");
        if (msg.includes("extracted.businessNumber")) {
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
          });
        }
      }
      throw e;
    }

    if (
      nextName &&
      String(req.user.business || req.user.organization || "") !== nextName
    ) {
      await User.updateMany(
        { $or: [{ businessId: org._id }, { organizationId: org._id }] },
        {
          $set: {
            business: nextName,
            organization: nextName,
          },
        },
      );
    } else {
      await User.updateMany(
        { $or: [{ businessId: org._id }, { organizationId: org._id }] },
        {
          $set: {
            businessId: org._id,
            business: String(org?.name || nextName || "").trim(),
            organizationId: org._id,
            organization: String(org?.name || nextName || "").trim(),
          },
        },
      );
    }

    const granted = await grantWelcomeBonusIfEligible({
      organizationId: org._id,
      userId: req.user._id,
    });

    const salesmanGranted = await grantSalesmanReferralBonusIfEligible({
      organizationId: org._id,
      userId: req.user._id,
    });

    return res.json({
      success: true,
      data: {
        updated: true,
        welcomeBonusGranted: Boolean(granted),
        welcomeBonusAmount: granted || 0,
        salesmanReferralBonusGranted: Boolean(salesmanGranted),
        salesmanReferralBonusAmount: salesmanGranted || 0,
        verification: verificationResult
          ? {
              verified: !!verificationResult.verified,
              provider: verificationResult.provider || "hometax",
              message: verificationResult.message || "",
              checkedAt: new Date(),
            }
          : undefined,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자 정보 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearMyBusinessLicense(req, res) {
  try {
    const roleCheck = assertOrganizationRole(req, res);
    if (!roleCheck) return;
    const { organizationType } = roleCheck;
    const orgTypeFilter = { organizationType };

    if (!req.user.organizationId) {
      return res.status(200).json({
        success: true,
        data: { cleared: true },
      });
    }

    const org = await RequestorOrganization.findOne({
      _id: req.user.organizationId,
      ...orgTypeFilter,
    });
    const meId = String(req.user._id);
    const isOwner =
      org &&
      (String(org.owner) === meId ||
        (Array.isArray(org.owners) &&
          org.owners.some((c) => String(c) === meId)));
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    const key = String(org?.businessLicense?.s3Key || "").trim();
    if (key) {
      try {
        await s3Utils.deleteFileFromS3(key);
      } catch {}
    }

    const fileId = String(org?.businessLicense?.fileId || "").trim();
    if (fileId) {
      try {
        await File.findByIdAndDelete(fileId);
      } catch {}
    }

    await RequestorOrganization.findByIdAndUpdate(req.user.organizationId, {
      $set: {
        businessLicense: {
          fileId: null,
          s3Key: "",
          originalName: "",
          uploadedAt: null,
        },
        "extracted.companyName": "",
        "extracted.address": "",
        "extracted.zipCode": "",
        "extracted.phoneNumber": "",
        "extracted.email": "",
        "extracted.representativeName": "",
        "extracted.businessType": "",
        "extracted.businessItem": "",
        verification: {
          verified: false,
          provider: "",
          message: "",
          checkedAt: null,
        },
      },
      $unset: {
        "extracted.businessNumber": "",
      },
    });

    await User.updateMany(
      { $or: [{ businessId: org._id }, { organizationId: org._id }] },
      {
        $set: {
          businessId: null,
          business: "",
          organizationId: null,
          organization: "",
        },
      },
    );
    await RequestorOrganization.findByIdAndDelete(org._id);

    return res.json({
      success: true,
      data: { cleared: true, organizationRemoved: true },
    });
  } catch (error) {
    console.error(
      "[requestorOrganization] clearMyBusinessLicense error",
      {
        userId: req.user?._id,
        organizationId: req.user?.organizationId,
        message: error?.message,
      },
      error,
    );
    return res.status(500).json({
      success: false,
      message: "사업자등록증 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
