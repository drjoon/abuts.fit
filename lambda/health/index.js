export const handler = async () => {
  const now = new Date();

  // TODO: 아래 부분을 실제 지표 조회 로직으로 교체하세요.
  // 예: ACM/ALB 인증서 만료일, WAF 차단 건수, 백업 성공 타임스탬프를
  // CloudWatch, API, DB 등에서 조회한 뒤 status/message를 채웁니다.

  const tls = {
    status: "ok",
    message: "만료 90일 남음",
    expiresAt: "2025-12-31T00:00:00Z",
  };

  const waf = {
    status: "ok",
    message: "최근 1시간 차단 0건",
    blockedLast1h: 0,
  };

  const backup = {
    status: "ok",
    message: "백업 성공 1시간 전",
    lastSuccessAt: new Date(now.getTime() - 3600_000).toISOString(),
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tls, waf, backup }),
  };
};
