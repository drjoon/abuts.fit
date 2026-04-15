import mongoose from "mongoose";

/**
 * ReviewApprovalQueue
 *
 * 제조사 워크시트 승인(→) 버튼 클릭 시 APPROVED 요청을 직렬 큐에 저장한다.
 *
 * 목적:
 *   - 작업자가 빠르게 연속 승인해도 백엔드/BG 앱(rhino, esprit, bridge, lot, pack, wbls)이
 *     동시에 여러 요청을 받아 충돌하는 문제를 방지한다.
 *   - 각 의뢰 승인(stage=request/cam)은 한 번에 하나씩 순서대로 처리된다.
 *   - 이미 처리 중인 작업이 있으면 PENDING 상태로 대기하다가 처리가 끝나면 다음 작업을 실행한다.
 *
 * 처리 흐름:
 *   1. 프론트엔드: 승인 클릭 → POST /api/requests/:id/review-status (stage=request/cam, status=APPROVED)
 *   2. 백엔드: DB 트랜잭션(credit, stage 변경 등)은 즉시 처리, BG 트리거(Esprit 등)는 큐에 삽입
 *   3. 워커: 큐에서 PENDING 작업을 하나씩 꺼내 BG 트리거 실행 (순서 보장)
 *   4. 완료/실패 시 status 업데이트 후 다음 작업 처리
 */
const ReviewApprovalQueueSchema = new mongoose.Schema(
  {
    // 어떤 종류의 승인 작업인지 구분
    taskType: {
      type: String,
      enum: [
        "REQUEST_STAGE_APPROVED", // 의뢰 단계 승인 → Esprit NC 생성 트리거
        "CAM_STAGE_APPROVED",     // CAM 단계 승인 → 가공 단계 전환 후처리
      ],
      required: true,
      index: true,
    },

    // 큐 처리 상태
    status: {
      type: String,
      enum: [
        "PENDING",    // 대기 중 (아직 처리 전)
        "PROCESSING", // 처리 중 (워커가 점유)
        "COMPLETED",  // 완료
        "FAILED",     // 실패 (maxAttempts 초과)
        "CANCELLED",  // 취소 (의뢰 자체가 취소/롤백됨)
      ],
      default: "PENDING",
      index: true,
    },

    // 의뢰 식별자
    requestMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      required: true,
      index: true,
    },

    // 중복 삽입 방지 키: `taskType:requestMongoId`
    uniqueKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // 승인 처리에 필요한 데이터 스냅샷
    // (작업 시점의 request 데이터를 저장해 워커가 재조회 없이 처리 가능)
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // 승인 요청자 (감사 로그용)
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // 재시도 관련
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },

    // 처리 시간 추적
    processingStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },

    // 에러 정보
    error: {
      message: { type: String, default: null },
      code: { type: String, default: null },
    },

    // 워커 잠금 (분산 환경에서의 중복 처리 방지)
    lockedBy: {
      type: String,
      default: null,
    },
    lockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// 복합 인덱스: 워커가 PENDING 작업을 순서대로 조회할 때 사용
ReviewApprovalQueueSchema.index({ status: 1, createdAt: 1 });
ReviewApprovalQueueSchema.index({ status: 1, taskType: 1, createdAt: 1 });
ReviewApprovalQueueSchema.index({ requestMongoId: 1, taskType: 1 });

export default mongoose.models.ReviewApprovalQueue ||
  mongoose.model(
    "ReviewApprovalQueue",
    ReviewApprovalQueueSchema,
    "ReviewApprovalQueue"
  );
