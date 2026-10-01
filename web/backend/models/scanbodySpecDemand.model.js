// 치과 의뢰에 들어온 스캔바디·심플 규격을 쌓는다(AI 디자인 공개 전부터). 관리자가 보고 제조사에서 받아 등록한다.
// key = type|maker|diameter|height. 심플어벗·심플밀링은 직경만 맞으면 쓰니 height를 비우고 들어온 높이는 heights에 모은다.
// 기공소에는 기본으로 업로드를 요구하지 않는다. 시장에서 거의 안 쓰는 규격만 관리자가 labUploadRequested로 표시한다.
// related files:
// - web/backend/services/scanbodyDemand.service.js
// - web/backend/scripts/db/backfill-scanbody-spec-demand.js
import mongoose from "mongoose";

const scanbodySpecDemandSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    /** library: 제조사 스캔바디, template: 심플어벗·심플밀링·심플힐링. */
    type: { type: String, enum: ["library", "template"], required: true },
    maker: { type: String, required: true },
    diameter: { type: String, default: "" },
    height: { type: String, default: "" },
    heights: { type: [String], default: [] },
    /** 같이 의뢰된 임플란트. 키 → { manufacturer, brand, family, type, count }. */
    implants: { type: mongoose.Schema.Types.Mixed, default: {} },
    transferIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    practiceAnchorIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    labAnchorIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    teethCount: { type: Number, default: 0 },
    firstAt: { type: Date, default: null },
    lastAt: { type: Date, default: null, index: true },
    /** 관리자 판단: 어벗츠가 구하기 어려워 의뢰받은 기공소에 라이브러리를 올려 달라고 한다. */
    labUploadRequested: { type: Boolean, default: false, index: true },
    labUploadRequestedAt: { type: Date, default: null },
    labUploadRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const ScanbodySpecDemand = mongoose.model("ScanbodySpecDemand", scanbodySpecDemandSchema);

export default ScanbodySpecDemand;
