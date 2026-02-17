import PopbillQueue from "../../models/popbillQueue.model.js";

export async function adminGetQueueStats(req, res) {
  try {
    const stats = await PopbillQueue.aggregate([
      {
        $group: {
          _id: { taskType: "$taskType", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    for (const s of stats) {
      const taskType = s._id.taskType;
      const status = s._id.status;
      if (!result[taskType]) result[taskType] = {};
      result[taskType][status] = s.count;
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "큐 통계 조회 실패",
      error: error.message,
    });
  }
}

export async function adminListQueueTasks(req, res) {
  try {
    const { taskType, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (taskType) query.taskType = taskType;
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const tasks = await PopbillQueue.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await PopbillQueue.countDocuments(query);

    return res.json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "큐 태스크 목록 조회 실패",
      error: error.message,
    });
  }
}

export async function adminGetQueueTask(req, res) {
  try {
    const { id } = req.params;
    const task = await PopbillQueue.findById(id).lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "태스크를 찾을 수 없습니다.",
      });
    }

    return res.json({ success: true, data: task });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "태스크 조회 실패",
      error: error.message,
    });
  }
}

export async function adminRetryQueueTask(req, res) {
  try {
    const { id } = req.params;
    const task = await PopbillQueue.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "태스크를 찾을 수 없습니다.",
      });
    }

    if (task.status !== "FAILED") {
      return res.status(400).json({
        success: false,
        message: "FAILED 상태의 태스크만 재시도할 수 있습니다.",
      });
    }

    await PopbillQueue.updateOne(
      { _id: id },
      {
        $set: {
          status: "PENDING",
          scheduledFor: new Date(),
          error: null,
          lockedBy: null,
          lockedUntil: null,
        },
      }
    );

    return res.json({
      success: true,
      message: "태스크가 재시도 대기열에 추가되었습니다.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "태스크 재시도 실패",
      error: error.message,
    });
  }
}

export async function adminCancelQueueTask(req, res) {
  try {
    const { id } = req.params;
    const task = await PopbillQueue.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "태스크를 찾을 수 없습니다.",
      });
    }

    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "이미 완료되었거나 취소된 태스크입니다.",
      });
    }

    await PopbillQueue.updateOne(
      { _id: id },
      {
        $set: {
          status: "CANCELLED",
          lockedBy: null,
          lockedUntil: null,
        },
      }
    );

    return res.json({
      success: true,
      message: "태스크가 취소되었습니다.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "태스크 취소 실패",
      error: error.message,
    });
  }
}

export default {
  adminGetQueueStats,
  adminListQueueTasks,
  adminGetQueueTask,
  adminRetryQueueTask,
  adminCancelQueueTask,
};
