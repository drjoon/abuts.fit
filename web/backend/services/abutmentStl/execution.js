// STL JS 계산 실행 위치 SSOT.
// 로컬 개발에서만 백엔드 워커로 돌리고, 테스트·프로덕션(EBS)은 람다로 돌린다.
// ABUTMENT_STL_EXECUTION=local|lambda 로 강제할 수 있다. 람다 이름이 없으면 어느 모드든 워커다.
// 람다 이름(ABUTMENT_STL_*_LAMBDA)은 배포 스크립트가 EB env에 넣는다.

export function stlExecutionMode() {
  const raw = String(process.env.ABUTMENT_STL_EXECUTION || "").trim().toLowerCase();
  if (raw === "local" || raw === "worker") return "local";
  if (raw === "lambda") return "lambda";
  const env = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return env === "production" || env === "test" ? "lambda" : "local";
}

/** 이 람다를 지금 써야 하면 true. 이름이 비면 워커로 떨어진다. */
export function shouldUseStlLambda(lambdaName) {
  return stlExecutionMode() === "lambda" && Boolean(String(lambdaName || "").trim());
}
