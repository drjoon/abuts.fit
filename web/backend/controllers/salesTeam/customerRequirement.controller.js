// related files:
// - web/backend/models/sales/customerRequirement.model.js
// - web/backend/modules/salesTeam/salesTeam.routes.js
import { Types } from "mongoose";
import CustomerRequirement, {
  CUSTOMER_REQUIREMENT_TARGET_ROLES,
} from "../../models/sales/customerRequirement.model.js";

const TARGET_SET = new Set(CUSTOMER_REQUIREMENT_TARGET_ROLES);
const DOC_STATUSES = new Set(["open", "inProgress", "done", "canceled"]);
const WORK_STATUSES = new Set(["todo", "inProgress", "done"]);

function oid(value) {
  const s = String(value || "").trim();
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

function normalizeTargetRoles(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    const role = String(item || "").trim();
    if (TARGET_SET.has(role) && !out.includes(role)) out.push(role);
  }
  return out;
}

function canManageAll(role) {
  return role === "salesTeam" || role === "admin";
}

function visibilityFilter(user) {
  const role = String(user?.role || "").trim();
  if (canManageAll(role)) return {};
  if (TARGET_SET.has(role)) return { targetRoles: role };
  return { _id: null };
}

export async function listCustomerRequirements(req, res) {
  try {
    const role = String(req.user.role || "").trim();
    if (!canManageAll(role) && !TARGET_SET.has(role)) {
      return res.status(403).json({
        success: false,
        message: "권한이 없습니다.",
      });
    }

    const status = String(req.query.status || "").trim();
    const filter = { ...visibilityFilter(req.user) };
    if (DOC_STATUSES.has(status)) filter.status = status;

    const items = await CustomerRequirement.find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    return res.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[customerRequirement.list]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "요구사항 목록 조회에 실패했습니다.",
    });
  }
}

export async function getCustomerRequirement(req, res) {
  try {
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const item = await CustomerRequirement.findOne({
      _id: id,
      ...visibilityFilter(req.user),
    }).lean();
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "요구사항을 찾을 수 없습니다.",
      });
    }
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error("[customerRequirement.get]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "요구사항 조회에 실패했습니다.",
    });
  }
}

export async function createCustomerRequirement(req, res) {
  try {
    const role = String(req.user.role || "").trim();
    if (!canManageAll(role)) {
      return res.status(403).json({
        success: false,
        message: "영업본부 또는 관리자만 등록할 수 있습니다.",
      });
    }

    const body = req.body || {};
    const title = String(body.title || "").trim();
    const targetRoles = normalizeTargetRoles(body.targetRoles);
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "제목은 필수입니다.",
      });
    }
    if (targetRoles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "대상을 하나 이상 선택하세요.",
      });
    }

    const doc = await CustomerRequirement.create({
      title,
      body: String(body.body || "").trim(),
      customerName: String(body.customerName || "").trim(),
      accountId: oid(body.accountId),
      targetRoles,
      status: "open",
      createdByUserId: req.user._id,
      createdByName: String(req.user.name || "").trim(),
      workUpdates: [],
    });

    return res.status(201).json({ success: true, data: doc.toObject() });
  } catch (error) {
    console.error("[customerRequirement.create]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "요구사항 등록에 실패했습니다.",
    });
  }
}

export async function updateCustomerRequirement(req, res) {
  try {
    const role = String(req.user.role || "").trim();
    if (!canManageAll(role)) {
      return res.status(403).json({
        success: false,
        message: "영업본부 또는 관리자만 수정할 수 있습니다.",
      });
    }

    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }

    const existing = await CustomerRequirement.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "요구사항을 찾을 수 없습니다.",
      });
    }

    const body = req.body || {};
    if (body.title != null) {
      const title = String(body.title).trim();
      if (!title) {
        return res.status(400).json({ success: false, message: "제목은 필수입니다." });
      }
      existing.title = title;
    }
    if (body.body != null) existing.body = String(body.body).trim();
    if (body.customerName != null) {
      existing.customerName = String(body.customerName).trim();
    }
    if (body.accountId !== undefined) {
      existing.accountId = oid(body.accountId);
    }
    if (body.targetRoles != null) {
      const targetRoles = normalizeTargetRoles(body.targetRoles);
      if (targetRoles.length === 0) {
        return res.status(400).json({
          success: false,
          message: "대상을 하나 이상 선택하세요.",
        });
      }
      existing.targetRoles = targetRoles;
    }
    if (body.status != null) {
      const status = String(body.status).trim();
      if (!DOC_STATUSES.has(status)) {
        return res.status(400).json({ success: false, message: "상태가 올바르지 않습니다." });
      }
      existing.status = status;
    }

    await existing.save();
    return res.json({ success: true, data: existing.toObject() });
  } catch (error) {
    console.error("[customerRequirement.update]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "요구사항 수정에 실패했습니다.",
    });
  }
}

/**
 * Target role users update their own work progress on a requirement.
 */
export async function upsertWorkUpdate(req, res) {
  try {
    const role = String(req.user.role || "").trim();
    if (!TARGET_SET.has(role)) {
      return res.status(403).json({
        success: false,
        message: "대상 역할만 업무 상태를 업데이트할 수 있습니다.",
      });
    }

    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }

    const existing = await CustomerRequirement.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "요구사항을 찾을 수 없습니다.",
      });
    }

    if (!existing.targetRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "이 요구사항의 대상이 아닙니다.",
      });
    }

    const body = req.body || {};
    const status = String(body.status || "inProgress").trim();
    if (!WORK_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        message: "업무 상태가 올바르지 않습니다.",
      });
    }
    const note = String(body.note || "").trim();
    const userId = req.user._id;
    const userName = String(req.user.name || "").trim();

    const idx = existing.workUpdates.findIndex(
      (w) =>
        String(w.role) === role && String(w.userId) === String(userId),
    );
    const entry = {
      role,
      userId,
      userName,
      status,
      note,
      updatedAt: new Date(),
    };
    if (idx >= 0) {
      existing.workUpdates[idx] = {
        ...existing.workUpdates[idx].toObject?.() || existing.workUpdates[idx],
        ...entry,
      };
    } else {
      existing.workUpdates.push(entry);
    }

    // Auto-bump document status when any work starts / all done for targeted roles
    if (existing.status === "open" && status !== "todo") {
      existing.status = "inProgress";
    }
    const targeted = existing.targetRoles;
    const latestByRole = new Map();
    for (const w of existing.workUpdates) {
      const prev = latestByRole.get(w.role);
      if (!prev || new Date(w.updatedAt) > new Date(prev.updatedAt)) {
        latestByRole.set(w.role, w);
      }
    }
    const allDone =
      targeted.length > 0 &&
      targeted.every((r) => latestByRole.get(r)?.status === "done");
    if (allDone && existing.status !== "canceled") {
      existing.status = "done";
    }

    await existing.save();
    return res.json({ success: true, data: existing.toObject() });
  } catch (error) {
    console.error("[customerRequirement.upsertWorkUpdate]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "업무 업데이트에 실패했습니다.",
    });
  }
}

export async function deleteCustomerRequirement(req, res) {
  try {
    const role = String(req.user.role || "").trim();
    if (!canManageAll(role)) {
      return res.status(403).json({
        success: false,
        message: "영업본부 또는 관리자만 삭제할 수 있습니다.",
      });
    }
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const result = await CustomerRequirement.deleteOne({ _id: id });
    if (!result.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "요구사항을 찾을 수 없습니다.",
      });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("[customerRequirement.delete]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "요구사항 삭제에 실패했습니다.",
    });
  }
}
