// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/businesses/business.routes.js
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import File from "../../models/file.model.js";
import {
  BUSINESS_ALLOWED_ROLE_SET,
  resolveBusinessType,
  assertBusinessRole,
  buildBusinessTypeFilter,
  buildBusinessTypeQuery,
} from "./businessRole.util.js";
import {
  lookupPostalCodeByAddress,
  normalizeBusinessAddressFields,
} from "./business.address.util.js";
import { findBusinessByAnchors } from "./business.find.util.js";
import { updateMyBusiness } from "./business.update.controller.js";
import { resolveRequestorPricingBaseDate } from "../requests/utils.js";
import {
  resolveRequestorProfile,
  requestorProfileResponseFields,
} from "../../utils/requestorCapabilities.js";
import {
  ensureRequestorOrgAnchor,
  isSyntheticPracticeBusinessNumber,
} from "./requestorOrgAnchor.util.js";
export { updateMyBusiness };

export async function checkBusinessNumberDuplicate(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

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
      return digits;
    };

    const businessNumber = normalizeBusinessNumber(businessNumberRaw);
    if (!businessNumber) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 형식이 올바르지 않습니다.",
      });
    }

    const freshUser = await User.findById(req.user._id)
      .select({ businessAnchorId: 1 })
      .lean();
    const effectiveBusinessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId || null;

    const existingAnchor = await BusinessAnchor.findOne({
      businessType,
      businessNumberNormalized: businessNumber,
      ...(effectiveBusinessAnchorId
        ? { _id: { $ne: effectiveBusinessAnchorId } }
        : {}),
    })
      .select({ _id: 1, primaryContactUserId: 1 })
      .lean();

    if (existingAnchor) {
      const meId = String(req.user._id);
      const existingOwnerId = String(existingAnchor.primaryContactUserId || "");

      if (existingOwnerId !== meId) {
        return res.status(409).json({
          success: false,
          reason: "duplicate_business_number",
          message:
            "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.",
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

export async function updateBusinessShippingAddress(req, res) {
  try {
    const actorRole = String(req.user?.role || "").trim();
    if (!["manufacturer", "admin"].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const businessId = String(
      req.body?.businessAnchorId || req.body?.businessId || "",
    ).trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessAnchorId가 필요합니다.",
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

    const normalizedAddressFields = await normalizeBusinessAddressFields({
      address,
      zipCode,
    });

    const anchor = await BusinessAnchor.findOne({
      _id: businessId,
      businessType: "requestor",
    });

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "의뢰인 사업자를 찾을 수 없습니다.",
      });
    }

    const nextMetadata = {
      ...(anchor.metadata || {}),
      address: normalizedAddressFields?.address || address,
      addressDetail,
      zipCode: normalizedAddressFields?.zipCode || zipCode,
    };

    await BusinessAnchor.findByIdAndUpdate(anchor._id, {
      $set: {
        metadata: nextMetadata,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        businessId: String(anchor._id),
        address: nextMetadata.address || "",
        addressDetail: nextMetadata.addressDetail || "",
        zipCode: nextMetadata.zipCode || "",
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

// 성능 최적화: getMyBusiness 캐시 (TTL 30초)
const __getMyBusinessCache = new Map();
const GET_MY_BUSINESS_CACHE_TTL = 30 * 1000;

function getMyBusinessCacheKey(userId, businessType) {
  return `${userId}:${businessType}`;
}

// 캐시 무효화 함수 (사업자 정보 업데이트 시 호출)
export function invalidateMyBusinessCache(businessAnchorId) {
  if (!businessAnchorId) return 0;
  let removed = 0;
  for (const key of __getMyBusinessCache.keys()) {
    __getMyBusinessCache.delete(key);
    removed++;
  }
  return removed;
}

export async function getMyBusiness(req, res) {
  try {
    res.set("x-abuts-handler", "business.getMyBusiness");
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    // 캐시 확인
    const cacheKey = getMyBusinessCacheKey(req.user._id, businessType);
    const cached = __getMyBusinessCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GET_MY_BUSINESS_CACHE_TTL) {
      return res.json(cached.data);
    }

    const freshUser = await User.findById(req.user._id)
      .select({
        businessAnchorId: 1,
        business: 1,
        role: 1,
        subRole: 1,
        email: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        practiceProfile: 1,
        referredByAnchorId: 1,
        approvedAt: 1,
        createdAt: 1,
      })
      .lean();
    let businessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId;

    let anchor = null;
    if (businessAnchorId) {
      anchor = await BusinessAnchor.findOne({
        _id: businessAnchorId,
        businessType,
      }).lean();

      // 레거시 businessType=practice 앵커 → requestor로 승격 후 사용
      if (
        !anchor &&
        (businessType === "requestor" || businessType === "practice")
      ) {
        const legacy = await BusinessAnchor.findById(businessAnchorId).lean();
        if (legacy && String(legacy.businessType || "") === "practice") {
          await BusinessAnchor.updateOne(
            { _id: legacy._id },
            { $set: { businessType: "requestor" } },
          );
          anchor = { ...legacy, businessType: "requestor" };
        }
      }
    }

    // 발신 프로필 완료 + 무앵커 → Org 앵커 치유 (대표자)
    if (
      !anchor &&
      (businessType === "requestor" || businessType === "practice")
    ) {
      try {
        const ensured = await ensureRequestorOrgAnchor({
          user: { ...req.user, ...freshUser },
        });
        if (ensured?._id) {
          businessAnchorId = ensured._id;
          anchor = await BusinessAnchor.findById(ensured._id).lean();
          invalidateMyBusinessCache(req.user._id);
        }
      } catch (e) {
        console.error("[BusinessAnchor] getMyBusiness ensure failed", e);
      }
    }

    console.info("[BusinessAnchor] getMyBusiness", {
      userId: String(req.user._id),
      businessType,
      businessAnchorId: String(businessAnchorId || ""),
      found: !!anchor,
    });

    if (!anchor) {
      const profile = resolveRequestorProfile({
        userKind: freshUser?.requestorKind,
        userServices: freshUser?.requestorServices,
        userCaps: freshUser?.requestorCapabilities,
        userRole: freshUser?.role || req.user.role,
        businessVerified: false,
      });
      const pricingBaseDate = await resolveRequestorPricingBaseDate({
        requestorId: req.user._id,
        requestorOrgId: null,
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          business: null,
          hasBusinessNumber: false,
          businessVerified: false,
          metadata: {},
          payoutAccount: {},
          pricingBaseDate: pricingBaseDate || null,
          ...requestorProfileResponseFields(profile),
          designAccessEnabled: false,
        },
      });
    }

    const meId = String(req.user._id);
    const primaryContactId = String(anchor.primaryContactUserId || "");
    const isOwner =
      Array.isArray(anchor.owners) &&
      anchor.owners.some((c) => String(c) === meId);

    let membership = "none";
    if (primaryContactId === meId || isOwner) {
      membership = "owner";
    } else if (
      Array.isArray(anchor.members) &&
      anchor.members.some((m) => String(m) === meId)
    ) {
      membership = "member";
    } else if (
      Array.isArray(anchor.joinRequests) &&
      anchor.joinRequests.some(
        (r) => String(r?.user) === meId && String(r?.status) === "pending",
      )
    ) {
      membership = "pending";
    }

    if (
      req.user.businessAnchorId &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessAnchorId: null,
          business: "",
        },
      });
      const pricingBaseDate = await resolveRequestorPricingBaseDate({
        requestorId: req.user._id,
        requestorOrgId: null,
      });
      return res.json({
        success: true,
        data: {
          membership: "none",
          business: null,
          hasBusinessNumber: false,
          businessVerified: false,
          metadata: {},
          payoutAccount: {},
          pricingBaseDate: pricingBaseDate || null,
          ...requestorProfileResponseFields(
            resolveRequestorProfile({
              userKind: req.user?.requestorKind,
              userServices: req.user?.requestorServices,
              userCaps: req.user?.requestorCapabilities,
              userRole: req.user?.role,
              businessVerified: false,
            }),
          ),
        },
      });
    }

    if (
      !req.user.businessAnchorId &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          businessAnchorId: anchor._id,
          business: anchor.name,
        },
      });
    }

    const safeBusiness = {
      _id: anchor._id,
      name: anchor.name,
      owner: anchor.primaryContactUserId,
    };

    const businessNumber = String(
      anchor?.businessNumberNormalized || "",
    ).trim();
    const hasBusinessNumber =
      !!businessNumber && !isSyntheticPracticeBusinessNumber(businessNumber);
    const businessVerified = anchor.status === "verified";

    // SSOT: metadata만 반환 (extracted 레거시 제거, 2026-03-31)
    // AI 파싱 후 사용자 확인/검증을 거친 데이터는 metadata에 저장
    const metadata = anchor?.metadata || {};

    // related files:
    // - web/backend/controllers/requests/utils.js
    // - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
    // 신규 기공소 90일 고정가와 동일 기준일(가입 승인일 우선)을 노출한다.
    const pricingBaseDate = await resolveRequestorPricingBaseDate({
      requestorId: req.user._id,
      requestorOrgId: anchor._id,
    });

    const capsUser = await User.findById(req.user._id)
      .select({
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        role: 1,
      })
      .lean();
    const requestorProfile = resolveRequestorProfile({
      anchorKind: anchor.requestorKind,
      anchorServices: anchor.requestorServices,
      anchorCaps: anchor.requestorCapabilities,
      userKind: capsUser?.requestorKind,
      userServices: capsUser?.requestorServices,
      userCaps: capsUser?.requestorCapabilities,
      userRole: capsUser?.role || req.user.role,
      businessVerified,
    });

    const responseData = {
      success: true,
      data: {
        membership,
        business: safeBusiness,
        businessId: anchor._id,
        hasBusinessNumber,
        businessVerified,
        metadata, // SSOT
        businessLicense: anchor?.businessLicense || null,
        payoutAccount: anchor?.payoutAccount || {},
        shippingPolicy: anchor?.shippingPolicy || null,
        pricingBaseDate: pricingBaseDate || null,
        ...requestorProfileResponseFields(requestorProfile),
        designAccessEnabled:
          businessType === "requestor"
            ? Boolean(anchor?.designAccessEnabled)
            : false,
        requestSettings: {
          anodizingEnabled:
            typeof anchor?.requestSettings?.anodizingEnabled === "boolean"
              ? anchor.requestSettings.anodizingEnabled
              : true,
          designSoftware: normalizeDesignSoftware(
            anchor?.requestSettings?.designSoftware,
          ),
          updatedAt: anchor?.requestSettings?.updatedAt || null,
        },
      },
    };

    // 캐시 저장
    __getMyBusinessCache.set(cacheKey, {
      ts: Date.now(),
      data: responseData,
    });

    return res.json(responseData);
  } catch (error) {
    res.set("x-abuts-handler", "business.getMyBusiness");
    return res.status(500).json({
      success: false,
      message: "내 사업자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function searchBusinesses(req, res) {
  try {
    const userRole = String(req.user?.role || "").trim();
    const isAnonymous = !userRole;

    if (!isAnonymous && !BUSINESS_ALLOWED_ROLE_SET.has(userRole) && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const rawType = String(req.query?.businessType || "").trim();
    const requestedType = BUSINESS_ALLOWED_ROLE_SET.has(rawType)
      ? rawType
      : null;

    const businessType = isAnonymous
      ? rawType === "all"
        ? null
        : requestedType
      : rawType === "all"
        ? null
        : requestedType || resolveBusinessType(req.user, null);

    // admin 타입 anchor는 일반 사용자/비로그인 검색에서 제외
    if (businessType === "admin" && userRole !== "admin") {
      return res.json({ success: true, data: [] });
    }
    // businessType이 없을 때 non-admin(비로그인 포함)은 admin anchor를 검색 결과에서 제외
    // requestor 검색은 레거시 businessType=practice 앵커도 포함
    const typeFilter =
      businessType === "requestor"
        ? {
            $or: [
              { businessType: "requestor" },
              { businessType: "practice" },
              {
                $and: [
                  {
                    $or: [
                      { businessType: { $exists: false } },
                      { businessType: "" },
                    ],
                  },
                  {
                    "metadata.businessType": {
                      $in: ["requestor", "practice"],
                    },
                  },
                ],
              },
            ],
          }
        : buildBusinessTypeQuery(businessType);
    const adminExcludeFilter =
      !businessType && userRole !== "admin"
        ? { businessType: { $ne: "admin" } }
        : null;

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    // BusinessAnchor가 법적 식별/소개/정산 SSOT
    // Business는 멤버십/조직 UI 컨테이너일 뿐이므로 검색 대상이 아님
    // $or 중복 spread 방지: typeFilter와 이름 $or를 $and로 결합
    const regex = new RegExp(q, "i");
    const idClause = Types.ObjectId.isValid(q)
      ? { _id: new Types.ObjectId(q) }
      : null;

    const nameOrIdClauses = {
      $or: [
        ...(idClause ? [idClause] : []),
        { name: regex },
        { "metadata.companyName": regex },
        { "metadata.representativeName": regex },
      ],
    };

    const andClauses = [nameOrIdClauses];
    if (Object.keys(typeFilter).length > 0) andClauses.push(typeFilter);
    if (adminExcludeFilter) andClauses.push(adminExcludeFilter);
    const searchQuery =
      andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
    const anchors = await BusinessAnchor.find(searchQuery)
      .select({
        name: 1,
        metadata: 1,
        businessNumberNormalized: 1,
        businessType: 1,
        primaryContactUserId: 1,
      })
      .limit(20)
      .lean();

    const ownerIds = (anchors || [])
      .map((a) => String(a?.primaryContactUserId || ""))
      .filter(Boolean);

    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select({ _id: 1, role: 1 })
          .lean()
      : [];
    const ownerPracticeMap = new Map(
      (owners || []).map((u) => [String(u?._id || ""), String(u?.role || "") === "practice"]),
    );

    const searchingPractice = String(businessType || "") === "practice";
    const searchingRequestor = String(businessType || "") === "requestor";
    const data = (anchors || [])
      .filter((a) => {
        const bn = String(a?.businessNumberNormalized || "")
          .trim()
          .toLowerCase();

        // 무BN(synthetic practice-*) requestor 앵커는 의뢰자/레거시 practice 검색에만 노출
        if (
          isSyntheticPracticeBusinessNumber(bn) &&
          !searchingPractice &&
          !searchingRequestor
        ) {
          return false;
        }

        const ownerId = String(a?.primaryContactUserId || "");
        const isPracticeOwner = ownerPracticeMap.get(ownerId) === true;
        if (!searchingPractice && !searchingRequestor && isPracticeOwner) {
          return false;
        }

        return true;
      })
      .map((a) => ({
        _id: a._id,
        name: a.name,
        representativeName: a?.metadata?.representativeName || "",
        businessNumber: isSyntheticPracticeBusinessNumber(
          a?.businessNumberNormalized,
        )
          ? ""
          : a?.businessNumberNormalized || "",
        address: a?.metadata?.address || "",
        businessType: a?.businessType || a?.metadata?.businessType || "",
      }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getBusinessPublicById(req, res) {
  try {
    const userRole = String(req.user?.role || "").trim();
    const isAnonymous = !userRole;

    if (!isAnonymous && !BUSINESS_ALLOWED_ROLE_SET.has(userRole) && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const businessId = String(req.params?.id || "").trim();
    if (!Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사업자 ID입니다.",
      });
    }

    const rawType = String(req.query?.businessType || "").trim();
    const requestedType = BUSINESS_ALLOWED_ROLE_SET.has(rawType)
      ? rawType
      : null;

    const requestedBusinessType = isAnonymous
      ? rawType === "all"
        ? null
        : requestedType
      : rawType === "all"
        ? null
        : requestedType || resolveBusinessType(req.user, null);

    const anchor = await BusinessAnchor.findById(businessId)
      .select({
        name: 1,
        metadata: 1,
        businessNumberNormalized: 1,
        businessType: 1,
        primaryContactUserId: 1,
      })
      .lean();

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const anchorType = String(anchor.businessType || "").trim();
    if (
      requestedBusinessType &&
      anchorType !== requestedBusinessType &&
      !(
        requestedBusinessType === "requestor" && anchorType === "practice"
      )
    ) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    if (!requestedBusinessType && userRole !== "admin" && anchorType === "admin") {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const bn = String(anchor.businessNumberNormalized || "").trim().toLowerCase();
    const searchingRequestor =
      String(requestedBusinessType || "") === "requestor" ||
      userRole === "requestor";
    const searchingPractice =
      String(requestedBusinessType || "") === "practice" ||
      userRole === "practice";
    if (
      isSyntheticPracticeBusinessNumber(bn) &&
      !searchingPractice &&
      !searchingRequestor &&
      userRole !== "admin"
    ) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const ownerId = String(anchor.primaryContactUserId || "").trim();
    if (
      ownerId &&
      Types.ObjectId.isValid(ownerId) &&
      !searchingPractice &&
      !searchingRequestor &&
      userRole !== "admin"
    ) {
      const owner = await User.findById(ownerId).select({ role: 1 }).lean();
      if (String(owner?.role || "").trim() === "practice") {
        return res.status(404).json({
          success: false,
          message: "사업자를 찾을 수 없습니다.",
        });
      }
    }

    return res.json({
      success: true,
      data: {
        _id: anchor._id,
        name: String(anchor.name || "").trim(),
        representativeName: String(anchor?.metadata?.representativeName || "").trim(),
        businessNumber: isSyntheticPracticeBusinessNumber(
          anchor.businessNumberNormalized,
        )
          ? ""
          : String(anchor.businessNumberNormalized || "").trim(),
        address: String(anchor?.metadata?.address || "").trim(),
        businessType: anchorType,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사업자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearMyBusinessLicense(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    if (!req.user.businessAnchorId) {
      return res.status(200).json({
        success: true,
        data: { cleared: true },
      });
    }

    const anchor = await BusinessAnchor.findOne({
      _id: req.user.businessAnchorId,
      businessType,
    });

    const meId = String(req.user._id);
    const isOwner =
      anchor &&
      (String(anchor.primaryContactUserId) === meId ||
        (Array.isArray(anchor.owners) &&
          anchor.owners.some((c) => String(c) === meId)));
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 삭제할 수 있습니다.",
      });
    }

    await BusinessAnchor.findByIdAndUpdate(req.user.businessAnchorId, {
      $set: {
        "metadata.companyName": "",
        "metadata.address": "",
        "metadata.zipCode": "",
        "metadata.phoneNumber": "",
        "metadata.email": "",
        "metadata.representativeName": "",
        "metadata.businessItem": "",
        "metadata.businessType": "",
        "metadata.startDate": "",
        status: "draft",
      },
      $unset: {
        businessNumberNormalized: "",
      },
    });

    await User.updateMany(
      { businessAnchorId: anchor._id },
      {
        $set: {
          businessAnchorId: null,
          business: "",
        },
      },
    );

    return res.json({
      success: true,
      data: { cleared: true },
    });
  } catch (error) {
    console.error(
      "[business] clearMyBusinessLicense error",
      {
        userId: req.user?._id,
        businessAnchorId: req.user?.businessAnchorId,
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

function getAnchorMembership(anchor, user) {
  if (!anchor) return "none";

  const meId = String(user?._id || user || "");
  const subRole = String(user?.subRole || "").trim();

  const primaryContactId = String(anchor.primaryContactUserId || "");
  const isOwner =
    Array.isArray(anchor.owners) &&
    anchor.owners.some((ownerId) => String(ownerId) === meId);

  if (primaryContactId === meId || isOwner) return "owner";

  const isMember =
    Array.isArray(anchor.members) &&
    anchor.members.some((memberId) => String(memberId) === meId);
  if (isMember) return "member";

  // 레거시/불완전 anchor 데이터(primaryContact/owners/members 누락) 보호:
  // subRole을 권한 판정의 최종 폴백으로 사용한다.
  if (subRole === "owner") return "owner";
  if (subRole === "staff") return "member";

  return "none";
}

function normalizeRequestorHexRotation(value) {
  const v = String(value || "").trim();
  if (v === "헥스30도회전" || v === "30") return "헥스30도회전";
  return "STL모델대로";
}

// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/frontend/src/features/settings/tabs/RequestTab.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
function normalizeDesignSoftware(value) {
  const v = String(value || "").trim();
  return v ? v : null;
}

/**
 * 기공소(사업체) 의뢰 기본 설정 조회
 * @route GET /api/businesses/me/request-settings
 */
export async function getMyRequestSettings(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const freshUser = await User.findById(req.user._id)
      .select({
        businessAnchorId: 1,
        subRole: 1,
        "requestSettings.designSoftware": 1,
      })
      .lean();
    const businessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId || null;

    const requestorDesignSoftware = normalizeDesignSoftware(
      freshUser?.requestSettings?.designSoftware,
    );

    if (!businessAnchorId) {
      return res.status(200).json({
        success: true,
        data: {
          scope: "business",
          membership: "none",
          canEdit: false,
          canEditDesignSoftware: false,
          anodizingEnabled: true,
          designSoftware: null,
          requestorDesignSoftware,
          defaultRequestorHexRotation: "STL모델대로",
          updatedAt: null,
        },
      });
    }

    const anchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      businessType,
    })
      .select({
        primaryContactUserId: 1,
        owners: 1,
        members: 1,
        requestSettings: 1,
      })
      .lean();

    const membership = getAnchorMembership(anchor, {
      _id: req.user._id,
      subRole: freshUser?.subRole || req.user?.subRole,
    });
    const businessDesignSoftware = normalizeDesignSoftware(
      anchor?.requestSettings?.designSoftware,
    );

    return res.status(200).json({
      success: true,
      data: {
        scope: "business",
        membership,
        canEdit: membership === "owner",
        canEditDesignSoftware: membership === "owner" || membership === "member",
        anodizingEnabled:
          typeof anchor?.requestSettings?.anodizingEnabled === "boolean"
            ? anchor.requestSettings.anodizingEnabled
            : true,
        // 하위 호환: designSoftware는 사업체 공통 기본값을 유지한다.
        designSoftware: businessDesignSoftware,
        requestorDesignSoftware,
        defaultRequestorHexRotation: normalizeRequestorHexRotation(
          anchor?.requestSettings?.defaultRequestorHexRotation,
        ),
        updatedAt: anchor?.requestSettings?.updatedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "의뢰 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 기공소(사업체) 의뢰 기본 설정 수정
 * @route PUT /api/businesses/me/request-settings
 */
export async function updateMyRequestSettings(req, res) {
  try {
    const roleCheck = assertBusinessRole(req, res);
    if (!roleCheck) return;
    const { businessType } = roleCheck;

    const hasAnodizingEnabled = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "anodizingEnabled",
    );
    const hasDefaultRequestorHexRotation = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "defaultRequestorHexRotation",
    );
    const hasDesignSoftware = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "designSoftware",
    );
    const hasRequestorDesignSoftware = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "requestorDesignSoftware",
    );

    if (
      !hasAnodizingEnabled &&
      !hasDefaultRequestorHexRotation &&
      !hasDesignSoftware &&
      !hasRequestorDesignSoftware
    ) {
      return res.status(400).json({
        success: false,
        message:
          "유효하지 않은 의뢰 설정입니다. anodizingEnabled, defaultRequestorHexRotation, designSoftware 또는 requestorDesignSoftware가 필요합니다.",
      });
    }

    const anodizingEnabled = req.body?.anodizingEnabled;
    if (hasAnodizingEnabled && typeof anodizingEnabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message:
          "유효하지 않은 의뢰 설정입니다. anodizingEnabled는 boolean이어야 합니다.",
      });
    }

    let defaultRequestorHexRotation;
    if (hasDefaultRequestorHexRotation) {
      const raw = String(req.body?.defaultRequestorHexRotation || "").trim();
      if (raw !== "STL모델대로" && raw !== "헥스30도회전") {
        return res.status(400).json({
          success: false,
          message:
            "유효하지 않은 의뢰 설정입니다. defaultRequestorHexRotation은 'STL모델대로' 또는 '헥스30도회전'이어야 합니다.",
        });
      }
      defaultRequestorHexRotation = raw;
    }

    let designSoftware;
    if (hasDesignSoftware) {
      const raw = String(req.body?.designSoftware || "").trim();
      if (!raw) {
        return res.status(400).json({
          success: false,
          message:
            "유효하지 않은 의뢰 설정입니다. designSoftware는 비어 있을 수 없습니다.",
        });
      }
      if (raw.length > 120) {
        return res.status(400).json({
          success: false,
          message:
            "유효하지 않은 의뢰 설정입니다. designSoftware는 120자 이하여야 합니다.",
        });
      }
      designSoftware = raw;
    }

    let requestorDesignSoftware;
    if (hasRequestorDesignSoftware) {
      if (String(req.user?.role || "") !== "requestor") {
        return res.status(403).json({
          success: false,
          message: "의뢰자 계정만 개인 디자인 소프트웨어를 저장할 수 있습니다.",
        });
      }

      const raw = String(req.body?.requestorDesignSoftware || "").trim();
      if (!raw) {
        return res.status(400).json({
          success: false,
          message:
            "유효하지 않은 의뢰 설정입니다. requestorDesignSoftware는 비어 있을 수 없습니다.",
        });
      }
      if (raw.length > 120) {
        return res.status(400).json({
          success: false,
          message:
            "유효하지 않은 의뢰 설정입니다. requestorDesignSoftware는 120자 이하여야 합니다.",
        });
      }
      requestorDesignSoftware = raw;
    }

    const freshUser = await User.findById(req.user._id)
      .select({
        businessAnchorId: 1,
        subRole: 1,
        "requestSettings.designSoftware": 1,
      })
      .lean();
    const businessAnchorId =
      freshUser?.businessAnchorId || req.user.businessAnchorId || null;

    const needsOwnerPermission =
      hasAnodizingEnabled || hasDefaultRequestorHexRotation;
    const needsBusinessDesignSoftwarePermission = hasDesignSoftware;

    let anchor = null;
    let membership = "none";

    if (businessAnchorId) {
      anchor = await BusinessAnchor.findOne({
        _id: businessAnchorId,
        businessType,
      })
        .select({
          primaryContactUserId: 1,
          owners: 1,
          members: 1,
          requestSettings: 1,
        })
        .lean();

      membership = getAnchorMembership(anchor, {
        _id: req.user._id,
        subRole: freshUser?.subRole || req.user?.subRole,
      });
    }

    if ((needsOwnerPermission || needsBusinessDesignSoftwarePermission) && !businessAnchorId) {
      return res.status(404).json({
        success: false,
        message: "소속된 기공소를 찾을 수 없습니다.",
      });
    }

    if (needsOwnerPermission && membership !== "owner") {
      return res.status(403).json({
        success: false,
        message: "대표자 계정만 기공소 의뢰 설정을 변경할 수 있습니다.",
      });
    }

    if (
      needsBusinessDesignSoftwarePermission &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "사업자 구성원(대표/직원)만 기공소 디자인 소프트웨어를 변경할 수 있습니다.",
      });
    }

    const now = new Date();
    let updatedAnchor = null;
    let propagatedRequestorDesignSoftwareCount = 0;
    if (needsOwnerPermission || needsBusinessDesignSoftwarePermission) {
      const setPayload = {
        "requestSettings.updatedAt": now,
      };

      if (hasAnodizingEnabled) {
        setPayload["requestSettings.anodizingEnabled"] = anodizingEnabled;
      }
      if (hasDefaultRequestorHexRotation) {
        setPayload["requestSettings.defaultRequestorHexRotation"] =
          defaultRequestorHexRotation;
      }
      if (hasDesignSoftware) {
        setPayload["requestSettings.designSoftware"] = designSoftware;
      }

      updatedAnchor = await BusinessAnchor.findByIdAndUpdate(
        businessAnchorId,
        {
          $set: setPayload,
        },
        {
          new: true,
          runValidators: true,
        },
      ).select({ requestSettings: 1 });

      // BusinessAnchor 공통 기본값 변경 시, 개인 설정이 비어 있는 의뢰자 계정에만 기본값 주입
      if (hasDesignSoftware && designSoftware) {
        const propagateResult = await User.updateMany(
          {
            businessAnchorId,
            role: "requestor",
            $or: [
              { "requestSettings.designSoftware": { $exists: false } },
              { "requestSettings.designSoftware": null },
              { "requestSettings.designSoftware": "" },
            ],
          },
          {
            $set: {
              "requestSettings.designSoftware": designSoftware,
              "requestSettings.updatedAt": now,
            },
          },
        );
        propagatedRequestorDesignSoftwareCount = Number(
          propagateResult?.modifiedCount || 0,
        );
      }

      invalidateMyBusinessCache(businessAnchorId);
    }

    let updatedRequestorDesignSoftware = normalizeDesignSoftware(
      freshUser?.requestSettings?.designSoftware,
    );

    if (hasRequestorDesignSoftware) {
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            "requestSettings.designSoftware": requestorDesignSoftware,
            "requestSettings.updatedAt": now,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      ).select({ requestSettings: 1 });

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다.",
        });
      }

      updatedRequestorDesignSoftware = normalizeDesignSoftware(
        updatedUser?.requestSettings?.designSoftware,
      );
    }

    const requestSettingsSource = updatedAnchor?.requestSettings || anchor?.requestSettings;
    const businessDesignSoftware = normalizeDesignSoftware(
      requestSettingsSource?.designSoftware,
    );

    return res.status(200).json({
      success: true,
      message: "의뢰 설정이 성공적으로 수정되었습니다.",
      data: {
        scope: "business",
        membership,
        canEdit: membership === "owner",
        canEditDesignSoftware: membership === "owner" || membership === "member",
        anodizingEnabled:
          typeof requestSettingsSource?.anodizingEnabled === "boolean"
            ? requestSettingsSource.anodizingEnabled
            : true,
        // 하위 호환: designSoftware는 사업체 공통 기본값을 유지한다.
        designSoftware: businessDesignSoftware,
        requestorDesignSoftware: updatedRequestorDesignSoftware,
        defaultRequestorHexRotation: normalizeRequestorHexRotation(
          requestSettingsSource?.defaultRequestorHexRotation,
        ),
        updatedAt: requestSettingsSource?.updatedAt || null,
        propagatedRequestorDesignSoftwareCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "의뢰 설정 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
