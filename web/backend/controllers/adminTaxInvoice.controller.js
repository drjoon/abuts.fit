import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import AdminAuditLog from "../models/adminAuditLog.model.js";
import {
  issueTaxInvoice,
  getTaxInvoiceInfo,
  cancelTaxInvoice,
} from "../utils/popbill.util.js";

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

  const items = await TaxInvoiceDraft.find(match)
    .sort({ createdAt: -1, _id: -1 })
    .limit(500)
    .lean();

  return res.json({ success: true, data: items });
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

export async function adminApproveTaxInvoiceDraft(req, res) {
  const id = String(req.params.id || "").trim();

  const draft = await TaxInvoiceDraft.findById(id).lean();
  if (!draft)
    return res.status(404).json({ success: false, message: "not_found" });

  if (String(draft.status) === "SENT") {
    return res.status(400).json({ success: false, message: "already_sent" });
  }

  await TaxInvoiceDraft.updateOne(
    { _id: id, status: { $ne: "SENT" } },
    {
      $set: {
        status: "APPROVED",
        approvedAt: new Date(),
        failReason: null,
        hometaxTrxId: null,
        sentAt: null,
        attemptCount: 0,
        lastAttemptAt: null,
      },
    }
  );

  await writeAuditLog({
    req,
    action: "TAX_INVOICE_DRAFT_APPROVE",
    refType: "TaxInvoiceDraft",
    refId: id,
    details: null,
  });

  const updated = await TaxInvoiceDraft.findById(id).lean();
  return res.json({ success: true, data: updated });
}

export async function adminRejectTaxInvoiceDraft(req, res) {
  const id = String(req.params.id || "").trim();
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "";

  const draft = await TaxInvoiceDraft.findById(id).lean();
  if (!draft)
    return res.status(404).json({ success: false, message: "not_found" });

  if (String(draft.status) === "SENT") {
    return res.status(400).json({ success: false, message: "already_sent" });
  }

  await TaxInvoiceDraft.updateOne(
    { _id: id, status: { $ne: "SENT" } },
    { $set: { status: "REJECTED", failReason: reason || null } }
  );

  await writeAuditLog({
    req,
    action: "TAX_INVOICE_DRAFT_REJECT",
    refType: "TaxInvoiceDraft",
    refId: id,
    details: { reason },
  });

  const updated = await TaxInvoiceDraft.findById(id).lean();
  return res.json({ success: true, data: updated });
}

export async function adminCancelTaxInvoiceDraft(req, res) {
  const id = String(req.params.id || "").trim();

  const draft = await TaxInvoiceDraft.findById(id).lean();
  if (!draft)
    return res.status(404).json({ success: false, message: "not_found" });

  if (String(draft.status) === "SENT") {
    return res.status(400).json({ success: false, message: "already_sent" });
  }

  await TaxInvoiceDraft.updateOne(
    { _id: id, status: { $ne: "SENT" } },
    { $set: { status: "CANCELLED" } }
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

    if (String(draft.status) !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "APPROVED 상태의 문서만 발행할 수 있습니다.",
      });
    }

    const corpNum = process.env.POPBILL_CORP_NUM || "";
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
      });
    }

    const taxInvoice = {
      writeDate: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      chargeDirection: "정발행",
      issueType: "정발행",
      purposeType: "영수",
      taxType: "과세",
      invoicerCorpNum: corpNum,
      invoicerCorpName: process.env.POPBILL_CORP_NAME || "어벗츠 주식회사",
      invoicerCEOName: process.env.POPBILL_CEO_NAME || "배태완",
      invoicerAddr: process.env.POPBILL_ADDR || "",
      invoicerBizType: process.env.POPBILL_BIZ_TYPE || "정보통신업",
      invoicerBizClass: process.env.POPBILL_BIZ_CLASS || "소프트웨어 개발",
      invoicerContactName: process.env.POPBILL_CONTACT_NAME || "",
      invoicerEmail: process.env.POPBILL_EMAIL || "",
      invoicerTEL: process.env.POPBILL_TEL || "",
      invoiceeCorpNum: draft.buyer?.bizNo || "",
      invoiceeCorpName: draft.buyer?.corpName || "",
      invoiceeCEOName: draft.buyer?.ceoName || "",
      invoiceeAddr: draft.buyer?.addr || "",
      invoiceeBizType: draft.buyer?.bizType || "",
      invoiceeBizClass: draft.buyer?.bizClass || "",
      invoiceeContactName: draft.buyer?.contactName || "",
      invoiceeEmail: draft.buyer?.contactEmail || "",
      invoiceeTEL: draft.buyer?.contactTel || "",
      supplyCostTotal: String(draft.supplyAmount || 0),
      taxTotal: String(draft.vatAmount || 0),
      totalAmount: String(draft.totalAmount || 0),
      modifyCode: null,
      detailList: [
        {
          serialNum: 1,
          purchaseDT: new Date().toISOString().split("T")[0].replace(/-/g, ""),
          itemName: "크레딧 충전",
          spec: "",
          qty: "1",
          unitCost: String(draft.supplyAmount || 0),
          supplyCost: String(draft.supplyAmount || 0),
          tax: String(draft.vatAmount || 0),
          remark: "",
        },
      ],
    };

    const result = await issueTaxInvoice(
      corpNum,
      taxInvoice,
      "자동발행",
      false
    );

    await TaxInvoiceDraft.updateOne(
      { _id: id },
      {
        $set: {
          status: "SENT",
          sentAt: new Date(),
          hometaxTrxId: result?.ntsconfirmNum || null,
          attemptCount: (draft.attemptCount || 0) + 1,
          lastAttemptAt: new Date(),
        },
      }
    );

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_ISSUE",
      refType: "TaxInvoiceDraft",
      refId: id,
      details: { result },
    });

    const updated = await TaxInvoiceDraft.findById(id).lean();
    return res.json({ success: true, data: updated, popbillResult: result });
  } catch (error) {
    await TaxInvoiceDraft.updateOne(
      { _id: req.params.id },
      {
        $set: {
          status: "FAILED",
          failReason: error.message,
          attemptCount: { $inc: 1 },
          lastAttemptAt: new Date(),
        },
      }
    );

    return res.status(500).json({
      success: false,
      message: "세금계산서 발행 실패",
      error: error.message,
    });
  }
}

export async function adminGetTaxInvoiceStatus(req, res) {
  try {
    const { corpNum, mgtKeyType, mgtKey } = req.query;

    if (!corpNum || !mgtKeyType || !mgtKey) {
      return res.status(400).json({
        success: false,
        message: "필수 파라미터가 누락되었습니다.",
      });
    }

    const info = await getTaxInvoiceInfo(corpNum, mgtKeyType, mgtKey);

    return res.json({ success: true, data: info });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "세금계산서 상태 조회 실패",
      error: error.message,
    });
  }
}

export async function adminCancelIssuedTaxInvoice(req, res) {
  try {
    const { corpNum, mgtKeyType, mgtKey, memo } = req.body;

    if (!corpNum || !mgtKeyType || !mgtKey) {
      return res.status(400).json({
        success: false,
        message: "필수 파라미터가 누락되었습니다.",
      });
    }

    const result = await cancelTaxInvoice(
      corpNum,
      mgtKeyType,
      mgtKey,
      memo || ""
    );

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_CANCEL",
      refType: "POPBILL",
      refId: mgtKey,
      details: { corpNum, mgtKeyType, memo },
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "세금계산서 발행취소 실패",
      error: error.message,
    });
  }
}
