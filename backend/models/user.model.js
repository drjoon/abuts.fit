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
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
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
      enum: ["requestor", "manufacturer", "admin"],
      default: "requestor",
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    organization: {
      type: String,
      trim: true,
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
    verificationToken: String,
    verificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
    active: {
      type: Boolean,
      default: true,
    },
    preferences: {
      language: {
        type: String,
        enum: ["ko", "en", "ja", "zh"],
        default: "ko",
      },
      notifications: {
  email: {
    newRequest: { type: Boolean, default: true },
    newMessage: { type: Boolean, default: true },
  },
  push: {
    newRequest: { type: Boolean, default: true },
    newMessage: { type: Boolean, default: true },
  },
},
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  }
);

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
      console.error('비밀번호 필드가 없습니다. select("+password")가 제대로 작동하는지 확인하세요.');
      return false;
    }
    
    if (!candidatePassword) {
      console.error('비교할 비밀번호가 없습니다.');
      return false;
    }
    
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('비밀번호 비교 오류:', error);
    return false;
  }
};

// 사용자 모델 생성
const User = mongoose.model("User", userSchema);

export default User;
