import { Router } from "express";
import { getDbVersion } from "../../config/dbVersion.js";

const router = Router();

// DB 버전 반환 (프론트엔드 localStorage 초기화 판단용)
router.get("/version", (req, res) => {
  const dbVersion = getDbVersion();
  return res.json({
    success: true,
    data: {
      dbVersion,
    },
  });
});

export default router;
