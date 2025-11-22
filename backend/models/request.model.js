import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
      required: true,
    },
    title: {
      type: String,
      required: [true, "제목은 필수 입력 항목입니다."],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "설명은 필수 입력 항목입니다."],
    },
    requirements: {
      type: String,
    },
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["검토중", "견적 대기", "진행중", "완료", "취소"],
      default: "검토중",
    },
    priority: {
      type: String,
      enum: ["낮음", "보통", "높음"],
      default: "보통",
    },
    implantType: {
      type: String,
      required: true,
      enum: ["straumann", "nobel", "osstem", "dentium", "기타"],
    },
    implantSpec: {
      type: String,
      required: true,
    },
    files: [
      {
        fileName: String,
        fileType: String,
        fileSize: Number,
        filePath: String,
        s3Key: String,
        s3Url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        attachments: [
          {
            fileName: String,
            fileType: String,
            fileSize: Number,
            filePath: String,
            s3Key: String,
            s3Url: String,
          },
        ],
        createdAt: {
          type: Date,
          default: Date.now,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
      },
    ],
    price: {
      amount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "KRW",
      },
      quotedAt: Date,
    },
    timeline: {
      estimatedCompletion: Date,
      actualCompletion: Date,
    },
    deliveryInfo: {
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      trackingNumber: String,
      carrier: String,
      shippedAt: Date,
      deliveredAt: Date,
    },
    paymentStatus: {
      type: String,
      enum: ["미결제", "결제 대기", "결제 완료", "환불"],
      default: "미결제",
    },
    paymentDetails: {
      method: String,
      transactionId: String,
      paidAt: Date,
      amount: Number,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        note: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
      givenAt: Date,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  }
);

// 의뢰 ID 자동 생성 (REQ-001, REQ-002, ...)
requestSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const count = await this.constructor.countDocuments({});
      const paddedCount = String(count + 1).padStart(3, "0");
      this.requestId = `REQ-${paddedCount}`;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// 의뢰 모델 생성
const Request = mongoose.model("Request", requestSchema);

export default Request;
