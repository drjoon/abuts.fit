import express from "express";
import {
  getMachines,
  upsertMachine,
  deleteMachine,
  getMachineStatusProxy,
  getMachineAlarmProxy,
  clearMachineAlarmProxy,
  resetMachineProxy,
  callRawProxy,
  startMachineProxy,
  stopMachineProxy,
} from "../controllers/machine.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = express.Router();

// NODE_ENV === 'test' 또는 'development'에서는 인증을 건너뛰고,
// 그 외 환경에서는 authenticate + authorize(roles)를 적용하는 헬퍼
const maybeAuth =
  (roles = []) =>
  async (req, res, next) => {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.NODE_ENV === "development"
    )
      return next();

    // 인증 시도
    await authenticate(req, res, async () => {
      if (res.headersSent) return; // 인증 단계에서 이미 응답이 나간 경우
      const guard = authorize(roles);
      return guard(req, res, next);
    });
  };

// 제조사만 장비 목록/등록/삭제 및 제어 가능 (test 환경 제외)
router.get("/", maybeAuth(["manufacturer"]), getMachines);
router.post("/", maybeAuth(["manufacturer"]), upsertMachine);
router.delete("/:uid", maybeAuth(["manufacturer"]), deleteMachine);

router.get("/:uid/status", maybeAuth(["manufacturer"]), getMachineStatusProxy);

router.post("/:uid/alarm", maybeAuth(["manufacturer"]), getMachineAlarmProxy);

router.post(
  "/:uid/alarm/clear",
  maybeAuth(["manufacturer"]),
  clearMachineAlarmProxy,
);

router.post("/:uid/reset", maybeAuth(["manufacturer"]), resetMachineProxy);

router.post("/:uid/start", maybeAuth(["manufacturer"]), startMachineProxy);

router.post("/:uid/stop", maybeAuth(["manufacturer"]), stopMachineProxy);

router.post("/:uid/raw", maybeAuth(["manufacturer"]), callRawProxy);

export default router;
