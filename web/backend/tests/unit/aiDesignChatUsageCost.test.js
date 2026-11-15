import { quoteAiDesignChatUsage } from "../../services/aiDesignChatUsageCost.js";

describe("quoteAiDesignChatUsage", () => {
  test("입력·출력·생각 토큰을 유료 단가로 원화에 남긴다", () => {
    const quote = quoteAiDesignChatUsage({
      promptTokenCount: 1_000_000,
      candidatesTokenCount: 1_000_000,
      thoughtsTokenCount: 0,
      totalTokenCount: 2_000_000,
    });
    expect(quote.inputTokens).toBe(1_000_000);
    expect(quote.outputTokens).toBe(1_000_000);
    expect(quote.totalTokens).toBe(2_000_000);
    // $0.30 + $2.50 = $2.80 → 2,800,000 micros → 2.8 * 1332 = 3,729.6원
    expect(quote.costUsdMicros).toBe(2_800_000);
    expect(quote.costKrw).toBe(3730);
    expect(quote.fxKrwPerUsd).toBe(1332);
  });

  test("total에 이미 포함된 생각 토큰은 출력에 한 번만 넣는다", () => {
    const quote = quoteAiDesignChatUsage({
      promptTokenCount: 1000,
      candidatesTokenCount: 400,
      thoughtsTokenCount: 400,
      totalTokenCount: 1400,
    });
    expect(quote.outputTokens).toBe(400);
    expect(quote.totalTokens).toBe(1400);
  });

  test("생각이 total 밖에 있으면 출력 단가에 더한다", () => {
    const quote = quoteAiDesignChatUsage({
      promptTokenCount: 1000,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 50,
      totalTokenCount: 1250,
    });
    expect(quote.outputTokens).toBe(250);
    expect(quote.thoughtsTokens).toBe(50);
  });
});
