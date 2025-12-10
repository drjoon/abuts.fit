import { GoogleGenerativeAI } from "@google/generative-ai";
import { shouldBlockExternalCall } from "../utils/rateGuard.js";

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.warn(
    "[AI] GOOGLE_API_KEY is not set. Gemini filename parsing will be disabled."
  );
}

let genAI = null;
if (apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
  } catch (e) {
    console.warn(
      "[AI] Failed to initialize GoogleGenerativeAI:",
      e?.message || e
    );
  }
}

const buildFallbackFromFilenames = (filenames) =>
  filenames.map((name) => ({
    filename: name,
    clinicName: null,
    patientName: null,
    tooth: "",
  }));

export async function parseFilenames(req, res) {
  try {
    const { filenames } = req.body || {};

    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({
        success: false,
        message: "filenames 배열이 필요합니다.",
      });
    }

    // Gemini 호출에 대한 백엔드 레벨 rate guard
    const clientIp =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      (req.connection && req.connection.remoteAddress) ||
      "unknown";
    const guardKey = `gemini-parseFilenames:${clientIp}`;
    const { blocked, count } = shouldBlockExternalCall(guardKey);
    if (blocked) {
      console.error("[AI] parseFilenames: rate guard blocked", {
        clientIp,
        count,
      });
      return res.status(429).json({
        success: false,
        message:
          "Gemini 외부 API가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    if (!genAI) {
      // Gemini 미구성 시에도 API는 살아 있으되, 단순히 기본 파싱만 수행
      const fallback = buildFallbackFromFilenames(filenames);
      return res.json({ success: true, data: fallback, provider: "none" });
    }

    try {
      console.log("[AI] parseFilenames: start", { count: filenames.length });

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });
      console.log("[AI] parseFilenames: model created");

      const example =
        "예시 파일명: 20251119고운치과_김혜영_32-42_4.stl\n" +
        "이 예시의 해석:\n" +
        "- clinicName: 고운치과\n" +
        "- patientName: 김혜영\n" +
        "- tooth: '32-42' (FDI 방식 치식 번호들을 사람이 읽기 쉬운 문자열로 표현)";

      const prompt =
        "너는 치과 기공소에서 사용하는 STL 파일명을 해석하는 도우미야.\n" +
        "입력으로 STL 파일명 목록을 줄 테니, 각 파일명에 대해 다음 정보를 JSON으로만 반환해줘.\n" +
        "\n" +
        "반환 형식(JSON 배열):\n" +
        "[\n" +
        "  {\n" +
        '    "filename": string,               // 원본 파일명 그대로\n' +
        '    "clinicName": string | null,     // 치과/의원 이름(추정). 없으면 null\n' +
        '    "patientName": string | null,    // 환자 이름(추정). 없으면 null\n' +
        '    "tooth": string | null           // 예: "32", "32-42" 등 치식 정보를 나타내는 문자열, 없으면 null\n' +
        "  }\n" +
        "]\n" +
        "\n" +
        "주의사항:\n" +
        "- 반드시 JSON만 반환하고, 설명 문장은 JSON 바깥에 쓰지 마.\n" +
        "- tooth는 치식 정보를 사람이 읽기 쉬운 한 줄 문자열로만 표현해줘. 예: '26', '26-27', '13,23'.\n" +
        "- clinicName은 파일명에 '치과', 'dental', '치과의원' 등 패턴이 있으면 그 부분을 기준으로 추론해줘. 없으면 null.\n" +
        "\n" +
        example +
        "\n\n" +
        "이제 아래 filenames 배열을 해석해줘.\n" +
        JSON.stringify({ filenames });

      console.log("[AI] parseFilenames: calling generateContent");
      const result = await model.generateContent(prompt);
      console.log("[AI] parseFilenames: generateContent done");

      const text = result.response.text();
      console.log("[AI] parseFilenames: raw response text", text);

      // Gemini가 종종 ```json ... ``` 코드블록으로 응답하는 경우를 대비해
      // 코드블록 마커를 제거한 순수 JSON 문자열로 정규화한다.
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        const firstNewline = cleaned.indexOf("\n");
        const lastFence = cleaned.lastIndexOf("```");
        if (
          firstNewline !== -1 &&
          lastFence !== -1 &&
          lastFence > firstNewline
        ) {
          cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
        }
      }
      console.log("[AI] parseFilenames: cleaned JSON text", cleaned);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
        console.log("[AI] parseFilenames: JSON.parse success");
      } catch (e) {
        console.error("[AI] parseFilenames: JSON.parse error", e);
        const fallback = buildFallbackFromFilenames(filenames);
        return res.json({
          success: true,
          data: fallback,
          provider: "fallback-json-parse-error",
        });
      }

      if (!Array.isArray(parsed)) {
        console.error("[AI] parseFilenames: parsed is not array", parsed);
        const fallback = buildFallbackFromFilenames(filenames);
        return res.json({
          success: true,
          data: fallback,
          provider: "fallback-non-array",
        });
      }

      console.log("[AI] parseFilenames: success", { items: parsed.length });

      return res.json({ success: true, data: parsed, provider: "gemini" });
    } catch (error) {
      console.error(
        "[AI] parseFilenames: gemini call failed, fallback to basic",
        error
      );

      const fallback = buildFallbackFromFilenames(filenames);

      if (error && typeof error === "object" && error.status === 429) {
        const resetTimeKst = "17:00";

        return res.json({
          success: true,
          data: fallback,
          provider: "fallback-quota-exceeded",
          quota: {
            type: "daily",
            status: "exhausted",
            message: `오늘 Gemini 무료 쿼터가 소진되었습니다. 내일 ${resetTimeKst} 이후에 다시 시도해주세요.`,
            resetTimeKst,
          },
        });
      }

      return res.json({
        success: true,
        data: fallback,
        provider: "fallback-external-error",
      });
    }
  } catch (error) {
    console.error("[AI] parseFilenames error (outer catch)", error);
    return res.status(500).json({
      success: false,
      message: "파일명 해석 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default { parseFilenames };
