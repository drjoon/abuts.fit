import mongoose from "mongoose";
import BonusGrant from "../../models/bonusGrant.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildRequestSummary(doc) {
  if (!doc?._id) return null;
  const caseInfos = doc?.caseInfos || {};
  return {
    requestId: String(doc.requestId || ""),
    manufacturerStage: String(doc.manufacturerStage || ""),
    patientName: String(caseInfos.patientName || ""),
    tooth: String(caseInfos.tooth || ""),
    clinicName: String(caseInfos.clinicName || ""),
    lotNumber: {
      value: String(doc?.lotNumber?.value || ""),
    },
    caseInfos: {
      clinicName: String(caseInfos.clinicName || ""),
      patientName: String(caseInfos.patientName || ""),
      tooth: String(caseInfos.tooth || ""),
      implantManufacturer: String(caseInfos.implantManufacturer || ""),
      implantBrand: String(caseInfos.implantBrand || ""),
      implantFamily: String(caseInfos.implantFamily || ""),
      implantType: String(caseInfos.implantType || ""),
      maxDiameter: normalizeNumber(caseInfos.maxDiameter),
      connectionDiameter: normalizeNumber(caseInfos.connectionDiameter),
    },
  };
}

function parsePeriod(period) {
  const p = String(period || "").trim();
  if (!p || p === "all") return null;

  // KST 기준 N일 전 계산
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T00:00:00+09:00`);

  if (p === "7d") {
    todayKst.setDate(todayKst.getDate() - 7);
    return todayKst;
  }
  if (p === "30d") {
    todayKst.setDate(todayKst.getDate() - 30);
    return todayKst;
  }
  if (p === "90d") {
    todayKst.setDate(todayKst.getDate() - 90);
    return todayKst;
  }
  return null;
}

function safeRegex(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function parseBonusGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "").trim();
  const m = raw.match(/^bonus_grant:(.+)$/);
  return m ? m[1] : "";
}

export async function listMyCreditLedger(req, res) {
  const businessAnchorId = req.user?.businessAnchorId;

  if (!businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const typeRaw = String(req.query.type || "")
    .trim()
    .toUpperCase();
  const periodRaw = String(req.query.period || "").trim();
  const qRaw = String(req.query.q || "").trim();

  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(req.query.pageSize || 50) || 50),
  );

  const match = {
    businessAnchorId: new mongoose.Types.ObjectId(String(businessAnchorId)),
  };

  if (
    typeRaw &&
    typeRaw !== "ALL" &&
    ["CHARGE", "BONUS", "SPEND", "REFUND", "ADJUST"].includes(typeRaw)
  ) {
    match.type = typeRaw;
  }

  const createdAt = {};

  const sinceFromPeriod = parsePeriod(periodRaw);
  if (sinceFromPeriod) {
    createdAt.$gte = sinceFromPeriod;
  }

  const fromRaw = String(req.query.from || "").trim();
  const toRaw = String(req.query.to || "").trim();

  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) {
      createdAt.$gte = from;
    }
  }

  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) {
      createdAt.$lte = to;
    }
  }

  if (Object.keys(createdAt).length) {
    match.createdAt = createdAt;
  }

  if (qRaw) {
    const rx = safeRegex(qRaw);
    const ors = [];
    if (rx) {
      ors.push({ uniqueKey: rx });
      ors.push({ refType: rx });
    }

    if (mongoose.Types.ObjectId.isValid(qRaw)) {
      ors.push({ refId: new mongoose.Types.ObjectId(qRaw) });
    }

    const looksLikeRequestId = /^\d{8}-\d{6}$/.test(qRaw);
    if (looksLikeRequestId) {
      const requestDoc = await Request.findOne({ requestId: qRaw })
        .select({ _id: 1 })
        .lean();
      if (requestDoc?._id) {
        ors.push({
          refId: new mongoose.Types.ObjectId(String(requestDoc._id)),
        });
      }
    }

    if (ors.length) {
      match.$or = ors;
    }
  }

  // running balance: 전체 잔액 계산 (필터 무관)
  const balanceMatchQuery = {
    businessAnchorId: new mongoose.Types.ObjectId(String(businessAnchorId)),
  };

  const allLedgerRows = await CreditLedger.aggregate([
    { $match: balanceMatchQuery },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
  let totalBalance = 0;
  for (const r of allLedgerRows) {
    totalBalance += Number(r.total || 0);
  }

  const skippedRows =
    (page - 1) * pageSize > 0
      ? await CreditLedger.find(match)
          .sort({ createdAt: -1, _id: -1 })
          .limit((page - 1) * pageSize)
          .select({ type: 1, amount: 1 })
          .lean()
      : [];
  let skippedSum = 0;
  for (const r of skippedRows) {
    skippedSum += Number(r.amount || 0);
  }

  const [total, rawItems] = await Promise.all([
    CreditLedger.countDocuments(match),
    CreditLedger.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select({
        type: 1,
        amount: 1,
        spentPaidAmount: 1,
        spentBonusAmount: 1,
        refType: 1,
        refId: 1,
        uniqueKey: 1,
        userId: 1,
        createdAt: 1,
      })
      .lean(),
  ]);

  let runningBalance = totalBalance - skippedSum;
  const items = (Array.isArray(rawItems) ? rawItems : []).map((r) => {
    const balanceAfter = runningBalance;
    runningBalance -= Number(r.amount || 0);
    return { ...r, balanceAfter };
  });

  const requestRefIds = Array.from(
    new Set(
      (items || [])
        .filter(
          (it) =>
            String(it?.refType || "") === "REQUEST" &&
            it?.refId &&
            mongoose.Types.ObjectId.isValid(String(it.refId)),
        )
        .map((it) => String(it.refId)),
    ),
  );

  const shippingPackageRefIds = Array.from(
    new Set(
      (items || [])
        .filter(
          (it) =>
            String(it?.refType || "") === "SHIPPING_PACKAGE" &&
            it?.refId &&
            mongoose.Types.ObjectId.isValid(String(it.refId)),
        )
        .map((it) => String(it.refId)),
    ),
  );

  const welcomeBonusGrantIds = Array.from(
    new Set(
      (items || [])
        .filter((it) => String(it?.refType || "") === "WELCOME_BONUS")
        .map((it) => parseBonusGrantIdFromUniqueKey(it?.uniqueKey))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  );

  const refRequestIdById = new Map();
  const refRequestSummaryById = new Map();
  if (requestRefIds.length > 0) {
    const requestDocs = await Request.find({
      _id: { $in: requestRefIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select({
        _id: 1,
        requestId: 1,
        manufacturerStage: 1,
        lotNumber: 1,
        "caseInfos.patientName": 1,
        "caseInfos.tooth": 1,
        "caseInfos.clinicName": 1,
        "caseInfos.implantManufacturer": 1,
        "caseInfos.implantBrand": 1,
        "caseInfos.implantFamily": 1,
        "caseInfos.implantType": 1,
        "caseInfos.maxDiameter": 1,
        "caseInfos.connectionDiameter": 1,
      })
      .lean();

    for (const doc of requestDocs || []) {
      if (doc?._id) {
        refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
        refRequestSummaryById.set(String(doc._id), buildRequestSummary(doc));
      }
    }
  }

  const shippingTrackingNumbersByPackageId = new Map();
  if (shippingPackageRefIds.length > 0) {
    const packageDocs = await ShippingPackage.find({
      _id: {
        $in: shippingPackageRefIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select({ _id: 1, requestIds: 1 })
      .lean();

    const requestIdSet = new Set();
    for (const pkg of packageDocs || []) {
      for (const requestId of pkg?.requestIds || []) {
        if (requestId) requestIdSet.add(String(requestId));
      }
    }

    const deliveryInfoByRequestId = new Map();
    if (requestIdSet.size > 0) {
      const deliveryInfos = await DeliveryInfo.find({
        request: {
          $in: Array.from(requestIdSet).map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
        },
      })
        .select({ request: 1, trackingNumber: 1 })
        .lean();

      for (const delivery of deliveryInfos || []) {
        if (delivery?.request) {
          deliveryInfoByRequestId.set(
            String(delivery.request),
            String(delivery.trackingNumber || ""),
          );
        }
      }
    }

    for (const pkg of packageDocs || []) {
      const trackingNumbers = Array.from(
        new Set(
          (pkg?.requestIds || [])
            .map(
              (requestId) =>
                deliveryInfoByRequestId.get(String(requestId)) || "",
            )
            .filter(Boolean),
        ),
      );
      shippingTrackingNumbersByPackageId.set(String(pkg._id), trackingNumbers);
    }
  }

  const welcomeBonusReasonByGrantId = new Map();
  if (welcomeBonusGrantIds.length > 0) {
    const grants = await BonusGrant.find({
      _id: {
        $in: welcomeBonusGrantIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select({
        _id: 1,
        type: 1,
        source: 1,
        overrideReason: 1,
        businessNumber: 1,
      })
      .lean();

    for (const grant of grants || []) {
      if (!grant?._id) continue;
      const source = String(grant.source || "");
      const overrideReason = String(grant.overrideReason || "").trim();
      const businessNumber = String(grant.businessNumber || "").trim();
      let reason = "가입 축하 크레딧";
      if (source === "admin" && overrideReason) {
        reason = `관리자 지급 · ${overrideReason}`;
      } else if (source === "migrated") {
        reason = "시드/마이그레이션 가입 축하 크레딧";
      }
      if (businessNumber) {
        reason = `${reason} · 사업자번호 ${businessNumber}`;
      }
      welcomeBonusReasonByGrantId.set(String(grant._id), reason);
    }
  }

  const enrichedItems = (items || []).map((it) => {
    const refType = String(it?.refType || "");
    if (refType === "REQUEST") {
      const refId = it?.refId ? String(it.refId) : "";
      const refRequestId = refId ? refRequestIdById.get(refId) || "" : "";
      const requestSummary = refId
        ? refRequestSummaryById.get(refId) || null
        : null;
      return {
        ...it,
        refRequestId,
        refRequestSummary: requestSummary,
        patientName: requestSummary?.patientName || "",
        tooth: requestSummary?.tooth || "",
        clinicName: requestSummary?.clinicName || "",
        manufacturerStage: requestSummary?.manufacturerStage || "",
        lotNumber: requestSummary?.lotNumber || null,
        caseInfos: requestSummary?.caseInfos || null,
      };
    }

    if (refType === "SHIPPING_PACKAGE") {
      const refId = it?.refId ? String(it.refId) : "";
      return {
        ...it,
        trackingNumbers: refId
          ? shippingTrackingNumbersByPackageId.get(refId) || []
          : [],
      };
    }

    if (refType === "WELCOME_BONUS") {
      const grantId = parseBonusGrantIdFromUniqueKey(it?.uniqueKey);
      return {
        ...it,
        bonusReason: grantId
          ? welcomeBonusReasonByGrantId.get(grantId) || ""
          : "",
      };
    }

    const refId = it?.refId ? String(it.refId) : "";
    return { ...it, refId };
  });

  return res.json({
    success: true,
    data: {
      items: enrichedItems,
      total,
      page,
      pageSize,
    },
  });
}
