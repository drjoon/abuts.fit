/**
 * 2026-10-17 펌뱅킹 견적 문의 4통 — Brevo 직접 발송분을 발신함(Mail)에 백필.
 *
 * cd web/backend && ENV_FILE=prod.env ABUTS_DB_FORCE=true node scripts/db/backfill-vendor-ob-inquiry-sent-mails.js
 */
import "../../bootstrap/env.js";
import mongoose from "mongoose";
import { getMongoUri, assertSafeToMutateDb } from "./_mongo.js";
import { recordSentOutboundMailOnly } from "../../services/outboundMailRecord.service.js";

const SENT_AT = new Date("2026-10-17T09:58:00+09:00");

const bodyText = `안녕하세요, 어벗츠 주식회사 이준호입니다.

치과–기공소 기공의뢰 플랫폼(abuts.fit)에서 기공의뢰 후불 정산을 위해
「장기 출금동의 + 매월 정산일(익월 5일 09:00 KST) 자동 이체」 API 연동·견적을 요청드립니다.

필요: 출금동의 등록·갱신, 정산일 협력 기공소·법인 분배 이체, 실패·부분성공 처리, 테스트베드
견적: 도입비·월정액·건당(출금/지급/인증), VAT, 가입·심사 기간, 의료 B2B 가능 여부
「치과→수취처 직접 분할」 vs 「1회 출금 후 법인 지급」 권장 방식도 부탁드립니다.

■ 회사
· 상호: 어벗츠 주식회사 / 대표: 배태완
· 사업자등록번호: 358-87-03514
· 주소: 경상남도 거제시 거제중앙로29길 6, 3층(고현동)
· 서비스: https://abuts.fit
· 담당: 이준호 / 010-9074-4656 / info@mail.abuts.fit (대표전화 1588-3948)
· 희망: 2026년 연말까지 샌드박스 연동 검토

감사합니다.
이준호 드림`;

const bodyHtml = bodyText.replace(/\n/g, "<br />\n");

const messages = [
  {
    to: "info_F@hecto.co.kr",
    subject: "[견적] 펌뱅킹·OB 월 정산 API – 어벗츠 주식회사",
    intro: "PG가 아닌 B2B 펌뱅킹·오픈뱅킹 정산 문의드립니다.\n\n",
  },
  {
    to: "biz@coocon.net",
    subject: "[견적] 출금·입금이체 API – 어벗츠 주식회사",
    intro: "출금이체·입금이체 API 문의드립니다.\n\n",
  },
  {
    to: "cms@efh.co.kr",
    subject: "[견적] CMS Web API 정기출금·지급 – 어벗츠 주식회사",
    intro: "효성CMS+ Web API 연동 문의드립니다.\n\n",
  },
  {
    to: "nicepayment@naver.com",
    subject: "[견적] 더빌 CMS·API – 어벗츠 주식회사",
    intro: "더빌 CMS 자동이체·API 연동 문의드립니다.\n\n",
  },
];

async function main() {
  assertSafeToMutateDb();
  const uri = getMongoUri();
  await mongoose.connect(uri);
  const dbName = mongoose.connection.db?.databaseName;
  console.log("[backfill-vendor-ob-mails] dbName:", dbName);

  const Mail = mongoose.connection.collection("mails");

  for (const msg of messages) {
    const existing = await Mail.findOne({
      folder: "sent",
      subject: msg.subject,
      to: msg.to,
      sentAt: { $gte: new Date("2026-10-17T00:00:00+09:00") },
    });
    if (existing) {
      console.log("skip (exists):", msg.to);
      continue;
    }
    await recordSentOutboundMailOnly({
      to: msg.to,
      subject: msg.subject,
      bodyText: msg.intro + bodyText,
      bodyHtml: msg.intro.replace(/\n/g, "<br />") + bodyHtml,
      sentAt: SENT_AT,
    });
    console.log("recorded:", msg.to);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
