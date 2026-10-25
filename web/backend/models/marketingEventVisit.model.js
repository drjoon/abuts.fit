// related files:
// - web/backend/services/eventVisitLog.service.js
// - web/backend/models/marketingEvent.model.js
// - web/backend/models/marketingEventVisitChunk.model.js
import mongoose from "mongoose";

const marketingEventVisitSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketingEvent",
      required: true,
      index: true,
    },
    eventSlug: { type: String, required: true, trim: true },
    sessionId: { type: String, required: true, trim: true },
    /** 브라우저 localStorage 방문자. 재방문 구분용이고 계정과 무관하다. */
    visitorId: { type: String, default: "", trim: true },
    returning: { type: Boolean, default: false },
    /** 이벤트 페이지를 벗어난 뒤 본 경로. path 만 두고 표시 이름은 조회 때 붙인다. */
    routes: {
      type: [
        {
          _id: false,
          path: { type: String, trim: true },
          index: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    /** 화면에 들어온 랜딩 섹션. label 은 data-rail-label, index 는 페이지 순서. */
    pages: {
      type: [
        {
          _id: false,
          label: { type: String, trim: true },
          index: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    /** 신청 폼 구간이 화면에 들어옴 */
    reachedApply: { type: Boolean, default: false },
    /** 신청 입력을 시작함 */
    formStarted: { type: Boolean, default: false },
    /** 이 세션에서 신청이 접수됨 */
    converted: { type: Boolean, default: false },
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    /** 클라이언트 체류. 상한 6시간. */
    dwellMs: { type: Number, default: 0 },
    /** enter 횟수. 같은 탭 재진입은 세션을 유지하고 여기만 올린다. */
    pageViews: { type: Number, default: 1 },
    scrollMax: { type: Number, default: 0 },
    /** 세션 시작 KST 달력·시각. 시간대 집계 SSOT. */
    kstDate: { type: String, required: true, trim: true },
    kstHour: { type: Number, required: true, min: 0, max: 23 },
    country: { type: String, default: "", trim: true },
    regionName: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    referrerHost: { type: String, default: "", trim: true },
    utmSource: { type: String, default: "", trim: true },
    utmMedium: { type: String, default: "", trim: true },
    utmCampaign: { type: String, default: "", trim: true },
    device: { type: String, default: "desktop", trim: true },
    browser: { type: String, default: "Other", trim: true },
    lang: { type: String, default: "", trim: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: { type: String, default: "", trim: true },
    /** 원문 IP는 두지 않는다. */
    ipHash: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

marketingEventVisitSchema.index({ eventId: 1, sessionId: 1 }, { unique: true });
marketingEventVisitSchema.index({ eventId: 1, visitorId: 1 });
marketingEventVisitSchema.index({ eventId: 1, kstDate: 1, kstHour: 1 });
marketingEventVisitSchema.index({ eventId: 1, lastSeenAt: -1 });
marketingEventVisitSchema.index({
  eventId: 1,
  kstDate: 1,
  country: 1,
  regionName: 1,
});

const MarketingEventVisit =
  mongoose.models.MarketingEventVisit ||
  mongoose.model("MarketingEventVisit", marketingEventVisitSchema);

export default MarketingEventVisit;
