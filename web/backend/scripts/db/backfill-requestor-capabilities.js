// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/utils/requestorCapabilities.js
// - rules.md
/**
 * 레거시 practice role / clinic 키 / requestorCapabilities
 * → requestorKind + requestorServices 백필.
 *
 * Usage:
 *   node scripts/db/backfill-requestor-capabilities.js
 *   ABUTS_DB_FORCE=true node scripts/db/backfill-requestor-capabilities.js  # remote
 *
 * Dry-run (default): prints counts. Pass --apply to mutate.
 */
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import {
  hasRequestorProfile,
  normalizeRequestorCapabilities,
  normalizeRequestorKind,
  hasAnyRequestorService,
  profileFromLegacyCapabilities,
  requestorProfilePersistFields,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";

const APPLY = process.argv.includes("--apply");

const resolvePersistFromDoc = (doc) => {
  const verified = doc?.status === "verified";
  const profile = resolveRequestorProfile({
    anchorKind: doc.requestorKind,
    anchorServices: doc.requestorServices,
    anchorCaps: doc.requestorCapabilities,
    userKind: doc.requestorKind,
    userServices: doc.requestorServices,
    userCaps: doc.requestorCapabilities,
    userRole: doc.role,
    businessVerified: verified,
  });
  if (hasRequestorProfile(profile)) {
    return requestorProfilePersistFields(profile);
  }
  return requestorProfilePersistFields({
    kind: "practice",
    services: { free: true, paid: false },
  });
};

const needsKindServicesBackfill = (doc) => {
  const kind = normalizeRequestorKind(doc?.requestorKind);
  const hasServices = hasAnyRequestorService(doc?.requestorServices);
  return !(kind && hasServices);
};

async function main() {
  await connectDb();
  try {
    const practiceAnchors = await BusinessAnchor.find({
      businessType: "practice",
    })
      .select({
        _id: 1,
        name: 1,
        status: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();

    const anchorsMissingProfile = await BusinessAnchor.find({
      businessType: { $in: ["requestor", "practice"] },
      $or: [
        { requestorKind: { $exists: false } },
        { requestorKind: null },
        { requestorKind: "" },
        { requestorServices: { $exists: false } },
        {
          "requestorServices.free": { $ne: true },
          "requestorServices.paid": { $ne: true },
        },
      ],
    })
      .select({
        _id: 1,
        name: 1,
        status: 1,
        businessType: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();

    const legacyClinicKeyAnchors = await BusinessAnchor.find({
      "requestorCapabilities.clinic": { $exists: true },
    })
      .select({
        _id: 1,
        status: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();

    const practiceUsers = await User.find({ role: "practice" })
      .select({
        _id: 1,
        email: 1,
        businessAnchorId: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();

    const usersMissingProfile = await User.find({
      role: { $in: ["requestor", "practice"] },
      $or: [
        { requestorKind: { $exists: false } },
        { requestorKind: null },
        { requestorKind: "" },
        { requestorServices: { $exists: false } },
        {
          "requestorServices.free": { $ne: true },
          "requestorServices.paid": { $ne: true },
        },
      ],
    })
      .select({
        _id: 1,
        role: 1,
        businessAnchorId: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();

    const legacyClinicKeyUsers = await User.find({
      "requestorCapabilities.clinic": { $exists: true },
    })
      .select({
        _id: 1,
        role: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();

    console.log("[backfill-requestor-capabilities] plan", {
      apply: APPLY,
      practiceAnchors: practiceAnchors.length,
      anchorsMissingProfile: anchorsMissingProfile.length,
      legacyClinicKeyAnchors: legacyClinicKeyAnchors.length,
      practiceUsers: practiceUsers.length,
      usersMissingProfile: usersMissingProfile.length,
      legacyClinicKeyUsers: legacyClinicKeyUsers.length,
    });

    if (!APPLY) {
      console.log(
        "[backfill-requestor-capabilities] dry-run only. Re-run with --apply to mutate.",
      );
      return;
    }

    let practiceAnchorUpdated = 0;
    for (const a of practiceAnchors) {
      const persist = resolvePersistFromDoc({
        ...a,
        role: "requestor",
      });
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: {
            businessType: "requestor",
            ...persist,
          },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) practiceAnchorUpdated += 1;
    }

    let anchorProfileUpdated = 0;
    for (const a of anchorsMissingProfile) {
      if (!needsKindServicesBackfill(a) && a.businessType === "requestor") {
        continue;
      }
      const persist = resolvePersistFromDoc(a);
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: {
            businessType: "requestor",
            ...persist,
          },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) anchorProfileUpdated += 1;
    }

    let clinicKeyAnchorMigrated = 0;
    for (const a of legacyClinicKeyAnchors) {
      const persist = resolvePersistFromDoc(a);
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: persist,
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) clinicKeyAnchorMigrated += 1;
    }

    let practiceUserUpdated = 0;
    for (const u of practiceUsers) {
      const persist = requestorProfilePersistFields({
        kind: "practice",
        services: { free: true, paid: false },
      });
      const res = await User.updateOne(
        { _id: u._id },
        {
          $set: {
            role: "requestor",
            ...persist,
          },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) practiceUserUpdated += 1;
    }

    let userProfileSynced = 0;
    for (const u of usersMissingProfile) {
      if (!needsKindServicesBackfill(u) && u.role === "requestor") continue;

      let persist = requestorProfilePersistFields({
        kind: "practice",
        services: { free: true, paid: false },
      });

      if (u.businessAnchorId) {
        const anchor = await BusinessAnchor.findById(u.businessAnchorId)
          .select({
            status: 1,
            requestorKind: 1,
            requestorServices: 1,
            requestorCapabilities: 1,
          })
          .lean();
        if (anchor) {
          persist = resolvePersistFromDoc({
            ...anchor,
            role: u.role,
          });
        }
      } else {
        const fromLegacy = profileFromLegacyCapabilities(
          u.requestorCapabilities,
          { businessVerified: false },
        );
        if (hasRequestorProfile(fromLegacy)) {
          persist = requestorProfilePersistFields(fromLegacy);
        } else if (u.role === "practice") {
          persist = requestorProfilePersistFields({
            kind: "practice",
            services: { free: true, paid: false },
          });
        }
      }

      const res = await User.updateOne(
        { _id: u._id },
        {
          $set: {
            ...(u.role === "practice" ? { role: "requestor" } : {}),
            ...persist,
          },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) userProfileSynced += 1;
    }

    let clinicKeyUserMigrated = 0;
    for (const u of legacyClinicKeyUsers) {
      const fromLegacy = profileFromLegacyCapabilities(u.requestorCapabilities, {
        businessVerified: false,
      });
      const persist = hasRequestorProfile(fromLegacy)
        ? requestorProfilePersistFields(fromLegacy)
        : requestorProfilePersistFields({
            kind: "practice",
            services: { free: true, paid: false },
          });
      // clinic 키만 정리; 이미 kind가 있으면 유지
      const set = needsKindServicesBackfill(u) ? persist : {};
      const n = normalizeRequestorCapabilities(u.requestorCapabilities);
      if (!needsKindServicesBackfill(u) && (n.practice || n.lab)) {
        // kind 있으면 clinic unset만
      }
      const res = await User.updateOne(
        { _id: u._id },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) clinicKeyUserMigrated += 1;
    }

    console.log("[backfill-requestor-capabilities] done", {
      practiceAnchorUpdated,
      anchorProfileUpdated,
      clinicKeyAnchorMigrated,
      practiceUserUpdated,
      userProfileSynced,
      clinicKeyUserMigrated,
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[backfill-requestor-capabilities] failed", err);
  process.exitCode = 1;
});
