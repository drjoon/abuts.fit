/**
 * FilenameRule 컨트롤러 (ESM 스타일)
 * 파일명 파싱 룰 테이블 관리
 */

import FilenameRule from "../../models/filenameRule.model.js";

/**
 * 활성 룰 목록 조회
 * GET /api/filename-rules
 */
export const getActiveRules = async (req, res) => {
  try {
    const rules = await FilenameRule.find({ isActive: true })
      .sort({ confidence: -1, createdAt: -1 })
      .lean();

    // MongoDB의 _id를 id로 매핑 (프론트엔드 호환성)
    const mappedRules = rules.map((rule) => ({
      ...rule,
      id: rule._id?.toString() || rule.ruleId,
    }));

    res.json({
      success: true,
      data: mappedRules,
    });
  } catch (error) {
    console.error("[filenameRule.getActiveRules] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 모든 룰 조회 (관리자용)
 * GET /api/filename-rules/all
 */
export const getAllRules = async (req, res) => {
  try {
    const { source, isActive } = req.query;

    const filter = {};
    if (source) {
      filter.source = source;
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const rules = await FilenameRule.find(filter)
      .sort({ confidence: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error("[filenameRule.getAllRules] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 룰 생성
 * POST /api/filename-rules
 */
export const createRule = async (req, res) => {
  try {
    const {
      ruleId,
      description,
      pattern,
      extraction,
      confidence,
      source,
      aiModel,
      aiConfidenceScore,
    } = req.body;

    // 중복 체크
    const existing = await FilenameRule.findOne({ ruleId });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Rule ID already exists",
      });
    }

    const rule = new FilenameRule({
      ruleId,
      description,
      pattern,
      extraction,
      confidence,
      source,
      aiModel,
      aiConfidenceScore,
    });

    await rule.save();

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error("[filenameRule.createRule] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 룰 업데이트
 * PUT /api/filename-rules/:ruleId
 */
export const updateRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    // updatedAt 자동 갱신
    updates.updatedAt = new Date();

    const rule = await FilenameRule.findOneAndUpdate({ ruleId }, updates, {
      new: true,
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: "Rule not found",
      });
    }

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error("[filenameRule.updateRule] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 룰 활성화/비활성화
 * PATCH /api/filename-rules/:ruleId/toggle
 */
export const toggleRuleActive = async (req, res) => {
  try {
    const { ruleId } = req.params;

    const rule = await FilenameRule.findOne({ ruleId });
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: "Rule not found",
      });
    }

    rule.isActive = !rule.isActive;
    rule.updatedAt = new Date();
    await rule.save();

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error("[filenameRule.toggleRuleActive] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 룰 삭제
 * DELETE /api/filename-rules/:ruleId
 */
export const deleteRule = async (req, res) => {
  try {
    const { ruleId } = req.params;

    const rule = await FilenameRule.findOneAndDelete({ ruleId });

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: "Rule not found",
      });
    }

    res.json({
      success: true,
      message: "Rule deleted",
      data: rule,
    });
  } catch (error) {
    console.error("[filenameRule.deleteRule] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 룰 통계
 * GET /api/filename-rules/stats
 */
export const getRuleStatistics = async (req, res) => {
  try {
    const stats = await FilenameRule.aggregate([
      {
        $group: {
          _id: null,
          totalRules: { $sum: 1 },
          activeRules: {
            $sum: { $cond: ["$isActive", 1, 0] },
          },
          totalUsage: { $sum: "$usageCount" },
          avgAccuracy: { $avg: "$accuracy" },
        },
      },
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalRules: 0,
        activeRules: 0,
        totalUsage: 0,
        avgAccuracy: 0,
      },
    });
  } catch (error) {
    console.error("[filenameRule.getRuleStatistics] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 룰 정확도 업데이트
 * PATCH /api/filename-rules/:ruleId/accuracy
 */
export const updateRuleAccuracy = async (req, res) => {
  try {
    const { ruleId } = req.params;

    const rule = await FilenameRule.findOne({ ruleId });
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: "Rule not found",
      });
    }

    // 정확도 계산
    const accuracy =
      rule.usageCount > 0 ? (rule.correctCount / rule.usageCount) * 100 : 0;

    rule.accuracy = accuracy;
    rule.updatedAt = new Date();
    await rule.save();

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error("[filenameRule.updateRuleAccuracy] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * 여러 룰 일괄 생성/업데이트
 * POST /api/filename-rules/batch
 */
export const batchUpsertRules = async (req, res) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({
        success: false,
        error: "rules must be an array",
      });
    }

    const results = [];

    for (const rule of rules) {
      const { ruleId, ...updates } = rule;
      updates.updatedAt = new Date();

      const result = await FilenameRule.findOneAndUpdate(
        { ruleId },
        { ...rule, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      results.push(result);
    }

    res.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error("[filenameRule.batchUpsertRules] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
