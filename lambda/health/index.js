const HOURS = 3600_000;

async function getTlsHealth() {
  const arn = process.env.TLS_CERT_ARN;
  if (!arn) {
    return { status: "unknown", message: "TLS_CERT_ARN 미설정" };
  }

  try {
    const AWS = await import("aws-sdk");
    const acm = new AWS.ACM();
    const { Certificate } = await acm
      .describeCertificate({ CertificateArn: arn })
      .promise();
    const notAfter = Certificate?.NotAfter;
    if (!notAfter) {
      return { status: "warning", message: "인증서 만료일을 가져올 수 없음" };
    }
    const expiresAt = new Date(notAfter);
    const daysRemaining = Math.floor(
      (expiresAt.getTime() - Date.now()) / (24 * 3600_000)
    );
    const status =
      daysRemaining < 7 ? "critical" : daysRemaining < 30 ? "warning" : "ok";
    return {
      status,
      message: `만료까지 ${daysRemaining}일`,
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
    };
  } catch (err) {
    return { status: "warning", message: `ACM 조회 실패: ${err.message}` };
  }
}

async function getWafHealth() {
  const webAclArn = process.env.WAF_WEB_ACL_ARN;
  const scope = process.env.WAF_SCOPE || "REGIONAL"; // CLOUDFRONT or REGIONAL
  if (!webAclArn) {
    return { status: "unknown", message: "WAF_WEB_ACL_ARN 미설정" };
  }

  try {
    const AWS = await import("aws-sdk");
    const cloudwatch = new AWS.CloudWatch({ region: process.env.WAF_REGION });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 3600_000); // 최근 1h
    const metricName =
      scope === "CLOUDFRONT" ? "BlockedRequests" : "BlockedRequests";
    const dimensions =
      scope === "CLOUDFRONT"
        ? [
            { Name: "WebACL", Value: webAclArn },
            { Name: "Region", Value: "Global" },
          ]
        : [
            { Name: "WebACL", Value: webAclArn },
            { Name: "Rule", Value: "ALL" },
            {
              Name: "Region",
              Value: process.env.WAF_REGION || "ap-northeast-2",
            },
          ];

    const cwRes = await cloudwatch
      .getMetricStatistics({
        Namespace: "AWS/WAFV2",
        MetricName: metricName,
        Dimensions: dimensions,
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ["Sum"],
      })
      .promise();
    const blockedLast1h =
      (cwRes.Datapoints || []).reduce((acc, p) => acc + (p.Sum || 0), 0) || 0;
    const status = blockedLast1h > 0 ? "warning" : "ok";
    return {
      status,
      message: `최근 1시간 차단 ${blockedLast1h}건`,
      blockedLast1h,
    };
  } catch (err) {
    return { status: "warning", message: `WAF 조회 실패: ${err.message}` };
  }
}

async function getBackupHealth() {
  const backupUrl = process.env.BACKUP_HEALTH_URL;
  if (backupUrl) {
    try {
      const res = await fetch(backupUrl, { timeout: 3000 });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();
      return {
        status: data.status || "ok",
        message: data.message || "백업 상태 수신",
        lastSuccessAt: data.lastSuccessAt,
      };
    } catch (err) {
      return {
        status: "warning",
        message: `백업 헬스 조회 실패: ${err.message}`,
      };
    }
  }

  // fallback: env에 마지막 성공 시각을 직접 제공
  const lastIso = process.env.BACKUP_LAST_SUCCESS_ISO;
  if (!lastIso) {
    return { status: "unknown", message: "백업 상태 정보를 찾을 수 없습니다." };
  }
  const last = new Date(lastIso);
  const hoursAgo = (Date.now() - last.getTime()) / HOURS;
  const status = hoursAgo > 24 ? "warning" : "ok";
  return {
    status,
    message: `백업 성공 ${hoursAgo.toFixed(1)}시간 전`,
    lastSuccessAt: last.toISOString(),
  };
}

export const handler = async () => {
  const [tls, waf, backup] = await Promise.all([
    getTlsHealth(),
    getWafHealth(),
    getBackupHealth(),
  ]);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tls, waf, backup }),
  };
};
