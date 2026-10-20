// 신규 커넥션·신규 임플란트 의뢰를 제조사·브랜드 단위로 묶는 SSOT. 동의어·진행 상태(읽음·개발중·개발완료) 포함.
// related files:
// - web/backend/services/newConnectionImplantGroup.service.js
// - web/backend/services/newConnectionRequestDashboard.service.js
import mongoose from "mongoose";

const aliasSchema = new mongoose.Schema(
  {
    manufacturer: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const newConnectionImplantGroupSchema = new mongoose.Schema(
  {
    groupKey: { type: String, required: true, unique: true, index: true },
    canonicalManufacturer: { type: String, required: true, trim: true },
    canonicalBrand: { type: String, required: true, trim: true },
    aliases: { type: [aliasSchema], default: [] },
    readAt: { type: Date, default: null },
    readBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    inDevelopmentAt: { type: Date, default: null },
    inDevelopmentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    developmentCompleteAt: { type: Date, default: null },
    developmentCompleteBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const NewConnectionImplantGroup = mongoose.model(
  "NewConnectionImplantGroup",
  newConnectionImplantGroupSchema,
);

export default NewConnectionImplantGroup;
