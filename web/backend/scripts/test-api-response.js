import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

async function testApiResponse() {
  try {
    // 제조사 토큰 필요 - 실제 토큰으로 교체 필요
    const token = process.env.TEST_MANUFACTURER_TOKEN;

    if (!token) {
      console.error("❌ TEST_MANUFACTURER_TOKEN 환경변수가 필요합니다.");
      console.error(
        "제조사 계정으로 로그인하여 토큰을 local.env에 설정해주세요.",
      );
      process.exit(1);
    }

    const baseUrl = "http://localhost:5173";

    // 1. 세척.패킹 워크시트 API 호출
    console.log("=== 1. 세척.패킹 워크시트 API 호출 ===");
    const url = new URL("/api/requests/all", baseUrl);
    url.searchParams.set("page", "1");
    url.searchParams.set("limit", "50");
    url.searchParams.set("view", "worksheet");
    url.searchParams.set("includeTotal", "0");
    url.searchParams.set("manufacturerStage", "세척.패킹");

    console.log(`URL: ${url.pathname}${url.search}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`❌ API 호출 실패: ${response.status}`);
      const text = await response.text();
      console.error(text);
      process.exit(1);
    }

    const data = await response.json();

    console.log(`\n응답 성공: ${response.status}`);
    console.log(`총 의뢰 수: ${data.data?.requests?.length || 0}`);

    if (data.data?.requests?.length > 0) {
      console.log("\n의뢰 목록:");
      data.data.requests.forEach((r) => {
        console.log(
          `- ${r.requestId} | stage: ${r.manufacturerStage} | mailbox: ${r.mailboxAddress || "없음"}`,
        );
      });

      const targetRequest = data.data.requests.find(
        (r) => r.requestId === "20260401-USUACVDY",
      );
      if (targetRequest) {
        console.log("\n✅ 20260401-USUACVDY 발견!");
        console.log(JSON.stringify(targetRequest, null, 2));
      } else {
        console.log("\n❌ 20260401-USUACVDY 없음");
      }
    } else {
      console.log("\n❌ 의뢰가 없습니다");
    }

    // 2. 전체 의뢰 조회 (필터 없이)
    console.log("\n\n=== 2. 전체 의뢰 조회 (필터 없이) ===");
    const url2 = new URL("/api/requests/all", baseUrl);
    url2.searchParams.set("page", "1");
    url2.searchParams.set("limit", "50");

    const response2 = await fetch(url2.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response2.ok) {
      const data2 = await response2.json();
      console.log(`총 의뢰 수: ${data2.data?.requests?.length || 0}`);

      const targetRequest2 = data2.data?.requests?.find(
        (r) => r.requestId === "20260401-USUACVDY",
      );
      if (targetRequest2) {
        console.log("\n✅ 20260401-USUACVDY 발견!");
        console.log(
          `manufacturerStage: ${targetRequest2.manufacturerStage}`,
        );
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  }
}

testApiResponse();
