import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function parseFilenames(req, res) {
  try {
    const { filenames } = req.body || {};

    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({
        success: false,
        message: "filenames 배열이 필요합니다.",
      });
    }

    if (!genAI) {
      // Gemini 미구성 시에도 API는 살아 있으되, 단순히 기본 파싱만 수행
      const fallback = filenames.map((name) => ({
        filename: name,
        clinicName: null,
        patientName: null,
        teeth: [],
        workType: null,
        rawSummary: null,
      }));
      return res.json({ success: true, data: fallback, provider: "none" });
    }

    console.log("[AI] parseFilenames: start", { count: filenames.length });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    console.log("[AI] parseFilenames: model created");

    const example =
      "예시 파일명: 20251119고운치과_김혜영_32-42_4.stl\n" +
      "이 예시의 해석:\n" +
      "- clinicName: 고운치과\n" +
      "- patientName: 김혜영\n" +
      '- teeth: ["32", "42"] (FDI 방식 치식 번호 배열)\n' +
      "- workType: null (파일명에 어벗/크라운/브리지 등 명시가 없는 경우 null)\n" +
      "- rawSummary: '2025-11-19에 스캔한 고운치과 김혜영 환자 하악 전치부(32-42) 커스텀 어벗먼트 또는 크라운 디자인 파일로 추정' 같은 자연어 설명";

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
      '    "teeth": string[],               // FDI 또는 Palmer 표기 치식 번호들. 없으면 빈 배열\n' +
      '    "workType": string | null,       // abutment/crown/bridge 등 작업 타입, 모르면 null\n' +
      '    "rawSummary": string | null      // 사람이 읽기 쉬운 한국어 한 줄 요약, 모르면 null\n' +
      "  }\n" +
      "]\n" +
      "\n" +
      "주의사항:\n" +
      "- 반드시 JSON만 반환하고, 설명 문장은 JSON 바깥에 쓰지 마.\n" +
      '- teeth는 문자열 배열로만. 예: ["26", "27"].\n' +
      "- workType는 가능하면 'abutment', 'crown', 'bridge' 중 하나로 맞추고, 애매하면 null.\n" +
      "- clinicName은 파일명에 '치과', 'dental', '치과의원' 등 패턴이 있으면 그 부분을 기준으로 추론해줘. 없으면 null.\n" +
      "- 파일명에 날짜(예: 20251119)가 포함되어 있으면, rawSummary에서 자연스럽게 언급해도 좋지만, 날짜 자체를 별도 필드로 만들지는 마.\n" +
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
      if (firstNewline !== -1 && lastFence !== -1 && lastFence > firstNewline) {
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
      return res.status(500).json({
        success: false,
        message: "Gemini 응답(JSON 파싱)에 실패했습니다.",
        raw: text,
      });
    }

    if (!Array.isArray(parsed)) {
      console.error("[AI] parseFilenames: parsed is not array", parsed);
      return res.status(500).json({
        success: false,
        message: "Gemini 응답 형식이 배열이 아닙니다.",
        raw: parsed,
      });
    }

    console.log("[AI] parseFilenames: success", { items: parsed.length });

    return res.json({ success: true, data: parsed, provider: "gemini" });
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
