import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import File from "../../models/file.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import { verifyBusinessNumber } from "../../services/hometax.service.js";

const WELCOME_BONUS_AMOUNT = 30000;

function normalizeBusinessNumberDigits(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
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
    .select({ extracted: 1 })
    .lean();
  if (!org) return null;

  const businessNumber = normalizeBusinessNumberDigits(
    org?.extracted?.businessNumber
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
        organizationId,
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
        organizationId,
        userId: userId || null,
        type: "BONUS",
        amount: WELCOME_BONUS_AMOUNT,
        refType: "WELCOME_BONUS",
        refId: organizationId,
        uniqueKey,
      },
    },
    { upsert: true }
  );

  if (!result?.upsertedCount) return null;

  const ledgerDoc = await CreditLedger.findOne({ uniqueKey })
    .select({ _id: 1 })
    .lean();

  await BonusGrant.updateOne(
    { _id: grant._id },
    { $set: { creditLedgerId: ledgerDoc?._id || null } }
  );

  return WELCOME_BONUS_AMOUNT;
}

export async function getMyOrganization(req, res) {
  try {
    res.set("x-abuts-handler", "requestorOrganization.getMyOrganization");
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }
    let org = null;
    let orgName = "";
    if (req.user.organizationId) {
      org = await RequestorOrganization.findById(req.user.organizationId);
    } else {
      orgName = String(req.user.organization || "").trim();
      if (orgName) {
        if (String(req.user.referralCode || "").startsWith("mock_")) {
          org = await RequestorOrganization.findOne({ name: orgName });
          if (!org) {
            org = await RequestorOrganization.create({
              name: orgName,
              owner: req.user._id,
              owners: [],
              members: [req.user._id],
              joinRequests: [],
            });
            await User.findByIdAndUpdate(req.user._id, {
              $set: { organizationId: org._id, organization: org.name },
            });
          }
        } else {
          const matches = await RequestorOrganization.find({ name: orgName })
            .select({ _id: 1 })
            .limit(2)
            .lean();
          if (Array.isArray(matches) && matches.length === 0) {
            try {
              org = await RequestorOrganization.create({
                name: orgName,
                owner: req.user._id,
                owners: [],
                members: [req.user._id],
                joinRequests: [],
              });
              await User.findByIdAndUpdate(req.user._id, {
                $set: { organizationId: org._id, organization: org.name },
              });
            } catch {
              // ignore
            }
          } else if (Array.isArray(matches) && matches.length === 1) {
            org = await RequestorOrganization.findById(matches[0]._id);

            if (org) {
              const meId = String(req.user._id);
              const ownerId = String(org.owner);
              const isOwner =
                Array.isArray(org.owners) &&
                org.owners.some((c) => String(c) === meId);
              const isMember =
                Array.isArray(org.members) &&
                org.members.some((m) => String(m) === meId);

              if (ownerId !== meId && !isOwner && !isMember) {
                try {
                  org = await RequestorOrganization.create({
                    name: orgName,
                    owner: req.user._id,
                    owners: [],
                    members: [req.user._id],
                    joinRequests: [],
                  });
                  await User.findByIdAndUpdate(req.user._id, {
                    $set: { organizationId: org._id, organization: org.name },
                  });
                } catch {
                  // ignore
                }
              }
            }
          } else {
            const owned = await RequestorOrganization.findOne({
              name: orgName,
              $or: [{ owner: req.user._id }, { owners: req.user._id }],
            })
              .select({ _id: 1 })
              .lean();

            if (owned?._id) {
              org = await RequestorOrganization.findById(owned._id);
            } else {
              const memberOrg = await RequestorOrganization.findOne({
                name: orgName,
                members: req.user._id,
              })
                .select({ _id: 1 })
                .lean();

              if (memberOrg?._id) {
                org = await RequestorOrganization.findById(memberOrg._id);
              } else {
                try {
                  org = await RequestorOrganization.create({
                    name: orgName,
                    owner: req.user._id,
                    owners: [],
                    members: [req.user._id],
                    joinRequests: [],
                  });
                  await User.findByIdAndUpdate(req.user._id, {
                    $set: { organizationId: org._id, organization: org.name },
                  });
                } catch {
                  // ignore
                }
              }
            }

            if (org?._id) {
              const meId2 = String(req.user._id);
              const ownerId2 = String(org.owner);
              const isOwner2 =
                Array.isArray(org.owners) &&
                org.owners.some((c) => String(c) === meId2);
              const isMember2 =
                Array.isArray(org.members) &&
                org.members.some((m) => String(m) === meId2);

              if (ownerId2 === meId2 || isOwner2 || isMember2) {
                await User.findByIdAndUpdate(req.user._id, {
                  $set: { organizationId: org._id, organization: org.name },
                });
              }
            }
          }
        }
      }
    }

    if (!org && orgName) {
      try {
        org = await RequestorOrganization.create({
          name: orgName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          joinRequests: [],
        });
        await User.findByIdAndUpdate(req.user._id, {
          $set: { organizationId: org._id, organization: org.name },
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "내 기공소 생성 중 오류가 발생했습니다.",
          error: error?.message || String(error),
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
        (r) => String(r?.user) === meId && String(r?.status) === "pending"
      )
    ) {
      membership = "pending";
    }

    if (
      req.user.organizationId &&
      membership !== "owner" &&
      membership !== "member"
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: null, organization: "" },
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
        },
      });
    }

    if (
      !req.user.organizationId &&
      (membership === "owner" || membership === "member")
    ) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { organizationId: org._id },
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

    return res.json({
      success: true,
      data: {
        membership,
        organization: safeOrg,
        hasBusinessNumber,
        businessVerified,
        extracted: org?.extracted || {},
        businessLicense: org?.businessLicense || {},
      },
    });
  } catch (error) {
    res.set("x-abuts-handler", "requestorOrganization.getMyOrganization");
    return res.status(500).json({
      success: false,
      message: "내 기공소 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function searchOrganizations(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const orgs = await RequestorOrganization.find({
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
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

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

    const hasOrganization = !!req.user.organizationId;
    let org = null;
    if (hasOrganization) {
      org = await RequestorOrganization.findById(req.user.organizationId);
      const meId = String(req.user._id);
      const canEdit =
        org &&
        (String(org.owner) === meId ||
          (Array.isArray(org.owners) &&
            org.owners.some((c) => String(c) === meId)));
      if (!canEdit) {
        return res.status(403).json({
          success: false,
          message: "대표자 계정만 수정할 수 있습니다.",
        });
      }
    }

    const nextName = String(req.body?.name || "").trim();

    const representativeNameProvided = hasOwn(req.body, "representativeName");
    const businessItemProvided = hasOwn(req.body, "businessItem");
    const phoneNumberProvided = hasOwn(req.body, "phoneNumber");
    const businessNumberProvided = hasOwn(req.body, "businessNumber");
    const businessTypeProvided = hasOwn(req.body, "businessType");
    const emailProvided = hasOwn(req.body, "email");
    const addressProvided = hasOwn(req.body, "address");
    const startDateProvided = hasOwn(req.body, "startDate");

    const representativeName = String(
      req.body?.representativeName || ""
    ).trim();
    const businessItem = String(req.body?.businessItem || "").trim();
    const phoneNumberRaw = String(req.body?.phoneNumber || "").trim();
    const businessNumberRaw = String(req.body?.businessNumber || "").trim();
    const businessType = String(req.body?.businessType || "").trim();
    const email = String(req.body?.email || "").trim();
    const address = String(req.body?.address || "").trim();
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

    const patch = {};
    const unsetPatch = {};
    if (nextName) patch.name = nextName;

    if (
      businessLicense &&
      (businessLicense.s3Key || businessLicense.originalName)
    ) {
      patch.businessLicense = businessLicense;
    }

    const extractedPatch = {};
    if (representativeNameProvided)
      extractedPatch.representativeName = representativeName;
    if (businessItemProvided) extractedPatch.businessItem = businessItem;
    if (phoneNumberProvided) extractedPatch.phoneNumber = phoneNumber;
    if (businessTypeProvided) extractedPatch.businessType = businessType;
    if (emailProvided) extractedPatch.email = email;
    if (addressProvided) extractedPatch.address = address;
    if (startDateProvided) extractedPatch.startDate = startDate;

    if (businessNumberProvided) {
      if (!businessNumber) {
        unsetPatch["extracted.businessNumber"] = 1;
      } else {
        extractedPatch.businessNumber = businessNumber;
      }
    }

    if (businessNumber) {
      const query = { "extracted.businessNumber": businessNumber };
      if (org?._id) {
        query._id = { $ne: org._id };
      }
      const dup = await RequestorOrganization.findOne(query)
        .select({ _id: 1 })
        .lean();
      if (dup) {
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

    if (!hasOrganization) {
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
          message: "기공소 정보를 모두 입력해주세요.",
        });
      }

      try {
        const created = await RequestorOrganization.create({
          name: nextName,
          owner: req.user._id,
          owners: [],
          members: [req.user._id],
          ...(businessLicense &&
          (businessLicense.s3Key || businessLicense.originalName)
            ? { businessLicense }
            : {}),
          extracted: {
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
              organizationId: created._id,
              organization: created.name,
            },
          },
          { new: true }
        );

        const granted = await grantWelcomeBonusIfEligible({
          organizationId: created._id,
          userId: req.user._id,
        });

        return res.json({
          success: true,
          data: {
            created: true,
            organizationId: created._id,
            welcomeBonusGranted: Boolean(granted),
            welcomeBonusAmount: granted || 0,
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
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 기공소에 가입 요청을 진행해주세요.",
          });
        }
        throw e;
      }
    }

    if (Object.keys(extractedPatch).length > 0) {
      patch.extracted = {
        ...(org.extracted ? org.extracted.toObject?.() || org.extracted : {}),
        ...extractedPatch,
      };
    }

    if (verificationResult) {
      patch.verification = {
        verified: !!verificationResult.verified,
        provider: verificationResult.provider || "hometax",
        message: verificationResult.message || "",
        checkedAt: new Date(),
      };
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
      await RequestorOrganization.findByIdAndUpdate(org._id, update);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const msg = String(e?.message || "");
        if (msg.includes("extracted.businessNumber")) {
          return res.status(409).json({
            success: false,
            reason: "duplicate_business_number",
            message:
              "이미 등록된 사업자등록번호입니다. 기존 기공소에 가입 요청을 진행해주세요.",
          });
        }
      }
      throw e;
    }

    if (nextName && String(req.user.organization || "") !== nextName) {
      await User.updateMany(
        { organizationId: org._id },
        { $set: { organization: nextName } }
      );
    }

    return res.json({
      success: true,
      data: {
        updated: true,
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
      message: "기공소 정보 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearMyBusinessLicense(req, res) {
  try {
    if (!req.user || req.user.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    if (!req.user.organizationId) {
      return res.status(200).json({
        success: true,
        data: { cleared: true },
      });
    }

    const org = await RequestorOrganization.findById(req.user.organizationId);
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
      { organizationId: org._id },
      { $set: { organizationId: null, organization: "" } }
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
      error
    );
    return res.status(500).json({
      success: false,
      message: "사업자등록증 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
