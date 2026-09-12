// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/services/platformGrowthStats.service.js
import { Router } from "express";
import { getDbVersion } from "../../config/dbVersion.js";
import { getPlatformSocialProof } from "../../services/platformGrowthStats.service.js";

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

/** 랜딩용 소셜 프루프 (매출 제외 · 비로그인) */
router.get("/platform-pitch", async (_req, res) => {
  try {
    const data = await getPlatformSocialProof();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[system.platform-pitch]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "플랫폼 소개 통계 조회에 실패했습니다.",
    });
  }
});

export default router;
