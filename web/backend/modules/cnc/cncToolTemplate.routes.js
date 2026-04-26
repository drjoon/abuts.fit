import express from "express";
import * as toolTemplateController from "../../controllers/cnc/toolTemplate.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";

const router = express.Router();

// 모든 엔드포인트는 로그인된 manufacturer/admin만 호출 가능.
router.use(authenticate);

router.get(
  "/",
  authorizeRoles("manufacturer", "admin"),
  toolTemplateController.listToolTemplates,
);

router.get(
  "/machines",
  authorizeRoles("manufacturer", "admin"),
  toolTemplateController.listCncMachinesForTemplate,
);

router.post(
  "/",
  authorizeRoles("manufacturer", "admin"),
  toolTemplateController.createToolTemplate,
);

router.put(
  "/:id",
  authorizeRoles("manufacturer", "admin"),
  toolTemplateController.updateToolTemplate,
);

router.delete(
  "/:id",
  authorizeRoles("manufacturer", "admin"),
  toolTemplateController.deleteToolTemplate,
);

router.post(
  "/:id/apply",
  authorizeRoles("manufacturer", "admin"),
  toolTemplateController.applyToolTemplate,
);

export default router;
