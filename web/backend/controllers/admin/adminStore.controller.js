// change-log:
// - 2026-08-23: 출고·배송완료 API. 거절 시 fulfillment CANCELED.
// - 2026-08-23: 관리자 스토어 재고·주문.
// related files:
// - web/backend/services/storeSale.service.js
// - web/backend/modules/admin/admin.routes.js
import StoreOrder from "../../models/storeOrder.model.js";
import StoreInventory from "../../models/storeInventory.model.js";
import AdminAuditLog from "../../models/adminAuditLog.model.js";
import {
  ensureStoreInventorySeeded,
  finalizeStoreSale,
  getInventoryMap,
  markStoreOrderDelivered,
  markStoreOrderShipped,
  releaseStoreInventoryReservation,
} from "../../services/storeSale.service.js";
import {
  getStoreProductName,
  getStoreProductPackagePriceInclusive,
  getStoreProductPriceInclusive,
  listStoreProductIds,
} from "../../constants/storeCatalog.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { setStorePackageBuyer } from "../../utils/storePackagePricing.js";
import {
  getCatalogDefaultPrices,
  upsertStoreProductPrice,
} from "../../utils/storeProductPricing.js";

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

export async function adminListStoreInventory(req, res) {
  try {
    await ensureStoreInventorySeeded();
    const map = await getInventoryMap();
    const rows = listStoreProductIds().map((productId) => {
      const defaults = getCatalogDefaultPrices(productId);
      return {
        productId,
        name: getStoreProductName(productId),
        listPriceInclusive: getStoreProductPriceInclusive(productId),
        packagePriceInclusive: getStoreProductPackagePriceInclusive(productId),
        defaultListPriceInclusive: defaults.listPriceInclusive,
        defaultPackagePriceInclusive: defaults.packagePriceInclusive,
        qtyOnHand: map[productId]?.qtyOnHand ?? 0,
        qtyReserved: map[productId]?.qtyReserved ?? 0,
        qtyAvailable: map[productId]?.available ?? 0,
      };
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "inventory_list_failed",
    });
  }
}

/** PATCH /api/admin/store/products/:productId/prices */
export async function adminPatchStoreProductPrices(req, res) {
  try {
    const productId = String(req.params.productId || "").trim();
    const body = req.body || {};
    const doc = await upsertStoreProductPrice({
      productId,
      listPriceInclusive: body.listPriceInclusive,
      packagePriceInclusive: body.packagePriceInclusive,
      clearList: body.clearList === true,
      clearPackage: body.clearPackage === true,
    });
    await writeAuditLog({
      req,
      action: "STORE_PRODUCT_PRICE_PATCH",
      refType: "StoreProductPrice",
      refId: productId,
      details: {
        listPriceInclusive: doc?.listPriceInclusive ?? null,
        packagePriceInclusive: doc?.packagePriceInclusive ?? null,
      },
    });
    return res.json({
      success: true,
      data: {
        productId,
        name: getStoreProductName(productId),
        listPriceInclusive: getStoreProductPriceInclusive(productId),
        packagePriceInclusive: getStoreProductPackagePriceInclusive(productId),
        ...getCatalogDefaultPrices(productId),
        override: {
          listPriceInclusive: doc?.listPriceInclusive ?? null,
          packagePriceInclusive: doc?.packagePriceInclusive ?? null,
        },
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "product_price_patch_failed",
    });
  }
}

/** GET /api/admin/store/package-buyer/:businessAnchorId */
export async function adminGetStorePackageBuyer(req, res) {
  try {
    const id = String(req.params.businessAnchorId || "").trim();
    const doc = await BusinessAnchor.findById(id)
      .select({
        name: 1,
        requestorKind: 1,
        storePackageBuyer: 1,
        storePackageBuyerAt: 1,
      })
      .lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "business_not_found" });
    }
    return res.json({
      success: true,
      data: {
        businessAnchorId: String(doc._id),
        name: doc.name || "",
        requestorKind: doc.requestorKind || null,
        storePackageBuyer: Boolean(doc.storePackageBuyer),
        storePackageBuyerAt: doc.storePackageBuyerAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "package_buyer_get_failed",
    });
  }
}

/** PATCH /api/admin/store/package-buyer/:businessAnchorId { enabled } */
export async function adminPatchStorePackageBuyer(req, res) {
  try {
    const id = String(req.params.businessAnchorId || "").trim();
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "enabled(boolean) required",
      });
    }
    const doc = await setStorePackageBuyer({
      businessAnchorId: id,
      enabled: req.body.enabled,
    });
    await writeAuditLog({
      req,
      action: "STORE_PACKAGE_BUYER_PATCH",
      refType: "BusinessAnchor",
      refId: id,
      details: {
        enabled: Boolean(req.body.enabled),
        storePackageBuyer: Boolean(doc.storePackageBuyer),
      },
    });
    return res.json({
      success: true,
      data: {
        businessAnchorId: String(doc._id || id),
        name: doc.name || "",
        storePackageBuyer: Boolean(doc.storePackageBuyer),
        storePackageBuyerAt: doc.storePackageBuyerAt || null,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "package_buyer_patch_failed",
    });
  }
}

export async function adminPatchStoreInventory(req, res) {
  try {
    const productId = String(req.params.productId || "").trim();
    if (!listStoreProductIds().includes(productId)) {
      return res.status(404).json({ success: false, message: "unknown_product" });
    }
    const qtyOnHand = Math.round(Number(req.body?.qtyOnHand));
    if (!Number.isFinite(qtyOnHand) || qtyOnHand < 0) {
      return res.status(400).json({
        success: false,
        message: "qtyOnHand must be a non-negative integer",
      });
    }

    await ensureStoreInventorySeeded();
    const doc = await StoreInventory.findOneAndUpdate(
      { productId },
      { $set: { qtyOnHand } },
      { new: true },
    ).lean();

    await writeAuditLog({
      req,
      action: "STORE_INVENTORY_PATCH",
      refType: "StoreInventory",
      refId: productId,
      details: { qtyOnHand },
    });

    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "inventory_patch_failed",
    });
  }
}

export async function adminListStoreOrders(req, res) {
  try {
    const status = String(req.query.status || "").trim();
    const filter = {};
    if (status) filter.status = status;

    const orders = await StoreOrder.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ success: true, data: orders });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "orders_list_failed",
    });
  }
}

export async function adminApproveStoreOrder(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const order = await StoreOrder.findById(id).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "not_found" });
    }
    if (String(order.status) === "PAID") {
      return res.json({
        success: true,
        message: "이미 결제 확정된 주문입니다.",
        data: order,
      });
    }
    if (!["PENDING", "MATCHED"].includes(String(order.status))) {
      return res.status(400).json({
        success: false,
        message: `승인할 수 없는 상태: ${order.status}`,
      });
    }

    const note = String(req.body?.note || "").trim();
    const result = await finalizeStoreSale({
      orderId: order._id,
      matchedBy: "ADMIN",
      matchedByUserId: req.user?._id || null,
      adminNote: note,
      issueInline: true,
    });

    await writeAuditLog({
      req,
      action: "STORE_ORDER_APPROVE",
      refType: "StoreOrder",
      refId: id,
      details: result,
    });

    const updated = await StoreOrder.findById(id).lean();
    return res.json({
      success: true,
      message: "스토어 주문이 확정되었습니다.",
      data: updated,
      finalize: result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "approve_failed",
    });
  }
}

export async function adminRejectStoreOrder(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const note = String(req.body?.note || "").trim();
    const order = await StoreOrder.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "not_found" });
    }
    if (String(order.status) !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "대기 주문만 거절할 수 있습니다.",
      });
    }

    await releaseStoreInventoryReservation({ items: order.items });
    const now = new Date();
    order.status = "CANCELED";
    order.fulfillmentStatus = "CANCELED";
    order.canceledAt = now;
    order.canceledBy = req.user?._id || null;
    order.canceledByRole = "ADMIN";
    order.cancelReason = note || "admin_reject";
    order.adminApprovalStatus = "REJECTED";
    order.adminApprovalNote = note;
    order.adminApprovalAt = now;
    order.adminApprovalBy = req.user?._id || null;
    await order.save();

    await writeAuditLog({
      req,
      action: "STORE_ORDER_REJECT",
      refType: "StoreOrder",
      refId: id,
      details: { note },
    });

    return res.json({ success: true, data: order.toObject() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "reject_failed",
    });
  }
}

export async function adminShipStoreOrder(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const courier = String(req.body?.courier || "").trim();
    const trackingNumber = String(req.body?.trackingNumber || "").trim();
    const note = String(req.body?.note || "").trim();

    const result = await markStoreOrderShipped({
      orderId: id,
      courier,
      trackingNumber,
      note,
      actorUserId: req.user?._id || null,
    });

    await writeAuditLog({
      req,
      action: "STORE_ORDER_SHIP",
      refType: "StoreOrder",
      refId: id,
      details: {
        courier,
        trackingNumber,
        fulfillmentStatus: result.order?.fulfillmentStatus,
      },
    });

    return res.json({
      success: true,
      message: "출고 처리되었습니다.",
      data: result.order,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "ship_failed",
    });
  }
}

export async function adminDeliverStoreOrder(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const note = String(req.body?.note || "").trim();

    const result = await markStoreOrderDelivered({
      orderId: id,
      note,
      actorUserId: req.user?._id || null,
    });

    await writeAuditLog({
      req,
      action: "STORE_ORDER_DELIVER",
      refType: "StoreOrder",
      refId: id,
      details: {
        fulfillmentStatus: result.order?.fulfillmentStatus,
      },
    });

    return res.json({
      success: true,
      message: "배송 완료 처리되었습니다.",
      data: result.order,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "deliver_failed",
    });
  }
}
