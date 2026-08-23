// related files:
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// change-log:
// - 2026-08-23: 우편함 그룹 키에 BA 포함 — 같은 칸을 하루에 두 BA가 쓰면 제목이 덮이지 않음.
// - 2026-08-23: 의뢰/배송 그룹 표기는 배송자 BA(requestor businessAnchor). clinicName은 건별 메타만.
// - 2026-08-20: ADJUST는 KST 하루 1행으로 묶고, 클릭 상세는 의뢰별(중복 환불은 의뢰 합산).
// - 2026-08-17: 기공소→치과 배송(practice_transfer_lab_shipping)은 제조사 원장에서 제외.
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

function stripGlPrefix(uniqueKey) {
  return String(uniqueKey || "")
    .trim()
    .replace(/^(gl:)+/i, "");
}

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

function usageKindOf(row) {
  return String(
    row?.usageKind || row?.meta?.usageKind || "",
  ).trim();
}

export function isManufacturerLabOriginShippingRow(row) {
  if (usageKindOf(row) === "practice_transfer_lab_shipping") return true;
  const key = stripGlPrefix(row?.uniqueKey);
  return /:lab_shipping$/i.test(key);
}

export function isManufacturerAdjustRow(row) {
  return String(row?.type || "").toUpperCase() === "ADJUST";
}

export function manufacturerAdjustReason(row) {
  const key = stripGlPrefix(row?.uniqueKey);
  if (/duplicate_refund/i.test(key)) return "중복 적립 정정";
  if (/cancel_refund/i.test(key)) return "의뢰 취소";
  if (/overcharge/i.test(key)) return "과금 정정";
  const label = String(row?.displayLabel || "").trim();
  if (label && label !== "커스텀어벗 생산") return label;
  return "조정";
}

export function isManufacturerDailyEarnRow(row) {
  if (isManufacturerLabOriginShippingRow(row)) return false;
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
  if (isManufacturerLabOriginShippingRow(row)) return false;
  const event = String(row?.eventType || "");
  if (SHIPPING_EARN.has(event)) return true;
  if (String(row?.refType || "").toUpperCase() === "SHIPPING_PACKAGE") {
    return true;
  }
  const usage = usageKindOf(row);
  return usage.includes("shipping");
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
  // PTX CA는 기공소(의뢰 BA) 수취 — 레거시 치과 shippingReceiver·clinicName으로 그룹 표기하지 않음.
  const isPtx = Boolean(
    partner.relatedPracticeTransferId || partner.practiceBusinessAnchorId,
  );
  const requestorBaId = String(
    doc?.businessAnchorId?._id || doc?.businessAnchorId || "",
  ).trim();
  const requestorBaName = String(doc.anchorName || "").trim();
  const receiverName = isPtx ? "" : String(receiver.name || "").trim();
  // 그룹 제목 = 배송자 BA (우편함 점유 org와 동일: requestor businessAnchor).
  const recipientName =
    requestorBaName ||
    receiverName ||
    String(caseInfos.clinicName || "").trim();

  return {
    id: String(doc?._id || "").trim(),
    requestId: String(doc?.requestId || "").trim(),
    mailboxAddress: String(doc?.mailboxAddress || "")
      .trim()
      .toUpperCase(),
    recipientBusinessAnchorId: requestorBaId,
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
  // 패키지 BA가 SSOT — 같은 칸을 다른 BA가 이어 써도 집하 시점 배송자와 맞춰 둔다.
  const packageBaId = String(
    doc?.businessAnchorId?._id || doc?.businessAnchorId || "",
  ).trim();
  const packageBaName = String(doc?.anchorName || "").trim();
  return {
    id: String(doc?._id || "").trim(),
    mailboxAddress: String(doc?.mailboxAddress || "")
      .trim()
      .toUpperCase(),
    requestIds,
    recipientBusinessAnchorId:
      packageBaId || String(first?.recipientBusinessAnchorId || "").trim(),
    recipientName:
      packageBaName || String(first?.recipientName || "").trim(),
  };
}

function mailboxGroupKey(
  mailboxAddress,
  recipientName,
  recipientBusinessAnchorId = "",
) {
  const mailbox = String(mailboxAddress || "")
    .trim()
    .toUpperCase();
  const ba = String(recipientBusinessAnchorId || "").trim();
  // 우편함은 집하 후 재사용된다. 같은 날·같은 칸·다른 BA가 섞이면 제목이 덮인다.
  if (mailbox && ba) return `mb:${mailbox}:ba:${ba}`;
  if (mailbox) return `mb:${mailbox}`;
  if (ba) return `ba:${ba}`;
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

function ensureMailboxGroup(
  groups,
  { mailboxAddress, recipientName, recipientBusinessAnchorId },
) {
  const key = mailboxGroupKey(
    mailboxAddress,
    recipientName,
    recipientBusinessAnchorId,
  );
  const existing = groups.get(key);
  if (existing) {
    if (!existing.recipientName && recipientName) {
      existing.recipientName = recipientName;
    }
    if (!existing.recipientBusinessAnchorId && recipientBusinessAnchorId) {
      existing.recipientBusinessAnchorId = recipientBusinessAnchorId;
    }
    return existing;
  }
  const mailbox = String(mailboxAddress || "")
    .trim()
    .toUpperCase();
  const group = {
    key,
    mailboxAddress: mailbox,
    recipientBusinessAnchorId: String(recipientBusinessAnchorId || "").trim(),
    recipientName:
      recipientName || (mailbox ? `우편함 ${mailbox}` : "배송자 미확인"),
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

function collapseAdjustMembers(members, ctx) {
  const byKey = new Map();
  for (const row of members) {
    const req = resolveRowRequest(row, ctx);
    const requestMongoId =
      String(req?.id || "").trim() || String(row?.refId || "").trim();
    const uniqueKey = stripGlPrefix(row?.uniqueKey);
    const collapseKey =
      requestMongoId || uniqueKey.replace(/:duplicate_refund$/i, "") || String(row?._id);
    const prev = byKey.get(collapseKey);
    const amount = Number(row?.amount || 0);
    if (!prev) {
      byKey.set(collapseKey, {
        amount,
        creditKind: row?.creditKind || null,
        reason: manufacturerAdjustReason(row),
        mailboxAddress: String(req?.mailboxAddress || "").trim(),
        recipientName: String(req?.recipientName || "").trim(),
        recipientBusinessAnchorId: String(
          req?.recipientBusinessAnchorId || "",
        ).trim(),
        ...requestItemFields(req),
        requestMongoId: requestMongoId || String(req?.id || ""),
      });
      continue;
    }
    prev.amount += amount;
    if (String(row?.creditKind || "") === "PAID") prev.creditKind = "PAID";
  }
  return [...byKey.values()];
}

export function buildManufacturerAdjustGroups(members, ctx) {
  const groups = new Map();
  const collapsed = collapseAdjustMembers(members, ctx);

  for (const item of collapsed) {
    const group = ensureMailboxGroup(groups, {
      mailboxAddress: item.mailboxAddress,
      recipientName: item.recipientName,
      recipientBusinessAnchorId: item.recipientBusinessAnchorId,
    });
    group.productionAmount += Number(item.amount || 0);
    group.productionCount += 1;
    group.items.push({
      kind: "adjust",
      amount: Number(item.amount || 0),
      creditKind: item.creditKind,
      reason: item.reason,
      ...requestItemFields({
        id: item.requestMongoId,
        requestId: item.requestId,
        patientName: item.patientName,
        tooth: item.tooth,
        clinicName: item.clinicName,
        recipientName: item.recipientName,
      }),
    });
  }

  return [...groups.values()].sort((a, b) => {
    const mb = String(a.mailboxAddress).localeCompare(String(b.mailboxAddress));
    if (mb !== 0) return mb;
    return String(a.recipientName).localeCompare(String(b.recipientName));
  });
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
    let recipientBusinessAnchorId = "";
    let relatedRequests = [];

    if (pkg) {
      mailboxAddress = pkg.mailboxAddress;
      relatedRequests = (pkg.requestIds || [])
        .map((id) => ctx.requestsById.get(id))
        .filter(Boolean);
      recipientName =
        pkg.recipientName ||
        String(relatedRequests[0]?.recipientName || "").trim();
      recipientBusinessAnchorId =
        pkg.recipientBusinessAnchorId ||
        String(relatedRequests[0]?.recipientBusinessAnchorId || "").trim();
    } else if (req) {
      mailboxAddress = req.mailboxAddress;
      recipientName = req.recipientName;
      recipientBusinessAnchorId = String(
        req.recipientBusinessAnchorId || "",
      ).trim();
      relatedRequests = [req];
    } else if (ptxReqs.length) {
      const mailboxes = [
        ...new Set(ptxReqs.map((r) => r.mailboxAddress).filter(Boolean)),
      ];
      mailboxAddress = mailboxes.length === 1 ? mailboxes[0] : "";
      recipientName = String(ptxReqs[0]?.recipientName || "").trim();
      recipientBusinessAnchorId = String(
        ptxReqs[0]?.recipientBusinessAnchorId || "",
      ).trim();
      relatedRequests = ptxReqs;
    }

    const group = ensureMailboxGroup(groups, {
      mailboxAddress,
      recipientName,
      recipientBusinessAnchorId,
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

function buildDailyAdjustRow(ymd, members, ctx) {
  const mailboxGroups = buildManufacturerAdjustGroups(members, ctx);
  const requestAmount = mailboxGroups.reduce(
    (sum, g) => sum + Number(g.productionAmount || 0),
    0,
  );
  const requestCount = mailboxGroups.reduce(
    (sum, g) => sum + Number(g.productionCount || 0),
    0,
  );
  const occurredAt = latestOccurredAt(members);
  return {
    _id: `adjust:${ymd}`,
    type: "ADJUST",
    groupKind: "adjust-daily",
    ymd,
    amount: requestAmount,
    requestAmount,
    requestCount,
    shippingAmount: 0,
    shippingCount: 0,
    paidAmount: members
      .filter((row) => String(row.creditKind || "") === "PAID")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    freeAmount: members
      .filter((row) => String(row.creditKind || "").startsWith("FREE"))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    creditKind: members[0]?.creditKind || null,
    displayLabel: "조정",
    eventType: "ADJUST",
    uniqueKey: `adjust:${ymd}`,
    occurredAt,
    createdAt: occurredAt,
    mailboxGroups,
  };
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
  const adjustByYmd = new Map();
  const singles = [];

  for (const row of list) {
    if (isManufacturerLabOriginShippingRow(row)) continue;
    const ymd =
      manufacturerLedgerKstYmd(row?.occurredAt || row?.createdAt) || "unknown";
    if (isManufacturerAdjustRow(row)) {
      const bucket = adjustByYmd.get(ymd);
      if (bucket) bucket.push(row);
      else adjustByYmd.set(ymd, [row]);
      continue;
    }
    if (!isManufacturerDailyEarnRow(row)) {
      singles.push({ ...row, groupKind: "single", mailboxGroups: null });
      continue;
    }
    const bucket = earnByYmd.get(ymd);
    if (bucket) bucket.push(row);
    else earnByYmd.set(ymd, [row]);
  }

  const grouped = [
    ...[...earnByYmd.entries()].map(([ymd, members]) =>
      buildDailyEarnRow(ymd, members, ctx),
    ),
    ...[...adjustByYmd.entries()].map(([ymd, members]) =>
      buildDailyAdjustRow(ymd, members, ctx),
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
