/**
 * ParseLog 컨트롤러 (ESM 스타일)
 * 파일명 파싱 로그 저장, 조회, 분석
 */

import ParseLog from "../../models/parseLog.model.js";
import FilenameRule from "../../models/filenameRule.model.js";

/**
 * 파싱 로그 저장
 * POST /api/parse-logs
 */
export const createParseLog = async (req, res) => {
  try {
    const { filename, parsed, userInput, matchedRuleId, draftId } = req.body;

    const userId = req.user?._id;

    // 일치 여부 판단
    const isCorrect =
      (parsed?.clinicName || "") === (userInput?.clinicName || "") &&
      (parsed?.patientName || "") === (userInput?.patientName || "") &&
      (parsed?.tooth || "") === (userInput?.tooth || "");

    // 일치하지 않는 필드 찾기
    const mismatchedFields = [];
    if ((parsed?.clinicName || "") !== (userInput?.clinicName || "")) {
      mismatchedFields.push("clinicName");
    }
    if ((parsed?.patientName || "") !== (userInput?.patientName || "")) {
      mismatchedFields.push("patientName");
    }
    if ((parsed?.tooth || "") !== (userInput?.tooth || "")) {
      mismatchedFields.push("tooth");
    }

    const log = new ParseLog({
      filename,
      parsed,
      userInput,
      isCorrect,
      mismatchedFields,
      matchedRuleId,
      userId,
      draftId,
    });

    await log.save();

    // 룰 사용 통계 업데이트
    if (matchedRuleId) {
      await FilenameRule.findOneAndUpdate(
        { ruleId: matchedRuleId },
        {
          $inc: {
            usageCount: 1,
            ...(isCorrect && { correctCount: 1 }),
          },
        }
      );
    }

    res.status(201).json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error("[parseLog.createParseLog] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 틀린 로그 조회
 * GET /api/parse-logs/incorrect
 * Query: limit=50, skip=0, userId=..., startDate=..., endDate=...
 */
export const getIncorrectLogs = async (req, res) => {
  try {
    const { limit = 50, skip = 0, userId, startDate, endDate } = req.query;

    const filter = { isCorrect: false };

    if (userId) {
      filter.userId = userId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const logs = await ParseLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await ParseLog.countDocuments(filter);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[parseLog.getIncorrectLogs] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 자주 틀리는 패턴 분석
 * GET /api/parse-logs/analysis/mismatches
 */
export const analyzeMismatches = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = { isCorrect: false };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // 필드별 오류 횟수 집계
    const mismatchAnalysis = await ParseLog.aggregate([
      { $match: filter },
      { $unwind: "$mismatchedFields" },
      {
        $group: {
          _id: "$mismatchedFields",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // 파일명 패턴별 오류 분석
    const patternAnalysis = await ParseLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$filename",
          count: { $sum: 1 },
          fields: { $push: "$mismatchedFields" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      success: true,
      data: {
        fieldMismatches: mismatchAnalysis,
        patternMismatches: patternAnalysis,
      },
    });
  } catch (error) {
    console.error("[parseLog.analyzeMismatches] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 로그 통계
 * GET /api/parse-logs/stats
 */
export const getStatistics = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const filter = {};

    if (userId) {
      filter.userId = userId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await ParseLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          correctLogs: {
            $sum: { $cond: ["$isCorrect", 1, 0] },
          },
          incorrectLogs: {
            $sum: { $cond: ["$isCorrect", 0, 1] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalLogs: 1,
          correctLogs: 1,
          incorrectLogs: 1,
          correctRate: {
            $cond: [
              { $gt: ["$totalLogs", 0] },
              {
                $multiply: [{ $divide: ["$correctLogs", "$totalLogs"] }, 100],
              },
              0,
            ],
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalLogs: 0,
        correctLogs: 0,
        incorrectLogs: 0,
        correctRate: 0,
      },
    });
  } catch (error) {
    console.error("[parseLog.getStatistics] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 로그 내보내기 (JSON)
 * GET /api/parse-logs/export/json
 */
export const exportLogsAsJSON = async (req, res) => {
  try {
    const { startDate, endDate, isCorrect } = req.query;

    const filter = {};

    if (isCorrect !== undefined) {
      filter.isCorrect = isCorrect === "true";
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const logs = await ParseLog.find(filter).lean();

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="parse-logs-${Date.now()}.json"`
    );
    res.send(JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("[parseLog.exportLogsAsJSON] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 로그 내보내기 (CSV)
 * GET /api/parse-logs/export/csv
 */
export const exportLogsAsCSV = async (req, res) => {
  try {
    const { startDate, endDate, isCorrect } = req.query;

    const filter = {};

    if (isCorrect !== undefined) {
      filter.isCorrect = isCorrect === "true";
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const logs = await ParseLog.find(filter).lean();

    const headers = [
      "filename",
      "parsed_clinic",
      "parsed_patient",
      "parsed_tooth",
      "user_clinic",
      "user_patient",
      "user_tooth",
      "is_correct",
      "mismatched_fields",
      "created_at",
    ];

    const rows = logs.map((log) => [
      log.filename,
      log.parsed?.clinicName || "",
      log.parsed?.patientName || "",
      log.parsed?.tooth || "",
      log.userInput?.clinicName || "",
      log.userInput?.patientName || "",
      log.userInput?.tooth || "",
      log.isCorrect ? "true" : "false",
      log.mismatchedFields?.join("|") || "",
      log.createdAt,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="parse-logs-${Date.now()}.csv"`
    );
    res.send(csvContent);
  } catch (error) {
    console.error("[parseLog.exportLogsAsCSV] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
