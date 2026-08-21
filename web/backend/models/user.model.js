// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "이름은 필수 입력 항목입니다."],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "이메일은 필수 입력 항목입니다."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
        "유효한 이메일 주소를 입력해주세요.",
      ],
    },
    password: {
      type: String,
      required: [true, "비밀번호는 필수 입력 항목입니다."],
      minlength: [8, "비밀번호는 최소 8자 이상이어야 합니다."],
      select: false, // 쿼리 결과에서 비밀번호 필드 제외
    },
    role: {
      type: String,
      enum: [
        "requestor",
        "manufacturer",
        "internalLab",
        "admin",
        "salesman",
        "devops",
        "practice",
        "labTeam",
        "salesTeam",
      ],
      default: "requestor",
    },

    practiceProfile: {
      clinicName: { type: String, default: "", trim: true },
      directorName: { type: String, default: "", trim: true }, // 대표원장님 성함
      staffName: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true }, // 담당자 휴대폰
      clinicPhone: { type: String, default: "", trim: true }, // 치과 전화번호
      address: { type: String, default: "", trim: true },
      addressDetail: { type: String, default: "", trim: true },
      zipCode: { type: String, default: "", trim: true },
      createdAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },
    // 미러(온보딩·미링크). Org SSOT는 BusinessAnchor.requestorKind/Services.
    requestorKind: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v == null || v === "practice" || v === "lab",
        message: "requestorKind must be practice or lab",
      },
    },
    // paid-only. free는 폐기(읽기 시 paid 승격).
    requestorServices: {
      free: { type: Boolean, default: false },
      paid: { type: Boolean, default: false },
    },
    // 레거시 — normalize/백필·resolve 폴백만. 신규 쓰기 금지.
    requestorCapabilities: {
      practice: { type: Boolean, default: false },
      lab: { type: Boolean, default: false },
    },
    subRole: {
      type: String,
      enum: ["owner", "staff"],
      default: null,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    referredByAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    phoneVerifiedAt: {
      type: Date,
      default: null,
    },
    phoneVerification: {
      codeHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      sentAt: { type: Date, default: null },
      dailySendDate: { type: String, default: "" },
      dailySendCount: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      pendingPhoneNumber: { type: String, trim: true, default: "" },
    },
    business: {
      type: String,
      trim: true,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    onboardingWizardCompleted: {
      type: Boolean,
      default: false,
    },
    /** 드롭존 최소 가입 등 채널 구분 (`practice_dropzone`) */
    signupChannel: {
      type: String,
      default: null,
    },
    verificationToken: String,
    verificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
    social: {
      provider: {
        type: String,
        enum: ["google", "kakao"],
        default: null,
      },
      providerUserId: {
        type: String,
        default: null,
      },
    },
    originalEmail: {
      type: String,
      default: null,
      index: true,
    },
    replacesUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    replacedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    requestSettings: {
      // related files:
      // - web/backend/controllers/businesses/business.controller.js
      // - web/backend/controllers/requests/creation.from-draft.controller.js
      // - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
      // 의뢰자(계정) 단위 디자인 소프트웨어 기본값 SSOT
      designSoftware: {
        type: String,
        default: null,
        trim: true,
        maxlength: 120,
      },
      // ExoCAD 전용 버전. designSoftware==="ExoCAD"일 때만 의미 있음.
      // - "le_3_0": 3.0 이하 (헥스30 보정)
      // - "ge_3_2": 3.2 이상 (STL모델대로)
      // related: web/backend/utils/designSoftwareHex.js
      exoCadVersion: {
        type: String,
        default: null,
        trim: true,
        validate: {
          validator: (v) =>
            v == null || v === "" || v === "le_3_0" || v === "ge_3_2",
          message: "exoCadVersion은 le_3_0 | ge_3_2 이어야 합니다.",
        },
      },
      // deprecated: 헥스 확인 pending SSOT는 hexVerificationResultHex 미확정.
      // 읽기/쓰기에 쓰지 말 것. related: designSoftwareHex.js isHexVerificationPending
      hexVerificationSamplePending: {
        type: Boolean,
        default: false,
      },
      // 관리자 헥스 확인 테스트 완료 시각. related: designSoftwareHex.js resolveExoCadManufacturerHexRotation
      hexVerificationCompletedAt: {
        type: Date,
        default: null,
      },
      hexVerificationCompletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      // 관리자 확정 헥스(ExoCAD). 헥스 확인 pending SSOT(값 없으면 pending).
      // - "STL모델대로" | "헥스30도회전"
      hexVerificationResultHex: {
        type: String,
        default: null,
        trim: true,
      },
      // 의뢰자(계정) 단위 아노다이징 기본값. 신규 업로드 시드 → caseInfos.anodizingEnabled
      anodizingEnabled: {
        type: Boolean,
        default: true,
      },
      // 의뢰자(계정) 단위 유지홈 기본값. 신규 업로드/디자인 확인 시드 → caseInfos.retentionGroove
      // - "none" | "deep" (shallow는 none으로 정규화)
      retentionGroove: {
        type: String,
        enum: ["none", "deep", "shallow"],
        default: "none",
        trim: true,
      },
      // 제조사 PreviewModal에서 설정한 의뢰자(개인) 단위 기본 헥스 회전.
      // - canonical: "STL모델대로" | "헥스30도회전" | "헥스X도회전(total)"
      // - 조회 SSOT: 개인(User) → BusinessAnchor → 관리자 hexVerificationResultHex → designSoftware
      // related: common.requests.controller.js updateRndHexRotation
      defaultManufacturerHexRotation: {
        type: String,
        default: null,
        trim: true,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    preferences: {
      language: {
        type: String,
        enum: ["ko", "en", "ja", "zh"],
        default: "ko",
      },
      notifications: {
        userConfiguredAt: {
          type: Date,
          default: null,
        },
        methods: {
          emailNotifications: { type: Boolean, default: true },
          smsNotifications: { type: Boolean, default: true },
          pushNotifications: { type: Boolean, default: true },
          marketingEmails: { type: Boolean, default: true },
        },
        types: {
          newRequests: { type: Boolean, default: true },
          statusUpdates: { type: Boolean, default: true },
          payments: { type: Boolean, default: true },
        },
      },
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      /** 계정별 최근 대시보드 경로 (pathname + search). 로그인·/dashboard 랜딩 복원용 */
      lastDashboardPath: {
        type: String,
        default: null,
        maxlength: 300,
      },
      /** 계정(개인) 단위 UI 모드. 기본 익스프레스(첫 가입) */
      workspaceMode: {
        type: String,
        enum: ["express", "expert"],
        default: "express",
      },
      /** 기공의뢰·기공의뢰수신 캘린더 날짜 뱃지. 기본 치과도착일 */
      labReceiveCalendarDateKey: {
        type: String,
        enum: ["orderDate", "arrivalDate"],
        default: "arrivalDate",
      },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  },
);

// SSOT: subRole 사용 (requestorRole, manufacturerRole, adminRole 레거시 제거)
// subRole은 사업자 등록 완료 시 자동으로 'owner'로 설정됨

// 비밀번호 저장 전 해싱
userSchema.pre("save", async function (next) {
  // 비밀번호가 변경되지 않았다면 다음 미들웨어로 넘어감
  if (!this.isModified("password")) return next();

  try {
    // 비밀번호 해싱
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 비밀번호 검증 메소드
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    if (!this.password) {
      console.error(
        '비밀번호 필드가 없습니다. select("+password")가 제대로 작동하는지 확인하세요.',
      );
      return false;
    }

    if (!candidatePassword) {
      console.error("비교할 비밀번호가 없습니다.");
      return false;
    }

    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error("비밀번호 비교 오류:", error);
    return false;
  }
};

// 사용자 모델 생성
const User = mongoose.model("User", userSchema);

export default User;
