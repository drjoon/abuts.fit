// 관리자 홈 — 자동 디자인으로 바꾸지 못한 요청.
// related files:
// - web/backend/services/aiDesignGap.service.js
// - web/backend/modules/admin/admin.routes.js
import { listOpenAiDesignGaps, reviewAiDesignGap } from "../../services/aiDesignGap.service.js";

export async function listAdminAiDesignGaps(_req, res) {
  try {
    const data = await listOpenAiDesignGaps();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[admin] listAdminAiDesignGaps error", error);
    return res.status(500).json({ success: false, message: "미지원 디자인을 불러오지 못했습니다." });
  }
}

export async function reviewAdminAiDesignGap(req, res) {
  try {
    const data = await reviewAiDesignGap(req.params?.id);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[admin] reviewAdminAiDesignGap error", error);
    return res.status(500).json({ success: false, message: "확인을 저장하지 못했습니다." });
  }
}
