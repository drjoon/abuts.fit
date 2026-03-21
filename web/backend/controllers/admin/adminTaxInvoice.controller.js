import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import AdminAuditLog from "../../models/adminAuditLog.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import Business from "../../models/business.model.js";
import {
  enqueueTaxInvoiceIssue,
  enqueueTaxInvoiceCancel,
} from "../../utils/queueClient.js";

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
    },
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
    { $set: { status: "REJECTED", failReason: reason || null } },
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

    const queueResult = await enqueueTaxInvoiceIssue({
      draftId: id,
      corpNum,
      priority: 10,
    });

    if (!queueResult.enqueued) {
      return res.status(400).json({
        success: false,
        message: `발행 요청 실패: ${queueResult.reason}`,
        taskId: queueResult.taskId,
      });
    }

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_ISSUE_QUEUED",
      refType: "TaxInvoiceDraft",
      refId: id,
      details: { taskId: queueResult.taskId },
    });

    return res.json({
      success: true,
      message:
        "세금계산서 발행이 큐에 등록되었습니다. 백그라운드 워커가 처리합니다.",
      taskId: queueResult.taskId,
    });
  } catch (error) {
    console.error("adminIssueTaxInvoice error:", error);
    return res.status(500).json({
      success: false,
      message: "세금계산서 발행 요청 실패",
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

export async function adminManualCreateTaxInvoiceDraft(req, res) {
  try {
    const chargeOrderId = String(req.body?.chargeOrderId || "").trim();
    if (!chargeOrderId) {
      return res
        .status(400)
        .json({ success: false, message: "chargeOrderId가 필요합니다." });
    }

    const order = await ChargeOrder.findById(chargeOrderId).lean();
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "ChargeOrder를 찾을 수 없습니다." });
    }

    if (!["MATCHED", "AUTO_MATCHED"].includes(String(order.status))) {
      return res.status(400).json({
        success: false,
        message:
          "입금 확인(MATCHED/AUTO_MATCHED) 상태의 주문만 수동 발행할 수 있습니다.",
      });
    }

    const existing = await TaxInvoiceDraft.findOne({
      chargeOrderId: order._id,
    }).lean();
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "이미 세금계산서 드래프트가 존재합니다.",
        data: existing,
      });
    }

    const org = await Business.findOne({
      businessAnchorId: order.businessAnchorId,
    })
      .select({
        "extracted.businessNumber": 1,
        "extracted.companyName": 1,
        "extracted.representativeName": 1,
        "extracted.address": 1,
        "extracted.businessType": 1,
        "extracted.businessItem": 1,
        "extracted.email": 1,
        "extracted.phoneNumber": 1,
      })
      .lean();

    const draft = await TaxInvoiceDraft.create({
      chargeOrderId: order._id,
      businessAnchorId: order.businessAnchorId,
      status: "PENDING_APPROVAL",
      supplyAmount: Number(order.supplyAmount),
      vatAmount: Number(order.vatAmount || 0),
      totalAmount: Number(order.amountTotal || 0),
      buyer: {
        bizNo: org?.extracted?.businessNumber || "",
        corpName: org?.extracted?.companyName || "",
        ceoName: org?.extracted?.representativeName || "",
        addr: org?.extracted?.address || "",
        bizType: org?.extracted?.businessType || "",
        bizClass: org?.extracted?.businessItem || "",
        contactEmail: org?.extracted?.email || "",
        contactTel: org?.extracted?.phoneNumber || "",
        contactName: org?.extracted?.representativeName || "",
      },
    });

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_DRAFT_MANUAL_CREATE",
      refType: "TaxInvoiceDraft",
      refId: draft._id,
      details: { chargeOrderId: String(order._id) },
    });

    return res.status(201).json({ success: true, data: draft });
  } catch (error) {
    console.error("adminManualCreateTaxInvoiceDraft error:", error);
    return res.status(500).json({
      success: false,
      message: "수동 세금계산서 드래프트 생성 실패",
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

    // 큐에 취소 요청 등록
    // mgtKey는 "DRAFT_{draftId}" 형식이므로 draftId 추출 가능.
    let draftId = "";
    if (mgtKey.startsWith("DRAFT_")) {
      draftId = mgtKey.replace("DRAFT_", "");
    } else {
      draftId = mgtKey;
    }

    const result = await enqueueTaxInvoiceCancel({
      draftId,
      corpNum,
      mgtKey,
      priority: 10,
    });

    await writeAuditLog({
      req,
      action: "TAX_INVOICE_CANCEL_QUEUED",
      refType: "POPBILL",
      refId: mgtKey,
      details: { corpNum, mgtKeyType, memo, taskId: result.taskId },
    });

    return res.json({
      success: true,
      message: "세금계산서 발행취소가 큐에 등록되었습니다.",
      taskId: result.taskId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "세금계산서 발행취소 요청 실패",
      error: error.message,
    });
  }
}
