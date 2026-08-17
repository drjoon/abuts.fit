// related files:
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// change-log:
// - 2026-08-17: 제조사 장부 표시 — 의뢰 1건=어벗 1개라 기공의뢰처럼 못 묶고, KST 하루+우편함(수취자)으로 묶음.
import {
  MANUFACTURER_PRODUCTION_LEDGER_LABEL,
  MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
  MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
} from "../services/creditRevenuePolicy.service.js";
import { SHIPPING_LEDGER_LABELS } from "./shippingLedgerLabels.js";

const REQUEST_EARN = new Set(MANUFACTURER_REQUEST_EARN_EVENT_TYPES);
const SHIPPING_EARN = new Set(MANUFACTURER_SHIPPING_EARN_EVENT_TYPES);
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export function manufacturerLedgerKstYmd(input) {
  if (input == null) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isManufacturerDailyEarnRow(row) {
  if (String(row?.type || "").toUpperCase() !== "EARN") return false;
  const event = String(row?.eventType || "");
  if (REQUEST_EARN.has(event) || SHIPPING_EARN.has(event)) return true;
  const refType = String(row?.refType || "").toUpperCase();
  return (
    refType === "REQUEST" ||
    refType === "SHIPPING_PACKAGE" ||
    refType === "PRACTICE_TRANSFER"
  );
}

export function isManufacturerShippingEarnRow(row) {
  const event = String(row?.eventType || "");
  if (SHIPPING_EARN.has(event)) return true;
  if (String(row?.refType || "").toUpperCase() === "SHIPPING_PACKAGE") {
    return true;
  }
  const usage = String(row?.usageKind || "");
  return usage.includes("shipping");
}

function stripGlPrefix(uniqueKey) {
  return String(uniqueKey || "")
    .trim()
    .replace(/^(gl:)+/i, "");
}

function pushObjectId(set, raw) {
  const id = String(raw || "").trim();
  if (OBJECT_ID_RE.test(id)) set.add(id);
}

export function collectManufacturerLedgerLookupIds(rows) {
  const requestIds = new Set();
  const packageIds = new Set();
  const ptxIds = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const refType = String(row?.refType || "").toUpperCase();
    const refId = String(row?.refId || "").trim();
    if (refType === "REQUEST") pushObjectId(requestIds, refId);
    if (refType === "SHIPPING_PACKAGE") pushObjectId(packageIds, refId);
    if (refType === "PRACTICE_TRANSFER") pushObjectId(ptxIds, refId);

    const key = stripGlPrefix(row?.uniqueKey);
    const requestMatch = key.match(/^request:([a-f0-9]{24}):/i);
    if (requestMatch) pushObjectId(requestIds, requestMatch[1]);
    const pkgMatch = key.match(/^shippingPackage:([a-f0-9]{24}):/i);
    if (pkgMatch) pushObjectId(packageIds, pkgMatch[1]);
    const ptxMatch = key.match(/^practice_transfer:([a-f0-9]{24}):/i);
    if (ptxMatch) pushObjectId(ptxIds, ptxMatch[1]);
  }

  return {
    requestIds: [...requestIds],
    packageIds: [...packageIds],
    ptxIds: [...ptxIds],
  };
}

export function summarizeManufacturerLedgerRequest(doc = {}) {
  const caseInfos =
    doc?.caseInfos && typeof doc.caseInfos === "object" ? doc.caseInfos : {};
  const receiver =
    doc?.shippingReceiver && typeof doc.shippingReceiver === "object"
      ? doc.shippingReceiver
      : {};
  const partner =
    doc?.partnerBilling && typeof doc.partnerBilling === "object"
      ? doc.partnerBilling
      : {};
  const recipientName =
    String(receiver.name || "").trim() ||
    String(caseInfos.clinicName || "").trim() ||
    String(doc.anchorName || "").trim();

  return {
    id: String(doc?._id || "").trim(),
    requestId: String(doc?.requestId || "").trim(),
    mailboxAddress: String(doc?.mailboxAddress || "")
      .trim()
      .toUpperCase(),
    recipientName,
    patientName: String(caseInfos.patientName || "").trim(),
    tooth: String(caseInfos.tooth || "").trim(),
    clinicName: String(caseInfos.clinicName || "").trim(),
    relatedPracticeTransferId: String(
      partner.relatedPracticeTransferId || "",
    ).trim(),
  };
}

export function summarizeManufacturerLedgerPackage(doc = {}, requestsById) {
  const requestIds = Array.isArray(doc?.requestIds)
    ? doc.requestIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const first = requestIds
    .map((id) => requestsById?.get?.(id) || null)
    .find(Boolean);
  return {
    id: String(doc?._id || "").trim(),
    mailboxAddress: String(doc?.mailboxAddress || "")
      .trim()
      .toUpperCase(),
    requestIds,
    recipientName: String(first?.recipientName || "").trim(),
  };
}

function mailboxGroupKey(mailboxAddress, recipientName) {
  const mailbox = String(mailboxAddress || "")
    .trim()
    .toUpperCase();
  if (mailbox) return `mb:${mailbox}`;
  const recipient = String(recipientName || "").trim();
  if (recipient) return `rec:${recipient}`;
  return "unassigned";
}

function resolveRowRequest(row, ctx) {
  const refType = String(row?.refType || "").toUpperCase();
  const refId = String(row?.refId || "").trim();
  if (refType === "REQUEST" && ctx.requestsById.has(refId)) {
    return ctx.requestsById.get(refId);
  }
  const key = stripGlPrefix(row?.uniqueKey);
  const match = key.match(/^request:([a-f0-9]{24}):/i);
  if (match && ctx.requestsById.has(match[1])) {
    return ctx.requestsById.get(match[1]);
  }
  return null;
}

function resolveRowPackage(row, ctx) {
  const refType = String(row?.refType || "").toUpperCase();
  const refId = String(row?.refId || "").trim();
  if (refType === "SHIPPING_PACKAGE" && ctx.packagesById.has(refId)) {
    return ctx.packagesById.get(refId);
  }
  const key = stripGlPrefix(row?.uniqueKey);
  const match = key.match(/^shippingPackage:([a-f0-9]{24}):/i);
  if (match && ctx.packagesById.has(match[1])) {
    return ctx.packagesById.get(match[1]);
  }
  return null;
}

function resolvePtxRequests(row, ctx) {
  const refId = String(row?.refId || "").trim();
  if (refId && ctx.requestsByPtxId.has(refId)) {
    return ctx.requestsByPtxId.get(refId);
  }
  const key = stripGlPrefix(row?.uniqueKey);
  const match = key.match(/^practice_transfer:([a-f0-9]{24}):/i);
  if (match && ctx.requestsByPtxId.has(match[1])) {
    return ctx.requestsByPtxId.get(match[1]);
  }
  return [];
}

function collapseEarnMembers(members) {
  const byKey = new Map();
  for (const row of members) {
    const shipping = isManufacturerShippingEarnRow(row);
    const refId = String(row?.refId || "").trim();
    const uniqueKey = stripGlPrefix(row?.uniqueKey);
    const collapseKey = `${shipping ? "ship" : "prod"}:${refId || uniqueKey || row?._id}`;
    const prev = byKey.get(collapseKey);
    if (!prev) {
      byKey.set(collapseKey, {
        ...row,
        amount: Number(row?.amount || 0),
        _shipping: shipping,
      });
      continue;
    }
    prev.amount += Number(row?.amount || 0);
    if (String(row?.creditKind || "") === "PAID") prev.creditKind = "PAID";
    const prevTime = new Date(prev.occurredAt || 0).getTime();
    const nextTime = new Date(row?.occurredAt || 0).getTime();
    if (nextTime > prevTime) prev.occurredAt = row.occurredAt;
  }
  return [...byKey.values()];
}

function ensureMailboxGroup(groups, { mailboxAddress, recipientName }) {
  const key = mailboxGroupKey(mailboxAddress, recipientName);
  const existing = groups.get(key);
  if (existing) {
    if (!existing.recipientName && recipientName) {
      existing.recipientName = recipientName;
    }
    return existing;
  }
  const mailbox = String(mailboxAddress || "")
    .trim()
    .toUpperCase();
  const group = {
    key,
    mailboxAddress: mailbox,
    recipientName:
      recipientName || (mailbox ? `우편함 ${mailbox}` : "우편함 미배정"),
    productionAmount: 0,
    productionCount: 0,
    shippingAmount: 0,
    shippingCount: 0,
    items: [],
  };
  groups.set(key, group);
  return group;
}

function requestItemFields(summary) {
  if (!summary) {
    return {
      requestMongoId: "",
      requestId: "",
      patientName: "",
      tooth: "",
      clinicName: "",
    };
  }
  return {
    requestMongoId: String(summary.id || ""),
    requestId: String(summary.requestId || ""),
    patientName: String(summary.patientName || ""),
    tooth: String(summary.tooth || ""),
    clinicName: String(summary.clinicName || summary.recipientName || ""),
  };
}

export function buildManufacturerMailboxGroups(members, ctx) {
  const groups = new Map();
  const collapsed = collapseEarnMembers(members);

  for (const row of collapsed) {
    const amount = Number(row.amount || 0);
    const shipping = Boolean(row._shipping);
    const pkg = shipping ? resolveRowPackage(row, ctx) : null;
    const req = resolveRowRequest(row, ctx);
    const ptxReqs = !req && !pkg ? resolvePtxRequests(row, ctx) : [];

    let mailboxAddress = "";
    let recipientName = "";
    let relatedRequests = [];

    if (pkg) {
      mailboxAddress = pkg.mailboxAddress;
      relatedRequests = (pkg.requestIds || [])
        .map((id) => ctx.requestsById.get(id))
        .filter(Boolean);
      recipientName =
        pkg.recipientName ||
        String(relatedRequests[0]?.recipientName || "").trim();
    } else if (req) {
      mailboxAddress = req.mailboxAddress;
      recipientName = req.recipientName;
      relatedRequests = [req];
    } else if (ptxReqs.length) {
      const mailboxes = [
        ...new Set(ptxReqs.map((r) => r.mailboxAddress).filter(Boolean)),
      ];
      mailboxAddress = mailboxes.length === 1 ? mailboxes[0] : "";
      recipientName = String(ptxReqs[0]?.recipientName || "").trim();
      relatedRequests = ptxReqs;
    }

    const group = ensureMailboxGroup(groups, {
      mailboxAddress,
      recipientName,
    });
    const creditKind = String(row.creditKind || "") || null;

    if (shipping) {
      group.shippingAmount += amount;
      group.shippingCount += 1;
      group.items.push({
        kind: "shipping",
        amount,
        creditKind,
        ...requestItemFields(null),
      });
      const listed = new Set(
        group.items
          .filter((item) => item.kind === "production" && item.requestMongoId)
          .map((item) => item.requestMongoId),
      );
      for (const summary of relatedRequests) {
        if (listed.has(summary.id)) continue;
        group.items.push({
          kind: "shipment_item",
          amount: 0,
          creditKind: null,
          ...requestItemFields(summary),
        });
      }
      continue;
    }

    group.productionAmount += amount;
    if (relatedRequests.length <= 1) {
      group.productionCount += 1;
      group.items.push({
        kind: "production",
        amount,
        creditKind,
        ...requestItemFields(relatedRequests[0] || null),
      });
      continue;
    }

    group.productionCount += relatedRequests.length;
    relatedRequests.forEach((summary, index) => {
      group.items.push({
        kind: "production",
        amount: index === 0 ? amount : 0,
        creditKind: index === 0 ? creditKind : null,
        ...requestItemFields(summary),
      });
    });
  }

  return [...groups.values()].sort((a, b) => {
    const mb = String(a.mailboxAddress).localeCompare(String(b.mailboxAddress));
    if (mb !== 0) return mb;
    return String(a.recipientName).localeCompare(String(b.recipientName));
  });
}

function filterOverlappingPtxProduction(members, ctx) {
  return members.filter((row) => {
    if (isManufacturerShippingEarnRow(row)) return true;
    if (String(row?.refType || "").toUpperCase() !== "PRACTICE_TRANSFER") {
      return true;
    }
    const ptxReqs = resolvePtxRequests(row, ctx);
    if (!ptxReqs.length) return true;
    const requestIds = new Set(ptxReqs.map((summary) => summary.id));
    const hasRequestEarn = members.some((other) => {
      if (other === row) return false;
      if (isManufacturerShippingEarnRow(other)) return false;
      const req = resolveRowRequest(other, ctx);
      return Boolean(req && requestIds.has(req.id));
    });
    return !hasRequestEarn;
  });
}

function latestOccurredAt(members) {
  let latest = null;
  let latestMs = -Infinity;
  for (const row of members) {
    const raw = row?.occurredAt || row?.createdAt;
    const ms = new Date(raw || 0).getTime();
    if (Number.isFinite(ms) && ms >= latestMs) {
      latestMs = ms;
      latest = raw;
    }
  }
  return latest;
}

function buildDailyEarnRow(ymd, members, ctx) {
  const earnMembers = filterOverlappingPtxProduction(members, ctx);
  const mailboxGroups = buildManufacturerMailboxGroups(earnMembers, ctx);
  const requestAmount = mailboxGroups.reduce(
    (sum, g) => sum + Number(g.productionAmount || 0),
    0,
  );
  const shippingAmount = mailboxGroups.reduce(
    (sum, g) => sum + Number(g.shippingAmount || 0),
    0,
  );
  const requestCount = mailboxGroups.reduce(
    (sum, g) => sum + Number(g.productionCount || 0),
    0,
  );
  const shippingCount = mailboxGroups.reduce(
    (sum, g) => sum + Number(g.shippingCount || 0),
    0,
  );
  const paidAmount = earnMembers
    .filter((row) => String(row.creditKind || "") === "PAID")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const freeAmount = earnMembers
    .filter((row) => String(row.creditKind || "").startsWith("FREE"))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const occurredAt = latestOccurredAt(earnMembers);
  const displayLabel =
    requestCount > 0
      ? MANUFACTURER_PRODUCTION_LEDGER_LABEL
      : SHIPPING_LEDGER_LABELS.abutsToManufacturer;

  return {
    _id: `day:${ymd}`,
    type: "EARN",
    groupKind: "daily",
    ymd,
    amount: requestAmount + shippingAmount,
    requestAmount,
    requestCount,
    shippingAmount,
    shippingCount,
    paidAmount,
    freeAmount,
    creditKind:
      paidAmount > 0 && freeAmount > 0
        ? "MIXED"
        : paidAmount > 0
          ? "PAID"
          : freeAmount > 0
            ? "FREE_REQUEST"
            : earnMembers[0]?.creditKind || null,
    displayLabel,
    eventType:
      requestCount > 0 ? "REQUEST_SPEND_COMMIT" : "SHIPPING_SPEND_COMMIT",
    uniqueKey: `day:${ymd}`,
    occurredAt,
    createdAt: occurredAt,
    mailboxGroups,
  };
}

export function groupManufacturerLedgerForDisplay(
  rows,
  { requestsById = new Map(), packagesById = new Map(), requestsByPtxId = new Map() } = {},
) {
  const list = Array.isArray(rows) ? rows : [];
  const ctx = { requestsById, packagesById, requestsByPtxId };
  const earnByYmd = new Map();
  const singles = [];

  for (const row of list) {
    if (!isManufacturerDailyEarnRow(row)) {
      singles.push({ ...row, groupKind: "single", mailboxGroups: null });
      continue;
    }
    const ymd =
      manufacturerLedgerKstYmd(row?.occurredAt || row?.createdAt) || "unknown";
    const bucket = earnByYmd.get(ymd);
    if (bucket) bucket.push(row);
    else earnByYmd.set(ymd, [row]);
  }

  const grouped = [
    ...[...earnByYmd.entries()].map(([ymd, members]) =>
      buildDailyEarnRow(ymd, members, ctx),
    ),
    ...singles,
  ];

  grouped.sort((a, b) => {
    const aMs = new Date(a.occurredAt || a.createdAt || 0).getTime();
    const bMs = new Date(b.occurredAt || b.createdAt || 0).getTime();
    if (bMs !== aMs) return bMs - aMs;
    return String(b._id || "").localeCompare(String(a._id || ""));
  });

  return grouped;
}
