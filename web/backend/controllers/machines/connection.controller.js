import Connection from "../../models/connection.model.js";
import Request from "../../models/request.model.js";

function normalizeTypeLabel(type) {
  if (typeof type !== "string") return "";
  const t = type.trim();
  if (!t) return "";
  if (t.toLowerCase().includes("non")) return "Non-Hex";
  if (t.toLowerCase().includes("hex")) return "Hex";
  return t;
}

function getPrcTypeCode(system, type) {
  const sys = typeof system === "string" ? system.trim() : "";
  const t = normalizeTypeLabel(type);
  const isMini = sys.toLowerCase().includes("mini");
  const isNonHex = t === "Non-Hex";
  if (isMini) {
    return isNonHex ? "MN" : "MH";
  }
  return isNonHex ? "RN" : "RH";
}

function getManufacturerKor(manufacturer) {
  switch ((manufacturer || "").trim().toUpperCase()) {
    case "OSSTEM":
      return "오스템";
    case "DENTIUM":
      return "덴티움";
    case "DENTIS":
      return "덴티스";
    case "DIO":
      return "디오";
    case "MEGAGEN":
      return "메가젠";
    case "NEOBIOTECH":
      return "네오";
    default:
      return null;
  }
}

function getSystemCode(manufacturer, system) {
  const m = (manufacturer || "").trim().toUpperCase();
  const s = (system || "").trim();

  // 현재 CAM/ESPRIT 쪽 파일명 규칙(스프레드시트)과 UI 표기값을 연결
  // 여기서 매핑되지 않는 경우엔 DB의 fileName을 그대로 쓰도록 fallback한다.
  if (m === "OSSTEM") {
    if (s === "Regular") return "TS";
    if (s === "Mini") return "TS";
  }
  if (m === "DENTIUM") {
    if (s === "Regular") return "SuperLine";
    if (s === "Mini") return "SuperLine";
  }
  if (m === "DENTIS") {
    if (s === "Regular") return "SQ";
    if (s === "Mini") return "SQ";
  }
  if (m === "DIO") {
    if (s === "Regular") return "UF";
    if (s === "Mini") return "UF";
  }
  if (m === "MEGAGEN") {
    if (s === "AnyOne Regular") return "AnyOne";
    if (s === "AnyOne") return "AnyOne";
    if (s === "AnyRidge") return "AnyRidge";
  }
  if (m === "NEOBIOTECH") {
    if (s === "Regular") return "IS";
    if (s === "Mini") return "IS";
  }

  return null;
}

function buildPrcFileNames({ manufacturer, system, type, legacyFileName }) {
  const kor = getManufacturerKor(manufacturer);
  const sysCode = getSystemCode(manufacturer, system);
  const typeCode = getPrcTypeCode(system, type);

  if (!kor || !sysCode || !typeCode) {
    return {
      connectionPrcFileName:
        typeof legacyFileName === "string" ? legacyFileName : null,
      faceHolePrcFileName: null,
      prcTypeCode: typeCode || null,
      prcSystemCode: sysCode || null,
    };
  }

  return {
    connectionPrcFileName: `${kor}_${sysCode}_${typeCode}_Connection.prc`,
    faceHolePrcFileName: `${kor}_${sysCode}_${typeCode}_FaceHole.prc`,
    prcTypeCode: typeCode,
    prcSystemCode: sysCode,
  };
}

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
      .map((c) => {
        const computed = buildPrcFileNames({
          manufacturer: c.manufacturer,
          system: c.system,
          type: c.type,
          legacyFileName: c.fileName,
        });
        return {
          ...c,
          // UI / 저장은 manufacturer/system/type 그대로 사용
          // CAM/ESPRIT용 파일명만 별도 필드로 제공
          connectionPrcFileName: computed.connectionPrcFileName,
          faceHolePrcFileName: computed.faceHolePrcFileName,
          prcTypeCode: computed.prcTypeCode,
          prcSystemCode: computed.prcSystemCode,
          usageCount: usageMap.get(c._id.toString()) || 0,
        };
      })
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
