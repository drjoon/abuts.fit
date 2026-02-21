import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { proxyToBridge } from "../../utils/bridgeProxy.js";

const router = express.Router();

const maybeAuth =
  (roles = []) =>
  async (req, res, next) => {
    if (process.env.NODE_ENV === "test") return next();
    await authenticate(req, res, async () => {
      if (res.headersSent) return;
      const guard = authorize(roles);
      return guard(req, res, next);
    });
  };

// Bridge-store (브리지 파일시스템) 직접 조작은 SSOT 원칙상 관리자만 허용
const guard = maybeAuth(["admin"]);

router.get("/config", guard, proxyToBridge("/api/bridge-store/config"));
router.get("/list", guard, proxyToBridge("/api/bridge-store/list"));
router.get("/file", guard, proxyToBridge("/api/bridge-store/file"));
router.get("/folder-zip", guard, proxyToBridge("/api/bridge-store/folder-zip"));
router.post("/mkdir", guard, proxyToBridge("/api/bridge-store/mkdir"));
router.post("/rename", guard, proxyToBridge("/api/bridge-store/rename"));
router.post("/move", guard, proxyToBridge("/api/bridge-store/move"));
router.post("/file", guard, proxyToBridge("/api/bridge-store/file"));
router.delete("/file", guard, proxyToBridge("/api/bridge-store/file"));
router.delete("/folder", guard, proxyToBridge("/api/bridge-store/folder"));

export default router;
