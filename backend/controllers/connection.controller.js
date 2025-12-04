import Connection from "../models/connection.model.js";
import Request from "../models/request.model.js";

// 활성화된(한화 등) 커넥션 목록 조회
// GET /api/connections
export async function getConnections(req, res) {
  try {
    // 활성 커넥션 전체 조회 (카테고리 제한 제거)
    const baseFilter = { isActive: true };

    const all = await Connection.find(baseFilter).lean();

    // 사용자별 사용량 계산
    const usage = req.user
      ? await Request.aggregate([
          { $match: { requestor: req.user._id, connection: { $ne: null } } },
          { $group: { _id: "$connection", count: { $sum: 1 } } },
        ])
      : [];

    const usageMap = new Map(usage.map((u) => [u._id.toString(), u.count]));

    const sorted = all
      .map((c) => ({
        ...c,
        usageCount: usageMap.get(c._id.toString()) || 0,
      }))
      .sort((a, b) => {
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        if (a.manufacturer !== b.manufacturer)
          return a.manufacturer.localeCompare(b.manufacturer);
        if (a.system !== b.system) return a.system.localeCompare(b.system);
        return a.type.localeCompare(b.type);
      });

    res.json({ success: true, data: sorted });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "커넥션 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default { getConnections };
