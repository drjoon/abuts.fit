#!/usr/bin/env node
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import "../../models/user.model.js";
import "../../models/businessAnchor.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import "../../models/deliveryInfo.model.js";

const ACTIVE_STAGES = ["세척.패킹", "포장.발송"];
const UNKNOWN_ANCHOR_KEY = "__UNKNOWN_BUSINESS_ANCHOR__";

function parseArgs() {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);
  const getValue = (prefix, fallback = "") => {
    const item = args.find((v) => String(v || "").startsWith(prefix));
    if (!item) return fallback;
    return String(item.slice(prefix.length) || "").trim();
  };

  const daysRaw = getValue("--ship-days=", "120");
  const shipDays = Number(daysRaw);

  return {
    apply: has("--apply"),
    shipDays: Number.isFinite(shipDays) && shipDays > 0 ? shipDays : 120,
  };
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value?._id || value?.id || "").trim();
  }
  return String(value || "").trim();
}

function toKstYmd(input) {
  const d = input ? new Date(input) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // sv-SE => YYYY-MM-DD
  return formatter.format(d);
}

function buildAllMailboxAddresses() {
  const shelfNames = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const shelfRows = ["1", "2", "3", "4"];
  const binCols = ["A", "B", "C"];
  const binRows = ["1", "2", "3", "4"];

  const out = [];
  for (const shelf of shelfNames) {
    for (const sRow of shelfRows) {
      for (const bCol of binCols) {
        for (const bRow of binRows) {
          out.push(`${shelf}${sRow}${bCol}${bRow}`);
        }
      }
    }
  }
  return out;
}

function resolveCanonicalAnchorInfo(requestDoc) {
  const requestAnchorId = toIdString(requestDoc?.businessAnchorId);
  const requestorAnchorId = toIdString(requestDoc?.requestor?.businessAnchorId);
  const canonicalAnchorId = requestorAnchorId || requestAnchorId;

  return {
    requestAnchorId,
    requestorAnchorId,
    canonicalAnchorId,
    mismatch:
      Boolean(requestAnchorId) &&
      Boolean(requestorAnchorId) &&
      requestAnchorId !== requestorAnchorId,
  };
}

function pickCanonicalMailbox({
  anchorId,
  requests,
  singleAnchorSetByMailbox,
  usedMailboxSet,
  allMailboxAddresses,
}) {
  const countByMailbox = new Map();
  for (const r of requests) {
    const addr = String(r?.mailboxAddress || "").trim();
    if (!addr) continue;
    countByMailbox.set(addr, Number(countByMailbox.get(addr) || 0) + 1);
  }

  const sortMailboxByCountDescThenAddrAsc = (entries) =>
    entries
      .slice()
      .sort((a, b) => {
        const countDiff = Number(b[1] || 0) - Number(a[1] || 0);
        if (countDiff !== 0) return countDiff;
        return String(a[0]).localeCompare(String(b[0]));
      })
      .map(([address]) => String(address || "").trim())
      .filter(Boolean);

  // 1) 이미 해당 anchor만 점유한 mailbox가 있으면 최우선 재사용
  const exclusiveCandidates = sortMailboxByCountDescThenAddrAsc(
    Array.from(countByMailbox.entries()).filter(([address]) => {
      const singleAnchor = singleAnchorSetByMailbox.get(address) || "";
      return singleAnchor === anchorId;
    }),
  );
  for (const address of exclusiveCandidates) {
    if (!usedMailboxSet.has(address)) return address;
  }

  // 2) 현재 많이 쓰는 mailbox를 유지 시도
  const preferredCandidates = sortMailboxByCountDescThenAddrAsc(
    Array.from(countByMailbox.entries()),
  );
  for (const address of preferredCandidates) {
    if (!usedMailboxSet.has(address)) return address;
  }

  // 3) 완전히 빈 mailbox 할당
  for (const address of allMailboxAddresses) {
    if (!usedMailboxSet.has(address)) return address;
  }

  return "";
}

async function planActiveMailboxNormalization() {
  const activeRequests = await Request.find({
    manufacturerStage: { $in: ACTIVE_STAGES },
    mailboxAddress: { $ne: null },
  })
    .populate("requestor", "business businessAnchorId")
    .select({
      requestId: 1,
      manufacturerStage: 1,
      mailboxAddress: 1,
      businessAnchorId: 1,
      requestor: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean();

  const occupancyByMailbox = new Map();
  const requestsByAnchor = new Map();
  const unknownAnchorRequests = [];
  let anchorMismatchCount = 0;

  for (const row of activeRequests) {
    const mailboxAddress = String(row?.mailboxAddress || "").trim();
    if (!mailboxAddress) continue;

    const anchorInfo = resolveCanonicalAnchorInfo(row);
    if (anchorInfo.mismatch) {
      anchorMismatchCount += 1;
    }

    const anchorKey = anchorInfo.canonicalAnchorId || UNKNOWN_ANCHOR_KEY;
    if (!occupancyByMailbox.has(mailboxAddress)) {
      occupancyByMailbox.set(mailboxAddress, new Set());
    }
    occupancyByMailbox.get(mailboxAddress).add(anchorKey);

    if (!anchorInfo.canonicalAnchorId) {
      unknownAnchorRequests.push({ ...row, anchorInfo });
      continue;
    }

    if (!requestsByAnchor.has(anchorInfo.canonicalAnchorId)) {
      requestsByAnchor.set(anchorInfo.canonicalAnchorId, []);
    }
    requestsByAnchor
      .get(anchorInfo.canonicalAnchorId)
      .push({ ...row, anchorInfo });
  }

  const singleAnchorSetByMailbox = new Map();
  for (const [mailbox, anchorSet] of occupancyByMailbox.entries()) {
    if (anchorSet.size === 1) {
      singleAnchorSetByMailbox.set(mailbox, Array.from(anchorSet)[0]);
    }
  }

  const allMailboxAddresses = buildAllMailboxAddresses();
  const usedMailboxSet = new Set();
  const canonicalMailboxByAnchor = new Map();

  const sortedAnchors = Array.from(requestsByAnchor.entries())
    .map(([anchorId, requests]) => ({ anchorId, requests }))
    .sort((a, b) => {
      const countDiff = b.requests.length - a.requests.length;
      if (countDiff !== 0) return countDiff;
      return String(a.anchorId).localeCompare(String(b.anchorId));
    });

  for (const { anchorId, requests } of sortedAnchors) {
    const mailbox = pickCanonicalMailbox({
      anchorId,
      requests,
      singleAnchorSetByMailbox,
      usedMailboxSet,
      allMailboxAddresses,
    });

    if (!mailbox) {
      throw new Error(
        `할당 가능한 mailbox가 없습니다. anchorId=${anchorId}, requestCount=${requests.length}`,
      );
    }

    canonicalMailboxByAnchor.set(anchorId, mailbox);
    usedMailboxSet.add(mailbox);
  }

  const mailboxFixOps = [];
  const mailboxFixPreview = [];

  for (const { anchorId, requests } of sortedAnchors) {
    const targetMailbox = canonicalMailboxByAnchor.get(anchorId);
    for (const row of requests) {
      const currentMailbox = String(row?.mailboxAddress || "").trim();
      const requestAnchorId = String(
        row?.anchorInfo?.requestAnchorId || "",
      ).trim();
      const needsMailboxMove = currentMailbox !== targetMailbox;
      const needsAnchorBackfill =
        !requestAnchorId || requestAnchorId !== anchorId;

      if (!needsMailboxMove && !needsAnchorBackfill) continue;

      const setPayload = {
        ...(needsMailboxMove ? { mailboxAddress: targetMailbox } : {}),
        ...(needsAnchorBackfill && mongoose.Types.ObjectId.isValid(anchorId)
          ? { businessAnchorId: new mongoose.Types.ObjectId(anchorId) }
          : {}),
      };

      mailboxFixOps.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: setPayload },
        },
      });

      mailboxFixPreview.push({
        requestId: String(row?.requestId || "").trim(),
        fromMailbox: currentMailbox || null,
        toMailbox: targetMailbox || null,
        fromBusinessAnchorId: requestAnchorId || null,
        toBusinessAnchorId: anchorId,
        movedMailbox: needsMailboxMove,
        backfilledBusinessAnchor: needsAnchorBackfill,
      });
    }
  }

  const mixedMailboxPreview = Array.from(occupancyByMailbox.entries())
    .filter(([_, set]) => set.size > 1)
    .map(([mailbox, set]) => ({
      mailbox,
      anchors: Array.from(set),
    }))
    .sort((a, b) => String(a.mailbox).localeCompare(String(b.mailbox)));

  return {
    activeCount: activeRequests.length,
    anchorCount: sortedAnchors.length,
    unknownAnchorCount: unknownAnchorRequests.length,
    anchorMismatchCount,
    mixedMailboxPreview,
    mailboxFixOps,
    mailboxFixPreview,
    canonicalMailboxByAnchor,
    unknownAnchorRequests,
  };
}

async function planShippingPackageMerge({ shipDays }) {
  const allRequests = await Request.find({
    shippingPackageId: { $ne: null },
    deliveryInfoRef: { $ne: null },
    manufacturerStage: { $in: ["포장.발송", "추적관리"] },
  })
    .populate("requestor", "businessAnchorId business")
    .populate(
      "deliveryInfoRef",
      "shippedAt pickedUpAt deliveredAt trackingNumber",
    )
    .select({
      requestId: 1,
      mailboxAddress: 1,
      shippingPackageId: 1,
      businessAnchorId: 1,
      requestor: 1,
      deliveryInfoRef: 1,
      updatedAt: 1,
      createdAt: 1,
    })
    .lean();

  const now = new Date();
  const cutoff = new Date(now.getTime() - shipDays * 24 * 60 * 60 * 1000);

  const targetRequests = allRequests.filter((row) => {
    const di = row?.deliveryInfoRef || {};
    const baseTime =
      di?.shippedAt || di?.pickedUpAt || di?.deliveredAt || row?.updatedAt;
    const dt = baseTime ? new Date(baseTime) : null;
    return dt && !Number.isNaN(dt.getTime()) && dt >= cutoff;
  });

  const grouped = new Map();
  for (const row of targetRequests) {
    const anchorInfo = resolveCanonicalAnchorInfo(row);
    const anchorId = anchorInfo.canonicalAnchorId;
    if (!anchorId) continue;

    const di = row?.deliveryInfoRef || {};
    const shippedBase = di?.shippedAt || di?.pickedUpAt || di?.deliveredAt;
    const shipDateYmd = toKstYmd(shippedBase);
    if (!shipDateYmd) continue;

    const trackingNumber = String(di?.trackingNumber || "").trim();
    const mailboxAddress = String(row?.mailboxAddress || "").trim();
    const packageId = String(row?.shippingPackageId || "").trim();
    if (!packageId) continue;

    // trackingNumber가 있으면 이를 SSOT로 묶고,
    // 없으면 동일 mailbox/day 단위까지만 보수적으로 병합한다.
    const identity = trackingNumber
      ? `tn:${trackingNumber}`
      : mailboxAddress
        ? `mb:${mailboxAddress}`
        : "none";
    if (identity === "none") continue;

    const key = `${anchorId}|${shipDateYmd}|${identity}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ ...row, anchorId, shipDateYmd, trackingNumber });
  }

  const groupsNeedingMerge = Array.from(grouped.entries()).filter(
    ([, rows]) => {
      const pkgSet = new Set(
        rows.map((r) => String(r?.shippingPackageId || "").trim()),
      );
      return pkgSet.size > 1;
    },
  );

  const involvedPackageIds = Array.from(
    new Set(
      groupsNeedingMerge.flatMap(([, rows]) =>
        rows
          .map((r) => String(r?.shippingPackageId || "").trim())
          .filter(Boolean),
      ),
    ),
  ).filter((id) => mongoose.Types.ObjectId.isValid(id));

  const packageDocs = involvedPackageIds.length
    ? await ShippingPackage.find({
        _id: {
          $in: involvedPackageIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      })
        .select({
          _id: 1,
          businessAnchorId: 1,
          shipDateYmd: 1,
          mailboxAddress: 1,
          requestIds: 1,
          createdAt: 1,
        })
        .lean()
    : [];

  const packageById = new Map(
    packageDocs.map((pkg) => [String(pkg?._id || "").trim(), pkg]),
  );

  const requestPkgFixOps = [];
  const packageFixOps = [];
  const packageFixPreview = [];

  for (const [groupKey, rows] of groupsNeedingMerge) {
    const pkgIds = Array.from(
      new Set(
        rows
          .map((r) => String(r?.shippingPackageId || "").trim())
          .filter(Boolean),
      ),
    );

    const candidates = pkgIds
      .map((id) => ({ id, pkg: packageById.get(id) || null }))
      .filter((entry) => entry.pkg);

    if (!candidates.length) {
      packageFixPreview.push({
        groupKey,
        skipped: true,
        reason: "package_not_found",
        requestCount: rows.length,
      });
      continue;
    }

    const requestIdSet = new Set(
      rows.map((r) => String(r?._id || "").trim()).filter(Boolean),
    );

    const canonical = candidates.slice().sort((a, b) => {
      const aHit = (
        Array.isArray(a.pkg?.requestIds) ? a.pkg.requestIds : []
      ).filter((id) => requestIdSet.has(String(id || "").trim())).length;
      const bHit = (
        Array.isArray(b.pkg?.requestIds) ? b.pkg.requestIds : []
      ).filter((id) => requestIdSet.has(String(id || "").trim())).length;
      if (bHit !== aHit) return bHit - aHit;

      const aTime = new Date(a.pkg?.createdAt || 0).getTime();
      const bTime = new Date(b.pkg?.createdAt || 0).getTime();
      return aTime - bTime;
    })[0];

    const canonicalPkgId = String(canonical.id || "").trim();
    const movedRows = rows.filter(
      (row) => String(row?.shippingPackageId || "").trim() !== canonicalPkgId,
    );

    if (!movedRows.length) continue;

    // Request.shippingPackageId 정합성 보정
    for (const row of movedRows) {
      requestPkgFixOps.push({
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              shippingPackageId: new mongoose.Types.ObjectId(canonicalPkgId),
            },
          },
        },
      });
    }

    const allGroupRequestObjectIds = rows
      .map((row) => toIdString(row?._id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    // canonical package에 requestIds 합치기
    packageFixOps.push({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(canonicalPkgId) },
        update: {
          $addToSet: { requestIds: { $each: allGroupRequestObjectIds } },
        },
      },
    });

    // 나머지 package에서 requestIds 제거
    const nonCanonicalPkgIds = pkgIds.filter((id) => id !== canonicalPkgId);
    for (const pkgId of nonCanonicalPkgIds) {
      if (!mongoose.Types.ObjectId.isValid(pkgId)) continue;
      packageFixOps.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(pkgId) },
          update: { $pull: { requestIds: { $in: allGroupRequestObjectIds } } },
        },
      });
    }

    packageFixPreview.push({
      groupKey,
      canonicalPkgId,
      mergedPkgIds: nonCanonicalPkgIds,
      requestCount: rows.length,
      movedRequestIds: movedRows.map((r) => String(r?.requestId || "").trim()),
    });
  }

  return {
    targetRequestCount: targetRequests.length,
    groupsNeedingMergeCount: groupsNeedingMerge.length,
    requestPkgFixOps,
    packageFixOps,
    packageFixPreview,
  };
}

async function cleanupEmptyPackagesAfterMerge() {
  const emptyPackages = await ShippingPackage.find({
    $or: [{ requestIds: { $exists: false } }, { requestIds: { $size: 0 } }],
  })
    .select({ _id: 1 })
    .lean();

  if (!emptyPackages.length) {
    return { deletedCount: 0 };
  }

  const ids = emptyPackages.map((row) => row._id);
  const out = await ShippingPackage.deleteMany({ _id: { $in: ids } });
  return { deletedCount: Number(out?.deletedCount || 0) };
}

async function run() {
  const { apply, shipDays } = parseArgs();

  await connectDb();
  console.log("[fix-mailbox-shipping-integrity] connected", {
    mode: apply ? "apply" : "dry-run",
    shipDays,
  });

  try {
    const mailboxPlan = await planActiveMailboxNormalization();
    const packagePlan = await planShippingPackageMerge({ shipDays });

    console.log("\n=== mailbox normalization preview ===");
    console.log({
      activeCount: mailboxPlan.activeCount,
      anchorCount: mailboxPlan.anchorCount,
      unknownAnchorCount: mailboxPlan.unknownAnchorCount,
      anchorMismatchCount: mailboxPlan.anchorMismatchCount,
      mixedMailboxCount: mailboxPlan.mixedMailboxPreview.length,
      mailboxFixCount: mailboxPlan.mailboxFixOps.length,
    });

    if (mailboxPlan.mixedMailboxPreview.length > 0) {
      console.log("mixed mailboxes:");
      mailboxPlan.mixedMailboxPreview.slice(0, 50).forEach((row) => {
        console.log(`- ${row.mailbox}: ${row.anchors.join(", ")}`);
      });
    }

    if (mailboxPlan.unknownAnchorRequests.length > 0) {
      console.log("unknown anchor active requests (first 30):");
      mailboxPlan.unknownAnchorRequests.slice(0, 30).forEach((row) => {
        console.log(`- ${row.requestId} mailbox=${row.mailboxAddress || "-"}`);
      });
    }

    console.log("\n=== shippingPackage merge preview ===");
    console.log({
      targetRequestCount: packagePlan.targetRequestCount,
      groupsNeedingMergeCount: packagePlan.groupsNeedingMergeCount,
      requestPkgFixCount: packagePlan.requestPkgFixOps.length,
      packageFixCount: packagePlan.packageFixOps.length,
    });

    packagePlan.packageFixPreview.slice(0, 50).forEach((row) => {
      console.log("-", row);
    });

    if (!apply) {
      console.log(
        "\n[DRY RUN] 실제 반영하지 않았습니다. --apply 옵션으로 반영하세요.",
      );
      return;
    }

    if (mailboxPlan.mailboxFixOps.length > 0) {
      const out = await Request.bulkWrite(mailboxPlan.mailboxFixOps, {
        ordered: false,
      });
      console.log("[apply] mailbox fix", {
        matched: out?.matchedCount || 0,
        modified: out?.modifiedCount || 0,
      });
    }

    if (packagePlan.requestPkgFixOps.length > 0) {
      const out = await Request.bulkWrite(packagePlan.requestPkgFixOps, {
        ordered: false,
      });
      console.log("[apply] request shippingPackageId fix", {
        matched: out?.matchedCount || 0,
        modified: out?.modifiedCount || 0,
      });
    }

    if (packagePlan.packageFixOps.length > 0) {
      const out = await ShippingPackage.bulkWrite(packagePlan.packageFixOps, {
        ordered: false,
      });
      console.log("[apply] shippingPackage requestIds fix", {
        matched: out?.matchedCount || 0,
        modified: out?.modifiedCount || 0,
      });
    }

    const cleanup = await cleanupEmptyPackagesAfterMerge();
    console.log("[apply] empty shippingPackage cleanup", cleanup);

    console.log("\n[fix-mailbox-shipping-integrity] done");
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[fix-mailbox-shipping-integrity] failed", error);
  process.exitCode = 1;
});
