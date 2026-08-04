// related files:
// - web/backend/rules.md
// - web/backend/controllers/admin/adminSms.controller.js
// - web/backend/modules/admin/admin.routes.js
import mongoose from "mongoose";

/**
 * AdminSmsTemplate
 * 관리자 문자/알림톡 발송용 메시지 템플릿 (로컬 SSOT).
 * - 본문/변수는 팝빌·카카오 알림톡 형식(#{변수})을 따름.
 * - kakaoTemplateCode: 팝빌 승인 템플릿 코드(12자리, 선택). 없으면 SMS/LMS.
 * - emphasizeTitle: 팝빌 강조표기형 등록 시 참고용 타이틀.
 * - code: 시스템 기본 템플릿 식별자(시드용).
 */
const adminSmsTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    emphasizeTitle: { type: String, trim: true, maxlength: 50, default: "" },
    code: { type: String, trim: true, maxlength: 64, default: "" },
    kakaoTemplateCode: {
      type: String,
      trim: true,
      maxlength: 32,
      default: "",
    },
    seedVersion: { type: Number, default: 0 },
    isSystem: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

adminSmsTemplateSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $type: "string", $gt: "" } },
  },
);
adminSmsTemplateSchema.index({ active: 1, updatedAt: -1 });

const AdminSmsTemplate =
  mongoose.models.AdminSmsTemplate ||
  mongoose.model("AdminSmsTemplate", adminSmsTemplateSchema);

export default AdminSmsTemplate;
