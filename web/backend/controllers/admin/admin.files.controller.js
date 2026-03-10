import File from "../../models/file.model.js";

export async function getAllFiles(req, res) {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자 권한이 필요합니다.",
      });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.fileType) filter.fileType = req.query.fileType;
    if (req.query.uploadedBy) filter.uploadedBy = req.query.uploadedBy;
    if (req.query.requestId) filter.relatedRequest = req.query.requestId;
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1;
    }
    const files = await File.find(filter)
      .populate("uploadedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limit);
    const total = await File.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: {
        files,
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
      message: "파일 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
