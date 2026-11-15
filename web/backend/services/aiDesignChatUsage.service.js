// 커스텀어벗 AI 디자인 대화 사용량. 응답을 보낸 뒤에 기록하고, 관리자 대시보드는 의뢰 치과별로 합친다.
// related files:
// - web/backend/models/aiDesignChatUsage.model.js
// - web/backend/services/aiDesignChatUsageCost.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/backend/controllers/admin/admin.aiDesignChatUsage.controller.js
import { Types } from "mongoose";
import AiDesignChatUsage from "../models/aiDesignChatUsage.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  AI_DESIGN_CHAT_FX_KRW_PER_USD,
  krwFromUsdMicros,
  quoteAiDesignChatUsage,
} from "./aiDesignChatUsageCost.js";

const ACCOUNT_LIMIT = 100;

export async function recordAiDesignChatUsage(input) {
  const quoted = Number.isFinite(Number(input?.costUsdMicros));
  const quote = quoted ? input : quoteAiDesignChatUsage(input);
  if (quote.totalTokens <= 0 && quote.costUsdMicros <= 0) return null;
  const anchorRaw = String(input?.practiceBusinessAnchorId || "").trim();
  const anchorId = Types.ObjectId.isValid(anchorRaw) ? anchorRaw : null;
  let practiceName = String(input?.practiceName || "").trim();
  if (anchorId && !practiceName) {
    const anchor = await BusinessAnchor.findById(anchorId).select({ name: 1 }).lean();
    practiceName = String(anchor?.name || "").trim();
  }
  const userRaw = String(input?.userId || "").trim();
  return AiDesignChatUsage.create({
    practiceBusinessAnchorId: anchorId,
    practiceName,
    userId: Types.ObjectId.isValid(userRaw) ? userRaw : null,
    transferId: String(input?.transferId || "").trim().slice(0, 80),
    model: String(input?.model || "").trim(),
    inputTokens: quote.inputTokens,
    cachedTokens: quote.cachedTokens,
    outputTokens: quote.outputTokens,
    thoughtsTokens: quote.thoughtsTokens,
    totalTokens: quote.totalTokens,
    costUsdMicros: quote.costUsdMicros,
    costKrw: quote.costKrw,
    fxKrwPerUsd: quote.fxKrwPerUsd,
  });
}

export async function listAiDesignChatUsageByPractice() {
  const grouped = await AiDesignChatUsage.aggregate([
    {
      $group: {
        _id: "$practiceBusinessAnchorId",
        practiceName: { $last: "$practiceName" },
        calls: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        totalTokens: { $sum: "$totalTokens" },
        costUsdMicros: { $sum: "$costUsdMicros" },
      },
    },
    { $sort: { costUsdMicros: -1, totalTokens: -1 } },
    { $limit: ACCOUNT_LIMIT },
  ]);

  const ids = grouped.map((row) => row._id).filter((id) => id);
  const anchors = ids.length
    ? await BusinessAnchor.find({ _id: { $in: ids } })
        .select({ name: 1 })
        .lean()
    : [];
  const nameById = new Map(anchors.map((row) => [String(row._id), String(row.name || "").trim()]));

  const accounts = grouped.map((row) => {
    const anchorId = row._id ? String(row._id) : "";
    return {
      anchorId,
      name: nameById.get(anchorId) || String(row.practiceName || "").trim() || "계정 없음",
      calls: Number(row.calls) || 0,
      inputTokens: Number(row.inputTokens) || 0,
      outputTokens: Number(row.outputTokens) || 0,
      totalTokens: Number(row.totalTokens) || 0,
      costKrw: krwFromUsdMicros(row.costUsdMicros),
    };
  });

  const totals = {
    calls: accounts.reduce((sum, row) => sum + row.calls, 0),
    totalTokens: accounts.reduce((sum, row) => sum + row.totalTokens, 0),
    costKrw: krwFromUsdMicros(
      grouped.reduce((sum, row) => sum + (Number(row.costUsdMicros) || 0), 0),
    ),
    accounts: accounts.length,
  };

  return {
    fxKrwPerUsd: AI_DESIGN_CHAT_FX_KRW_PER_USD,
    totals,
    accounts,
  };
}
