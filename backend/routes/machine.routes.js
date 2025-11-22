import express from "express";
import {
  getMachines,
  upsertMachine,
  deleteMachine,
  getMachineStatusProxy,
  startMachineProxy,
  stopMachineProxy,
  resetMachineProxy,
  pauseAllProxy,
  resumeAllProxy,
  callRawProxy,
} from "../controllers/machine.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = express.Router();

// NODE_ENV === 'test' 에서는 인증을 건너뛰고,
// 그 외 환경에서는 authenticate + authorize(roles)를 적용하는 헬퍼
const maybeAuth =
  (roles = []) =>
  async (req, res, next) => {
    if (process.env.NODE_ENV === "test") return next();

    // 인증 시도
    await authenticate(req, res, async () => {
      if (res.headersSent) return; // 인증 단계에서 이미 응답이 나간 경우
      const guard = authorize(roles);
      return guard(req, res, next);
    });
  };

// 제조사/관리자만 장비 목록/등록/삭제 및 제어 가능 (test 환경 제외)
router.get("/", maybeAuth(["manufacturer", "admin"]), getMachines);
router.post("/", maybeAuth(["manufacturer", "admin"]), upsertMachine);
router.delete("/:uid", maybeAuth(["manufacturer", "admin"]), deleteMachine);

router.get(
  "/:uid/status",
  maybeAuth(["manufacturer", "admin"]),
  getMachineStatusProxy
);
router.post(
  "/:uid/start",
  maybeAuth(["manufacturer", "admin"]),
  startMachineProxy
);
router.post(
  "/:uid/stop",
  maybeAuth(["manufacturer", "admin"]),
  stopMachineProxy
);
router.post(
  "/:uid/reset",
  maybeAuth(["manufacturer", "admin"]),
  resetMachineProxy
);

router.post("/pause-all", maybeAuth(["manufacturer", "admin"]), pauseAllProxy);

router.post(
  "/resume-all",
  maybeAuth(["manufacturer", "admin"]),
  resumeAllProxy
);

router.post("/:uid/raw", maybeAuth(["manufacturer", "admin"]), callRawProxy);

export default router;
