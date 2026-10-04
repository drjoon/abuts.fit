// related files:
// - web/backend/services/labHelperAlarm.service.js
// - web/backend/modules/labHelper/labHelper.routes.js
// change-log:
// - 2026-10-04: canUseLabHelperAlarm을 service로 공유(WS와 동일).
// - 2026-10-04: 치과(practice)도 wait 허용 — FE useLabHelperAlarmSession과 동일.
// - 2026-10-03: wait 응답 no-store·ETag 제거(빈 응답 304로 알람 유실 방지).
// - 2026-10-03: 헬퍼 PC 알람 장기 폴링(wait). 신규 헬퍼는 WS 사용 — wait는 구버전 호환.

import {
  canUseLabHelperAlarm,
  waitForLabHelperAlarm,
} from "../../services/labHelperAlarm.service.js";

const applyWaitNoCacheHeaders = (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  // Express fresh/ETag가 동일 빈 본문을 304로 바꾸면 헬퍼가 본문을 못 읽는다.
  if (req?.headers) {
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
  }
};

/** GET /api/lab-helper/alarms/wait?wait=25 — 구 헬퍼(v13 이하) 호환 */
export async function waitLabHelperAlarm(req, res) {
  try {
    applyWaitNoCacheHeaders(req, res);
    if (!canUseLabHelperAlarm(req.user)) {
      return res.status(403).json({
        success: false,
        ok: false,
        message: "기공소·치과 계정만 사용할 수 있습니다.",
      });
    }
    const userId = String(req.user?._id || req.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({
        success: false,
        ok: false,
        message: "인증이 필요합니다.",
      });
    }
    const waitSec = Math.min(
      30,
      Math.max(1, Number(req.query?.wait) || 25),
    );
    // Node 기본 헤더 타임아웃보다 짧게. 헬퍼 클라이언트 timeout과 맞춤.
    req.setTimeout((waitSec + 15) * 1000);
    res.setTimeout((waitSec + 15) * 1000);

    const alarm = await waitForLabHelperAlarm(userId, waitSec * 1000);
    applyWaitNoCacheHeaders(req, res);
    if (!alarm) {
      return res.status(200).json({ ok: true, alarm: null });
    }
    return res.status(200).json({ ok: true, alarm });
  } catch (error) {
    console.warn("[labHelperAlarm] wait failed", error?.message || error);
    applyWaitNoCacheHeaders(req, res);
    return res.status(500).json({
      success: false,
      ok: false,
      message: "알람 대기 중 오류가 발생했습니다.",
    });
  }
}
