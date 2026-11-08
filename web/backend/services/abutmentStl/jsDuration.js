// related files:
// - web/backend/services/abutmentStl/jsPrimary.service.js (의뢰 caseInfos.jsDuration 저장)
// - web/backend/services/abutmentStl/filledLambda.handler.js
// - web/backend/services/abutmentStl/cuffBlendLambda.handler.js
// - web/backend/services/abutmentStl/correctLambda.handler.js
//
// JS 계산 시간. 람다·워커는 계산 시간(computeMs)을 로그하고 결과에 싣는다.
// 백엔드는 대기까지 포함한 wallMs와 함께 의뢰 메타에 남긴다.

export function elapsedMs(started) {
  return Math.max(0, Date.now() - started);
}

/** 로그 한 줄. requestId가 없으면 람다 임시 실행이다. */
export function logJsDuration(stage, { requestId, engine, wallMs, computeMs, extra } = {}) {
  const id = String(requestId || "").trim().slice(0, 40);
  const parts = [
    `[stl-js] stage=${stage}`,
    id ? `requestId=${id}` : "",
    engine ? `engine=${engine}` : "",
    Number.isFinite(wallMs) ? `wallMs=${Math.round(wallMs)}` : "",
    Number.isFinite(computeMs) ? `computeMs=${Math.round(computeMs)}` : "",
    extra ? String(extra).slice(0, 500) : "",
  ].filter(Boolean);
  console.log(parts.join(" "));
}

/** 의뢰 caseInfos.jsDuration에 넣는 단계 하나. */
export function jsStageTiming({ engine, wallMs, computeMs, ...rest }) {
  const stage = {};
  if (engine) stage.engine = String(engine);
  if (Number.isFinite(wallMs)) stage.wallMs = Math.round(wallMs);
  if (Number.isFinite(Number(computeMs))) stage.computeMs = Math.round(Number(computeMs));
  for (const [key, value] of Object.entries(rest)) {
    if (value == null) continue;
    stage[key] = value;
  }
  return stage;
}
