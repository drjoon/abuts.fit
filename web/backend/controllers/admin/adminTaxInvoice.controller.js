// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import AdminAuditLog from "../../models/adminAuditLog.model.js";
import {
  buildTaxinvoiceObject,
  registIssueInvoice,
  cancelIssuedInvoice,
  getTaxinvoiceInfo,
} from "../../utils/popbill.util.js";
import { verifyBusinessNumber } from "../../services/hometax.service.js";

async function writeAuditLog({ req, action, refType, refId, details }) {
  const actorUserId = req.user?._id;
  if (!actorUserId) return;

  await AdminAuditLog.create({
    actorUserId,
    action,
    refType: String(refType || ""),
    refId: refId || null,
    details: details ?? null,
    ipAddress: String(req.headers["x-forwarded-for"] || req.ip || ""),
  });
}

function pickBuyerPayload(body) {
  const buyer = body?.buyer ?? {};
  return {
    bizNo: typeof buyer.bizNo === "string" ? buyer.bizNo : undefined,
    corpName: typeof buyer.corpName === "string" ? buyer.corpName : undefined,
    ceoName: typeof buyer.ceoName === "string" ? buyer.ceoName : undefined,
    addr: typeof buyer.addr === "string" ? buyer.addr : undefined,
    bizType: typeof buyer.bizType === "string" ? buyer.bizType : undefined,
    bizClass: typeof buyer.bizClass === "string" ? buyer.bizClass : undefined,
    contactName:
      typeof buyer.contactName === "string" ? buyer.contactName : undefined,
    contactEmail:
      typeof buyer.contactEmail === "string" ? buyer.contactEmail : undefined,
    contactTel:
      typeof buyer.contactTel === "string" ? buyer.contactTel : undefined,
  };
}

function toNumOrUndef(v) {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function adminGetTaxInvoiceStats(req, res) {
  try {
    if (
      String(process.env.SKIP_TAX_INVOICE_QUERIES || "").toLowerCase() ===
      "true"
    ) {
      return res.json({ success: true, data: {} });
    }
    const [byStatus, reverseSent] = await Promise.all([
      TaxInvoiceDraft.aggregate([
        {
          $match: {
            $or: [{ kind: { $exists: false } }, { kind: "NORMAL" }],
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      TaxInvoiceDraft.countDocuments({ kind: "REVERSE", status: "SENT" }),
    ]);
    const data = {};
    for (const row of byStatus) data[row._id] = row.count;
    data.REVERSE_SENT = reverseSent;
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function adminListTaxInvoiceDrafts(req, res) {
  // 개발 환경에서 일시적으로 조회 차단 (몽고 타임아웃 회피용)
  if (
    String(process.env.SKIP_TAX_INVOICE_QUERIES || "").toLowerCase() === "true"
  ) {
    return res.json({ success: true, data: [] });
  }

  const status = String(req.query.status || "")
    .trim()
    .toUpperCase();
  const search = String(req.query.search || "").trim();
  const direction = String(req.query.direction || "").trim().toUpperCase();
  const taxType = String(req.query.taxType || "").trim();
  const kind = String(req.query.kind || "").trim().toUpperCase();
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;

  const match = {};
  if (
    status &&
    [
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "SENT",
      "FAILED",
      "CANCELLED",
    ].includes(status)
  ) {
    match.status = status;
  }
  if (
    ["ABUTS_TO_CUSTOMER", "LAB_TO_PRACTICE", "AFFILIATE_TO_ABUTS"].includes(
      direction,
    )
  ) {
    match.direction = direction;
  }
  if (["과세", "면세"].includes(taxType)) {
    match.taxType = taxType;
  }
  if (kind === "REVERSE") {
    match.kind = "REVERSE";
  } else if (kind === "NORMAL") {
    match.$and = [
      ...(match.$and || []),
      { $or: [{ kind: { $exists: false } }, { kind: "NORMAL" }] },
    ];
  } else if (status === "SENT" && !kind) {
    // 발행완료 기본: 원본(NORMAL)만. 마이너스는 kind=REVERSE 탭에서.
    match.$and = [
      ...(match.$and || []),
      { $or: [{ kind: { $exists: false } }, { kind: "NORMAL" }] },
    ];
  }

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  if (search) {
    const re = new RegExp(search.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i");
    match.$or = [{ "buyer.corpName": re }, { "buyer.bizNo": re }];
  }

  try {
    const items = await TaxInvoiceDraft.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function adminGetTaxInvoiceDraft(req, res) {
  const id = String(req.params.id || "").trim();
  const doc = await TaxInvoiceDraft.findById(id).lean();
  if (!doc)
    return res.status(404).json({ success: false, message: "not_found" });
  return res.json({ success: true, data: doc });
}

export async function adminUpdateTaxInvoiceDraft(req, res) {
  const id = String(req.params.id || "").trim();

  const draft = await TaxInvoiceDraft.findById(id).lean();
  if (!draft)
    return res.status(404).json({ success: false, message: "not_found" });

  if (String(draft.status) === "SENT") {
    return res.status(400).json({ success: false, message: "already_sent" });
  }

  const supplyAmount = toNumOrUndef(req.body?.supplyAmount);
  const vatAmount = toNumOrUndef(req.body?.vatAmount);
  const totalAmount = toNumOrUndef(req.body?.totalAmount);
  const buyerPatch = pickBuyerPayload(req.body);

  const $set = {};
  if (supplyAmount !== undefined) $set.supplyAmount = supplyAmount;
  if (vatAmount !== undefined) $set.vatAmount = vatAmount;
  if (totalAmount !== undefined) $set.totalAmount = totalAmount;

  for (const [k, v] of Object.entries(buyerPatch)) {
    if (v !== undefined) $set[`buyer.${k}`] = v;
  }

  if (Object.keys($set).length === 0) {
    return res.json({ success: true, data: draft });
  }

  await TaxInvoiceDraft.updateOne({ _id: id }, { $set });
  await writeAuditLog({
    req,
    action: "TAX_INVOICE_DRAFT_UPDATE",
    refType: "TaxInvoiceDraft",
    refId: id,
    details: { $set },
  });

  const updated = await TaxInvoiceDraft.findById(id).lean();
  return res.json({ success: true, data: updated });
}

export async function adminCancelTaxInvoiceDraft(req, res) {
  const id = String(req.params.id || "").trim();

  const draft = await TaxInvoiceDraft.findById(id).lean();
  if (!draft)
    return res.status(404).json({ success: false, message: "not_found" });

  // 미발행 초안만 CANCELLED로 폐기. SENT는 원본 유지 + 마이너스(REVERSE) 발행.
  if (String(draft.status) !== "SENT") {
    await TaxInvoiceDraft.updateOne(
      { _id: id, status: { $nin: ["SENT"] } },
      { $set: { status: "CANCELLED" } },
    );
    await writeAuditLog({
      req,
      action: "TAX_INVOICE_DRAFT_CANCEL",
      refType: "TaxInvoiceDraft",
      refId: id,
      details: null,
    });
    const updated = await TaxInvoiceDraft.findById(id).lean();
    return res.json({ success: true, data: updated });
  }

  if (draft.kind === "REVERSE") {
    return res.status(400).json({
      success: false,
      message: "마이너스 발행 건은 다시 취소할 수 없습니다.",
    });
  }
  if (draft.reversedByDraftId) {
    const existing = await TaxInvoiceDraft.findById(
      draft.reversedByDraftId,
    ).lean();
    return res.json({
      success: true,
      message: "이미 마이너스 발행이 연결되어 있습니다.",
      data: draft,
      reverse: existing,
    });
  }

  const corpNum = (process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
  if (!corpNum) {
    return res.status(500).json({
      success: false,
      message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
    });
  }

  const mgtKeyType = draft.issuanceMode === "TRUSTEE" ? "TRUSTEE" : "SELL";
  const mgtKey = String(id).slice(0, 24);

  let popbillInfo = null;
  try {
    popbillInfo = await getTaxinvoiceInfo({ corpNum, mgtKey, mgtKeyType });
  } catch {
    popbillInfo = null;
  }

  const stateCode = Number(popbillInfo?.stateCode || 0);
  const ntsConfirmNum =
    String(
      popbillInfo?.ntsconfirmNum ||
        popbillInfo?.NTSConfirmNum ||
        draft.ntsConfirmNum ||
        "",
    ).trim() || null;

  if (ntsConfirmNum && !draft.ntsConfirmNum) {
    await TaxInvoiceDraft.updateOne({ _id: id }, { $set: { ntsConfirmNum } });
  }

  // 발행완료·미전송(300): cancelIssue로 원본 CANCELLED 가능
  if (stateCode === 300) {
    try {
      await cancelIssuedInvoice({ corpNum, mgtKey, mgtKeyType });
    } catch (popbillError) {
      const errMsg =
        popbillError?.ErrMsg || popbillError?.message || String(popbillError);
      return res.status(422).json({
        success: false,
        message: `팝빌 발행취소 실패: ${errMsg}`,
      });
    }
    await TaxInvoiceDraft.updateOne(
      { _id: id },
      {
        $set: {
          status: "CANCELLED",
          ntsConfirmNum: ntsConfirmNum || draft.ntsConfirmNum,
        },
      },
    );
    await writeAuditLog({
      req,
      action: "TAX_INVOICE_CANCELLED",
      refType: "TaxInvoiceDraft",
      refId: id,
      details: { mgtKey, via: "cancel_issue", stateCode },
    });
    const cancelledDraft = await TaxInvoiceDraft.findById(id).lean();
    return res.json({
      success: true,
      message: "발행취소 완료(전송 전).",
      data: cancelledDraft,
    });
  }

  // 전송성공(304) 등: 원본 SENT 유지 + 마이너스 REVERSE draft 발행
  const memo = String(req.body?.memo || "데모/계약의 해제").trim();
  const now = new Date();
  const reverseDraft = await TaxInvoiceDraft.create({
    chargeOrderId: null, // unique index — reverse must not share chargeOrderId
    userId: draft.userId || null,
    businessAnchorId: draft.businessAnchorId || null,
    direction: draft.direction || "ABUTS_TO_CUSTOMER",
    issuanceMode: draft.issuanceMode || "SELF",
    taxType: draft.taxType === "과세" ? "과세" : "면세",
    kind: "REVERSE",
    reversesDraftId: draft._id,
    modifyCode: "4",
    orgNtsConfirmNum: ntsConfirmNum,
    sellerAnchorId: draft.sellerAnchorId || null,
    seller: draft.seller || undefined,
    writeDate: now.toISOString().slice(0, 10).replace(/-/g, ""),
    status: "APPROVED",
    approvedAt: now,
    supplyAmount: -Math.abs(Number(draft.supplyAmount) || 0),
    vatAmount: -Math.abs(Number(draft.vatAmount) || 0),
    totalAmount: -Math.abs(Number(draft.totalAmount) || 0),
    itemName: `${draft.itemName || "항목"} (마이너스)`,
    buyer: draft.buyer || {},
    sourceRefType: "TaxInvoiceDraft",
    sourceRefIds: [draft._id],
  });

  const reverseMgtKey = String(reverseDraft._id).slice(0, 24);
  const taxinvoice = buildTaxinvoiceObject({
    draft: reverseDraft.toObject(),
    mgtKey: reverseMgtKey,
  });

  let response;
  try {
    response = await registIssueInvoice({ corpNum, taxinvoice });
  } catch (popbillError) {
    const errMsg =
      popbillError?.ErrMsg || popbillError?.message || String(popbillError);
    await TaxInvoiceDraft.updateOne(
      { _id: reverseDraft._id },
      {
        $set: {
          status: "FAILED",
          failReason: `[팝빌 오류] ${errMsg}`,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
    );
    await writeAuditLog({
      req,
      action: "TAX_INVOICE_REVERSE_FAILED",
      refType: "TaxInvoiceDraft",
      refId: reverseDraft._id,
      details: { error: errMsg, originalId: id },
    });
    return res.status(422).json({
      success: false,
      message: `마이너스 발행 실패: ${errMsg}`,
      reverseId: reverseDraft._id,
    });
  }

  const trxID = response?.trxID || response?.TrxID || reverseMgtKey;
  const reverseNts =
    response?.ntsConfirmNum || response?.NTSConfirmNum || null;

  await TaxInvoiceDraft.updateOne(
    { _id: reverseDraft._id },
    {
      $set: {
        status: "SENT",
        hometaxTrxId: trxID,
        ntsConfirmNum: reverseNts,
        sentAt: now,
        failReason: null,
        lastAttemptAt: now,
      },
      $inc: { attemptCount: 1 },
    },
  );
  await TaxInvoiceDraft.updateOne(
    { _id: id },
    {
      $set: {
        reversedByDraftId: reverseDraft._id,
        ntsConfirmNum: ntsConfirmNum || draft.ntsConfirmNum,
      },
    },
  );

  await writeAuditLog({
    req,
    action: "TAX_INVOICE_REVERSED",
    refType: "TaxInvoiceDraft",
    refId: id,
    details: {
      reverseId: reverseDraft._id,
      reverseMgtKey,
      trxID,
      memo,
      stateCode,
      orgNtsConfirmNum: ntsConfirmNum,
    },
  });

  const [original, reverse] = await Promise.all([
    TaxInvoiceDraft.findById(id).lean(),
    TaxInvoiceDraft.findById(reverseDraft._id).lean(),
  ]);

  return res.json({
    success: true,
    message: "마이너스 발행 완료. 원본 발행완료는 유지됩니다.",
    data: original,
    reverse,
  });
}

export async function adminIssueTaxInvoice(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const draft = await TaxInvoiceDraft.findById(id).lean();

    if (!draft) {
      return res.status(404).json({ success: false, message: "not_found" });
    }
    if (String(draft.status) === "SENT") {
      return res.status(400).json({ success: false, message: "already_sent" });
    }
    const issuableStatuses = ["APPROVED", "FAILED"];
    if (!issuableStatuses.includes(String(draft.status))) {
      return res.status(400).json({
        success: false,
        message: "FAILED 또는 APPROVED 상태의 문서만 발행할 수 있습니다.",
      });
    }

    const corpNum = (process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
      });
    }

    const mgtKey = String(id).slice(0, 24);
    const taxinvoice = buildTaxinvoiceObject({ draft, mgtKey });
    const now = new Date();

    let response;
    try {
      response = await registIssueInvoice({ corpNum, taxinvoice });
    } catch (popbillError) {
      const errMsg =
        popbillError?.ErrMsg || popbillError?.message || String(popbillError);
      await TaxInvoiceDraft.updateOne(
        { _id: id },
        {
          $set: {
            status: "FAILED",
            failReason: `[팝빌 오류] ${errMsg}`,
            lastAttemptAt: now,
          },
          $inc: { attemptCount: 1 },
        },
      );
      await writeAuditLog({
        req,
        action: "TAX_INVOICE_ISSUE_FAILED",
        refType: "TaxInvoiceDraft",
        refId: id,
        details: { error: errMsg },
      });
      return res.status(422).json({
        success: false,
        message: `팝빌 발행 실패: ${errMsg}`,
      });
    }

    const trxID = response?.trxID || response?.TrxID || mgtKey;
    await TaxInvoiceDraft.updateOne(
      { _id: id },
      {
        $set: {
          status: "SENT",
          hometaxTrxId: trxID,
          sentAt: now,
          failReason: null,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
    );

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_ISSUED",
      refType: "TaxInvoiceDraft",
      refId: id,
      details: { mgtKey, trxID },
    });

    const updated = await TaxInvoiceDraft.findById(id).lean();
    return res.json({
      success: true,
      message: "세금계산서 발행 완료",
      data: updated,
    });
  } catch (error) {
    console.error("adminIssueTaxInvoice error:", error);
    return res.status(500).json({
      success: false,
      message: "세금계산서 발행 실패",
      error: error.message,
    });
  }
}

export async function adminGetTaxInvoiceStatus(req, res) {
  return res.status(404).json({
    success: false,
    message:
      "직접 상태 조회 기능은 더 이상 지원되지 않습니다. DB 상태를 확인해주세요.",
  });
}

export async function adminCancelIssuedTaxInvoice(req, res) {
  try {
    const { mgtKey, memo } = req.body;
    if (!mgtKey) {
      return res
        .status(400)
        .json({ success: false, message: "mgtKey가 필요합니다." });
    }
    const corpNum = (process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
      });
    }
    try {
      await cancelIssuedInvoice({ corpNum, mgtKey, memo });
    } catch (popbillError) {
      const errMsg =
        popbillError?.ErrMsg || popbillError?.message || String(popbillError);
      return res
        .status(422)
        .json({ success: false, message: `팝빌 취소 실패: ${errMsg}` });
    }
    await writeAuditLog({
      req,
      action: "TAX_INVOICE_CANCELLED_DIRECT",
      refType: "POPBILL",
      refId: mgtKey,
      details: { mgtKey, memo },
    });
    return res.json({
      success: true,
      message: "세금계산서 발행이 취소되었습니다.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "발행취소 실패", error: error.message });
  }
}

export async function adminValidateBizNumber(req, res) {
  try {
    const bizNo = String(req.body?.bizNo || "").trim();
    if (!bizNo) {
      return res
        .status(400)
        .json({ success: false, message: "bizNo가 필요합니다." });
    }
    const result = await verifyBusinessNumber({
      businessNumber: bizNo,
      companyName: String(req.body?.companyName || "").trim(),
      representativeName: String(req.body?.representativeName || "").trim(),
    });
    return res.json({
      success: true,
      verified: !!result?.verified,
      message: result?.message || "",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function adminDirectIssueTaxInvoice(req, res) {
  try {
    const { buyer, supplyAmount, vatAmount, totalAmount, writeDate, itemName } =
      req.body;

    if (!buyer?.bizNo || !buyer?.corpName) {
      return res.status(400).json({
        success: false,
        message: "매입처 사업자번호와 상호가 필요합니다.",
      });
    }
    if (!supplyAmount || !totalAmount) {
      return res
        .status(400)
        .json({ success: false, message: "공급가액과 합계금액이 필요합니다." });
    }

    const corpNum = (process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
      });
    }

    const now = new Date();
    const draft = await TaxInvoiceDraft.create({
      chargeOrderId: null,
      businessAnchorId: null,
      status: "APPROVED",
      approvedAt: now,
      direction: "ABUTS_TO_CUSTOMER",
      issuanceMode: "SELF",
      taxType: req.body?.taxType === "과세" ? "과세" : "면세",
      itemName: itemName || "서비스 이용료",
      supplyAmount: Math.round(Number(supplyAmount) || 0),
      vatAmount: Math.round(Number(vatAmount) || 0),
      totalAmount: Math.round(Number(totalAmount) || 0),
      writeDate: writeDate
        ? String(writeDate).replace(/-/g, "").slice(0, 8)
        : null,
      buyer: {
        bizNo: String(buyer.bizNo || "").replace(/-/g, ""),
        corpName: String(buyer.corpName || ""),
        ceoName: String(buyer.ceoName || ""),
        addr: String(buyer.addr || ""),
        bizType: String(buyer.bizType || ""),
        bizClass: String(buyer.bizClass || ""),
        contactName: String(buyer.contactName || ""),
        contactEmail: String(buyer.contactEmail || ""),
        contactTel: String(buyer.contactTel || ""),
      },
    });

    const mgtKey = String(draft._id).slice(0, 24);
    const taxinvoice = buildTaxinvoiceObject({
      draft: {
        ...draft.toObject(),
        itemName: itemName || "서비스 이용료",
      },
      mgtKey,
      writeDate,
    });

    let response;
    try {
      response = await registIssueInvoice({ corpNum, taxinvoice });
    } catch (popbillError) {
      const errMsg =
        popbillError?.ErrMsg || popbillError?.message || String(popbillError);
      await TaxInvoiceDraft.updateOne(
        { _id: draft._id },
        {
          $set: {
            status: "FAILED",
            failReason: `[팝빌 오류] ${errMsg}`,
            lastAttemptAt: now,
          },
          $inc: { attemptCount: 1 },
        },
      );
      await writeAuditLog({
        req,
        action: "TAX_INVOICE_DIRECT_ISSUE_FAILED",
        refType: "TaxInvoiceDraft",
        refId: draft._id,
        details: { error: errMsg },
      });
      return res
        .status(422)
        .json({ success: false, message: `팝빌 발행 실패: ${errMsg}` });
    }

    const trxID = response?.trxID || response?.TrxID || mgtKey;
    await TaxInvoiceDraft.updateOne(
      { _id: draft._id },
      {
        $set: {
          status: "SENT",
          hometaxTrxId: trxID,
          sentAt: now,
          failReason: null,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
    );

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_DIRECT_ISSUED",
      refType: "TaxInvoiceDraft",
      refId: draft._id,
      details: { mgtKey, trxID, buyerBizNo: buyer.bizNo },
    });

    const updated = await TaxInvoiceDraft.findById(draft._id).lean();
    return res
      .status(201)
      .json({ success: true, message: "세금계산서 발행 완료", data: updated });
  } catch (error) {
    console.error("adminDirectIssueTaxInvoice error:", error);
    return res.status(500).json({
      success: false,
      message: "세금계산서 직접 발행 실패",
      error: error.message,
    });
  }
}
