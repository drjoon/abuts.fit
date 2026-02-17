import Connection from "../../models/connection.model.js";
import Request from "../../models/request.model.js";

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

    // 서버 전체 커넥션 기준 최신 업데이트 시각 계산 (serverUpdatedAt)
    const serverUpdatedAt = all.reduce((max, c) => {
      const updated = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return updated > max ? updated : max;
    }, 0);

    res.json({
      success: true,
      data: sorted,
      serverUpdatedAt: serverUpdatedAt || null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "커넥션 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 직경으로 가장 근사한 커넥션 찾기
// GET /api/connections/find-by-diameter?diameter=3.3
export async function findConnectionByDiameter(req, res) {
  try {
    const { diameter } = req.query;
    if (!diameter) {
      return res
        .status(400)
        .json({ success: false, message: "Diameter is required" });
    }

    const targetDiameter = parseFloat(diameter);

    // 모든 활성 커넥션 조회
    const connections = await Connection.find({ isActive: true }).lean();

    if (!connections.length) {
      return res
        .status(404)
        .json({ success: false, message: "No active connections found" });
    }

    // 가장 가까운 커넥션 찾기
    let closestConnection = null;
    let minDiff = Infinity;

    for (const conn of connections) {
      if (conn.diameter == null) continue;
      const diff = Math.abs(conn.diameter - targetDiameter);
      if (diff < minDiff) {
        minDiff = diff;
        closestConnection = conn;
      }
    }

    if (closestConnection) {
      res.json({ success: true, data: closestConnection });
    } else {
      res
        .status(404)
        .json({ success: false, message: "No suitable connection found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error finding connection by diameter",
      error: error.message,
    });
  }
}

export default { getConnections, findConnectionByDiameter };
