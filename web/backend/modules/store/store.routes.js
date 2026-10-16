// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/backend/app.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  cancelMyStoreOrder,
  createStoreOrder,
  getMyStoreOrder,
  getStoreCatalog,
  listMyStoreOrders,
  payMyStoreOrderWithCredit,
} from "../../controllers/store/storeOrder.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["requestor"]));

router.get("/catalog", getStoreCatalog);
router.get("/orders", listMyStoreOrders);
router.get("/orders/:id", getMyStoreOrder);
router.post("/orders", createStoreOrder);
router.post("/orders/:id/pay-with-credit", payMyStoreOrderWithCredit);
router.post("/orders/:id/cancel", cancelMyStoreOrder);

export default router;
