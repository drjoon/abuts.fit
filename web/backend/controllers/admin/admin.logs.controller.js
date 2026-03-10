import { Types } from "mongoose";
import ActivityLog from "../../models/activityLog.model.js";

export async function getSystemLogs(req, res) {
  try {
    res.status(200).json({
      success: true,
      message: "시스템 로그 조회 기능은 아직 구현되지 않았습니다.",
      data: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getActivityLogs(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.userId) {
      if (!Types.ObjectId.isValid(req.query.userId)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
      }
      filter.user = new Types.ObjectId(req.query.userId);
    }
    if (req.query.action) filter.action = req.query.action;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await ActivityLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "활동 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
      stack: error.stack,
    });
  }
}

export async function getSecurityLogs(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.userId) {
      if (!Types.ObjectId.isValid(req.query.userId)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
      }
      filter.userId = new Types.ObjectId(req.query.userId);
    }
    if (req.query.action) filter.action = req.query.action;

    const logsRaw = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const logs = logsRaw.map((log) => {
      const severity =
        log.severity ||
        (log.details && typeof log.details.severity === "string"
          ? log.details.severity
          : "info");
      const status =
        log.status ||
        (log.details && typeof log.details.status === "string"
          ? log.details.status
          : "info");
      return { ...log, severity, status };
    });
    const total = await ActivityLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
