import CncToolTemplate from "../../models/cncToolTemplate.model.js";
import {
  CncMachine,
  getOrCreateCncMachine,
} from "./shared.js";
import { normalizeToolSlots } from "./tooling.js";

/**
 * 공구 템플릿 컨트롤러
 *
 * 슬롯 메타는 toolNum(필수) + toolName(선택)만 사용한다.
 * 적용 시 Merge upsert: 템플릿 슬롯만 장비 toolSlots에 upsert,
 * 기존 슬롯/통계/이력은 유지한다.
 */

const MAX_SLOTS_PER_TEMPLATE = 200;

function normalizeTemplateSlots(rawSlots) {
  const list = Array.isArray(rawSlots) ? rawSlots : [];
  const map = new Map();
  for (const item of list) {
    const tn = Math.floor(Number(item?.toolNum));
    if (!Number.isFinite(tn) || tn < 1) continue;
    const toolName = String(item?.toolName || "").trim().slice(0, 100);
    map.set(tn, { toolNum: tn, toolName });
  }
  return Array.from(map.values())
    .sort((a, b) => a.toolNum - b.toolNum)
    .slice(0, MAX_SLOTS_PER_TEMPLATE);
}

function userLabel(user) {
  if (!user) return "";
  return String(user.name || user.email || "").trim();
}

export async function listToolTemplates(req, res) {
  try {
    const docs = await CncToolTemplate.find({})
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: docs });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "조회 실패" });
  }
}

export async function createToolTemplate(req, res) {
  try {
    const { name, description, slots } = req.body || {};
    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: "name은 필수입니다." });
    }
    const normalized = normalizeTemplateSlots(slots);
    const doc = await CncToolTemplate.create({
      name: trimmedName.slice(0, 80),
      description: String(description || "").trim().slice(0, 300),
      slots: normalized,
      createdBy: req.user?._id || null,
      createdByName: userLabel(req.user),
      updatedBy: req.user?._id || null,
      updatedByName: userLabel(req.user),
    });
    return res.status(201).json({ success: true, data: doc.toObject() });
  } catch (e) {
    if (e?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "동일한 이름의 템플릿이 이미 존재합니다." });
    }
    return res.status(500).json({ success: false, message: e?.message || "생성 실패" });
  }
}

export async function updateToolTemplate(req, res) {
  try {
    const { id } = req.params;
    const { name, description, slots } = req.body || {};
    const update = {
      updatedBy: req.user?._id || null,
      updatedByName: userLabel(req.user),
    };
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "name은 비어있을 수 없습니다." });
      }
      update.name = trimmed.slice(0, 80);
    }
    if (typeof description === "string") {
      update.description = description.trim().slice(0, 300);
    }
    if (Array.isArray(slots)) {
      update.slots = normalizeTemplateSlots(slots);
    }
    const doc = await CncToolTemplate.findByIdAndUpdate(id, update, { new: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });
    }
    return res.json({ success: true, data: doc.toObject() });
  } catch (e) {
    if (e?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "동일한 이름의 템플릿이 이미 존재합니다." });
    }
    return res.status(500).json({ success: false, message: e?.message || "수정 실패" });
  }
}

export async function deleteToolTemplate(req, res) {
  try {
    const { id } = req.params;
    const doc = await CncToolTemplate.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "삭제 실패" });
  }
}

/**
 * applyToolTemplate
 *
 * 지정한 템플릿을 여러 장비(machineIds)에 Merge upsert로 적용한다.
 *
 * 동작:
 *  - 각 장비의 tooling.toolSlots를 로드
 *  - 템플릿 슬롯(toolNum, toolName)만 upsert
 *    - 기존 슬롯이 있으면 toolName만 덮어쓰고 replacementStatus/이력/통계는 유지
 *    - 기존 슬롯이 없으면 mounted 상태로 신규 생성
 *  - 템플릿에 없는 슬롯은 그대로 둔다
 */
export async function applyToolTemplate(req, res) {
  try {
    const { id } = req.params;
    const { machineIds } = req.body || {};
    const ids = Array.isArray(machineIds)
      ? machineIds.map((m) => String(m || "").trim()).filter(Boolean)
      : [];
    if (ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "machineIds 배열이 비어있습니다." });
    }
    const tmpl = await CncToolTemplate.findById(id).lean();
    if (!tmpl) {
      return res.status(404).json({ success: false, message: "템플릿을 찾을 수 없습니다." });
    }
    const tmplSlots = normalizeTemplateSlots(tmpl.slots);
    if (tmplSlots.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "템플릿에 슬롯이 없습니다." });
    }

    const results = [];
    for (const machineId of ids) {
      const machine = await getOrCreateCncMachine(machineId);
      if (!machine) {
        results.push({ machineId, success: false, message: "장비를 찾을 수 없음" });
        continue;
      }
      const currentTooling =
        machine.tooling && typeof machine.tooling.toObject === "function"
          ? machine.tooling.toObject()
          : machine.tooling || {};
      const existing = normalizeToolSlots(currentTooling.toolSlots);
      const map = new Map(existing.map((s) => [s.toolNum, s]));

      for (const t of tmplSlots) {
        const prev = map.get(t.toolNum);
        if (prev) {
          map.set(t.toolNum, { ...prev, toolName: t.toolName });
        } else {
          map.set(t.toolNum, {
            toolNum: t.toolNum,
            toolName: t.toolName,
            // 슬롯 메타 단순화: type/note 필드는 더 이상 사용하지 않으나,
            // 기존 normalizeToolSlots 호환을 위해 빈값으로 둔다.
            toolType: "other",
            toolNote: "",
            replacementStatus: "mounted",
            removalRequestedAt: null,
            removalRequestedBy: null,
            removalRequestedByName: "",
            lastReplacedAt: null,
            lastReplacedBy: null,
            lastReplacedByName: "",
          });
        }
      }
      const nextSlots = Array.from(map.values()).sort(
        (a, b) => a.toolNum - b.toolNum,
      );
      machine.tooling = {
        ...currentTooling,
        toolSlots: nextSlots,
      };
      await machine.save();
      results.push({
        machineId,
        success: true,
        appliedCount: tmplSlots.length,
        totalSlots: nextSlots.length,
      });
    }

    return res.json({ success: true, data: { results } });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "적용 실패" });
  }
}

/**
 * 헬퍼: 장비 목록 (템플릿 적용 대상 선택용).
 * machineId, name만 반환해 가벼운 응답을 유지한다.
 */
export async function listCncMachinesForTemplate(req, res) {
  try {
    const docs = await CncMachine.find({})
      .select("machineId name status")
      .sort({ machineId: 1 })
      .lean();
    return res.json({ success: true, data: docs });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "조회 실패" });
  }
}
