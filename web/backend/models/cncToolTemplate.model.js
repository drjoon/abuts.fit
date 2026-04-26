import mongoose from "mongoose";

/**
 * CncToolTemplate
 *
 * 여러 CNC 장비에 공통으로 적용되는 공구 슬롯 구성 템플릿.
 *
 * - 슬롯 메타는 슬롯번호(필수) + 공구이름(선택)만 저장한다.
 * - 공구 타입/메모/예상 교체 시점 등 부수 필드는 운영 부담을 줄이기 위해
 *   템플릿/슬롯 메타에서 제거되었다. 사용량/시간은 자동 누적되어
 *   추후 빅데이터 기반으로 교체 시기를 예측한다(rules 6.4.8).
 * - 적용 모드: Merge upsert. 템플릿에 정의된 슬롯만 해당 장비의
 *   tooling.toolSlots에 upsert되며, 기존 통계/이력은 유지된다.
 */
const cncToolTemplateSlotSchema = new mongoose.Schema(
  {
    toolNum: { type: Number, required: true, min: 1 },
    toolName: { type: String, default: "", trim: true, maxlength: 100 },
  },
  { _id: false },
);

const cncToolTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    slots: { type: [cncToolTemplateSlotSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdByName: { type: String, default: "", trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedByName: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

cncToolTemplateSchema.index({ name: 1 }, { unique: true });

export const CncToolTemplate =
  mongoose.models.CncToolTemplate ||
  mongoose.model("CncToolTemplate", cncToolTemplateSchema);

export default CncToolTemplate;
