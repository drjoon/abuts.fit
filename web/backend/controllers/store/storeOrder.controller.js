// change-log:
// - 2026-08-23: 주문 생성+선수금 결제 단일 트랜잭션(이중 commit 제거).
// - 2026-08-23: 스토어 신규 주문은 선수금만. 계좌이체 입금 경로 제거.
// - 2026-08-23: 배송지·풀필먼트·장바구니 합치기 금지 가드.
// - 2026-08-23: 스토어 카탈로그·주문·입금(B-plan) API.
// related files:
// - web/backend/services/storeSale.service.js
// - web/backend/modules/store/store.routes.js
import mongoose from "mongoose";
import StoreOrder from "../../models/storeOrder.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { generateStoreOrderDepositCode } from "../../utils/depositCode.utils.js";
import { splitInclusiveVat } from "../../utils/storeVat.js";
import {
  getStoreProductName,
  getStoreProductPriceInclusive,
} from "../../constants/storeCatalog.js";
import { STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT } from "../../constants/ledgerTaxLanes.js";
import {
  STORE_SHIPPING_FEE_INCLUSIVE,
  STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE,
  applyStoreShippingToOrderTotals,
} from "../../constants/storeShipping.js";
import { normalizeRequestorKind } from "../../utils/requestorCapabilities.js";
import {
  cancelStoreOrderByUser,
  finalizeStoreSale,
  getInventoryMap,
  payStoreOrderWithCredit,
  reserveStoreInventory,
} from "../../services/storeSale.service.js";

const B_PLAN_DEPOSIT_ACCOUNT_DEFAULTS = {
  bankName: "하나은행",
  accountNumber: "806-910009-00004",
  holderName: "어벗츠 주식회사",
};

const ORDER_TTL_MS = 48 * 60 * 60 * 1000;

async function getDepositAccountInfo() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ bPlanDepositAccount: 1 })
    .lean();
  const info = doc?.bPlanDepositAccount || {};
  return {
    bankName: String(
      info.bankName || B_PLAN_DEPOSIT_ACCOUNT_DEFAULTS.bankName,
    ).trim(),
    accountNumber: String(
      info.accountNumber ||
        process.env.B_PLAN_DEPOSIT_ACCOUNT_NO ||
        B_PLAN_DEPOSIT_ACCOUNT_DEFAULTS.accountNumber,
    ).trim(),
    holderName: String(
      info.holderName || B_PLAN_DEPOSIT_ACCOUNT_DEFAULTS.holderName,
    ).trim(),
  };
}

function assertPracticeRequestor(req) {
  const userRole = req.user?.role;
  if (userRole !== "requestor") {
    const err = new Error("스토어는 의뢰자 계정만 이용할 수 있습니다.");
    err.statusCode = 403;
    throw err;
  }
  return true;
}

async function assertPracticeKind(req, businessAnchorId) {
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ requestorKind: 1 })
    .lean();
  const kind =
    normalizeRequestorKind(anchor?.requestorKind) ||
    normalizeRequestorKind(req.user?.requestorKind) ||
    "";
  if (kind === "lab") {
    const err = new Error("스토어는 치과(의뢰 발신자) 계정만 이용할 수 있습니다.");
    err.statusCode = 403;
    throw err;
  }
  return kind || "practice";
}

function buildOrderItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const err = new Error("장바구니 항목이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const merged = new Map();
  for (const raw of rawItems) {
    const productId = String(raw?.productId || "").trim();
    const qty = Math.max(0, Math.round(Number(raw?.qty || 0)));
    if (!productId || qty <= 0) continue;
    const unit = getStoreProductPriceInclusive(productId);
    if (unit == null) {
      const err = new Error(`알 수 없는 상품: ${productId}`);
      err.statusCode = 400;
      throw err;
    }
    merged.set(productId, (merged.get(productId) || 0) + qty);
  }

  if (merged.size === 0) {
    const err = new Error("유효한 장바구니 항목이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const items = [];
  let supplyAmount = 0;
  let vatAmount = 0;
  let amountTotal = 0;

  for (const [productId, qty] of merged.entries()) {
    const unitPriceInclusive = getStoreProductPriceInclusive(productId);
    const lineTotalInclusive = unitPriceInclusive * qty;
    const split = splitInclusiveVat(lineTotalInclusive);
    items.push({
      productId,
      name: getStoreProductName(productId),
      qty,
      unitPriceInclusive,
      supplyAmount: split.supply,
      vatAmount: split.vat,
      lineTotalInclusive: split.total,
    });
    supplyAmount += split.supply;
    vatAmount += split.vat;
    amountTotal += split.total;
  }

  return { items, supplyAmount, vatAmount, amountTotal, itemsAmountTotal: amountTotal };
}

function normalizeShippingInput(raw = {}) {
  return {
    recipientName: String(raw.recipientName || "").trim(),
    phone: String(raw.phone || "").trim(),
    zipCode: String(raw.zipCode || "").trim(),
    address: String(raw.address || "").trim(),
    addressDetail: String(raw.addressDetail || "").trim(),
    memo: String(raw.memo || "").trim(),
  };
}

function assertShippingComplete(shipping) {
  if (!shipping.recipientName || !shipping.phone || !shipping.address) {
    const err = new Error(
      "배송지(수령인·연락처·주소)를 모두 입력해 주세요.",
    );
    err.statusCode = 400;
    throw err;
  }
  return shipping;
}

async function resolveDefaultShipping({ userId, businessAnchorId }) {
  const [user, anchor] = await Promise.all([
    userId
      ? User.findById(userId)
          .select({ practiceProfile: 1, name: 1 })
          .lean()
      : null,
    BusinessAnchor.findById(businessAnchorId)
      .select({ metadata: 1 })
      .lean(),
  ]);
  const profile = user?.practiceProfile || {};
  const meta = anchor?.metadata || {};
  return normalizeShippingInput({
    recipientName:
      profile.clinicName ||
      profile.directorName ||
      meta.companyName ||
      user?.name ||
      "",
    phone: profile.clinicPhone || profile.phone || meta.phoneNumber || "",
    zipCode: profile.zipCode || meta.zipCode || "",
    address: profile.address || meta.address || "",
    addressDetail: profile.addressDetail || meta.addressDetail || "",
    memo: "",
  });
}

export async function getStoreCatalog(req, res) {
  try {
    assertPracticeRequestor(req);
    const businessAnchorId = req.user?.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }
    await assertPracticeKind(req, businessAnchorId);

    const [inventory, defaultShipping] = await Promise.all([
      getInventoryMap(),
      resolveDefaultShipping({
        userId: req.user?._id,
        businessAnchorId,
      }),
    ]);
    const products = Object.keys(inventory).map((productId) => ({
      productId,
      name: getStoreProductName(productId),
      listPriceInclusive: getStoreProductPriceInclusive(productId),
      qtyAvailable: inventory[productId]?.available ?? 0,
      qtyOnHand: inventory[productId]?.qtyOnHand ?? 0,
    }));

    return res.json({
      success: true,
      data: {
        products,
        taxNote: "과세 · 부가세 포함",
        shippingPolicy: {
          feeInclusive: STORE_SHIPPING_FEE_INCLUSIVE,
          freeThresholdInclusive: STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE,
        },
        // 장바구니 합치기 금지 SSOT (프론트 카피·가드용)
        cartMergeWithCreditOrCustomAbutment:
          STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT,
        defaultShipping,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "catalog_failed",
    });
  }
}

export async function createStoreOrder(req, res) {
  const session = await mongoose.startSession();
  try {
    assertPracticeRequestor(req);
    const businessAnchorId = req.user?.businessAnchorId;
    const userId = req.user?._id;
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }
    await assertPracticeKind(req, businessAnchorId);

    const built = buildOrderItems(req.body?.items);
    const totals = applyStoreShippingToOrderTotals(built);
    const items = built.items;
    const {
      itemsAmountTotal,
      shippingFeeInclusive,
      shippingSupplyAmount,
      shippingVatAmount,
      supplyAmount,
      vatAmount,
      amountTotal,
    } = totals;
    if (amountTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: "결제 금액이 올바르지 않습니다.",
      });
    }

    // 커스텀어벗·크레딧과 동일 장바구니/결제 합치기 금지.
    if (STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT) {
      const err = new Error("store_cart_merge_forbidden");
      err.statusCode = 500;
      throw err;
    }
    if (req.body?.chargeOrderId || req.body?.creditItems || req.body?.requestIds) {
      return res.status(400).json({
        success: false,
        message:
          "스토어 주문은 커스텀어벗·크레딧 충전과 합칠 수 없습니다. 스토어에서만 주문해 주세요.",
        code: "STORE_CART_MERGE_FORBIDDEN",
      });
    }

    const shipping = assertShippingComplete(
      normalizeShippingInput(req.body?.shipping),
    );
    // 스토어는 선수금(CREDIT)만 허용.
    const requestedMethod = String(req.body?.paymentMethod || "CREDIT")
      .trim()
      .toUpperCase();
    if (requestedMethod && requestedMethod !== "CREDIT") {
      return res.status(400).json({
        success: false,
        message: "스토어는 선수금으로만 결제할 수 있습니다. 잔액이 부족하면 충전 후 다시 주문해 주세요.",
        code: "STORE_CREDIT_ONLY",
      });
    }
    const paymentMethod = "CREDIT";

    const { depositCode } = await generateStoreOrderDepositCode();
    const expiresAt = new Date(Date.now() + ORDER_TTL_MS);

    let created = null;
    try {
      await session.withTransaction(async () => {
        await reserveStoreInventory({ items, session });

        const [doc] = await StoreOrder.create(
          [
            {
              businessAnchorId,
              userId,
              depositCode,
              depositorName: depositCode,
              status: "PENDING",
              fulfillmentStatus: "UNPAID",
              adminApprovalStatus: "PENDING",
              paymentMethod,
              items,
              shipping,
              itemsAmountTotal,
              shippingFeeInclusive,
              shippingSupplyAmount,
              shippingVatAmount,
              supplyAmount,
              vatAmount,
              amountTotal,
              expiresAt,
            },
          ],
          { session },
        );
        created = doc.toObject();

        await payStoreOrderWithCredit({
          orderId: created._id,
          userId,
          session,
        });
      });
    } catch (payErr) {
      const status = payErr.statusCode || 500;
      return res.status(status).json({
        success: false,
        message: payErr.message || "credit_pay_failed",
        code: payErr.code || undefined,
        payload: payErr.payload || undefined,
      });
    }
    const paid = await StoreOrder.findById(created._id).lean();
    return res.status(201).json({
      success: true,
      data: { order: paid, paymentMethod: "CREDIT" },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "create_order_failed",
      code: error.code || undefined,
    });
  } finally {
    session.endSession();
  }
}

export async function payMyStoreOrderWithCredit(req, res) {
  try {
    assertPracticeRequestor(req);
    const businessAnchorId = req.user?.businessAnchorId;
    const id = String(req.params.id || "").trim();
    const order = await StoreOrder.findOne({
      _id: id,
      businessAnchorId,
    }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "not_found" });
    }
    const result = await payStoreOrderWithCredit({
      orderId: order._id,
      userId: req.user?._id || null,
    });
    const updated = await StoreOrder.findById(id).lean();
    return res.json({ success: true, data: updated, pay: result });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "pay_failed",
      code: error.code || undefined,
      payload: error.payload || undefined,
    });
  }
}

export async function listMyStoreOrders(req, res) {
  try {
    assertPracticeRequestor(req);
    const businessAnchorId = req.user?.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }

    const orders = await StoreOrder.find({ businessAnchorId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const depositAccount = await getDepositAccountInfo();
    return res.json({
      success: true,
      data: { orders, depositAccount },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "list_failed",
    });
  }
}

export async function getMyStoreOrder(req, res) {
  try {
    assertPracticeRequestor(req);
    const businessAnchorId = req.user?.businessAnchorId;
    const id = String(req.params.id || "").trim();
    const order = await StoreOrder.findOne({
      _id: id,
      businessAnchorId,
    }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "not_found" });
    }
    const depositAccount = await getDepositAccountInfo();
    return res.json({ success: true, data: { order, depositAccount } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "get_failed",
    });
  }
}

export async function cancelMyStoreOrder(req, res) {
  try {
    assertPracticeRequestor(req);
    const businessAnchorId = req.user?.businessAnchorId;
    const id = String(req.params.id || "").trim();
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }

    const canceled = await cancelStoreOrderByUser({
      orderId: id,
      businessAnchorId,
      userId: req.user?._id || null,
    });

    return res.json({ success: true, data: canceled });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "cancel_failed",
    });
  }
}

/** 관리자 승인 경로에서도 재사용. */
export { finalizeStoreSale };
