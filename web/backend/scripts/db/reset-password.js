/**
 * 특정 계정의 비밀번호를 .essential-accounts.json 에 기록된 값으로 강제 재설정한다.
 *
 * businessAnchorId 가 있는 실계정은 seed-account 가 덮어쓰지 않으므로,
 * 비밀번호를 변경할 때 이 스크립트를 사용해야 한다.
 *
 * 사용법:
 *   npm run db:reset-password
 *
 * User 모델의 pre('save') 훅이 bcrypt 해싱을 자동으로 처리한다.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ESSENTIAL_OUTPUT_PATH = path.join(
  __dirname,
  "seed",
  ".essential-accounts.json",
);

async function run() {
  const { mongoUri } = await connectDb();
  console.log("[reset-password] connected", { mongoUri: mongoUri?.replace(/\/\/.*@/, "//***@") });

  const raw = await fs.readFile(ESSENTIAL_OUTPUT_PATH, "utf8");
  const { users } = JSON.parse(raw);

  if (!Array.isArray(users) || users.length === 0) {
    console.error("[reset-password] .essential-accounts.json 에 users 가 없습니다.");
    process.exit(1);
  }

  for (const account of users) {
    const { email, password } = account;
    if (!email || !password) continue;

    const user = await User.findOne({ email });
    if (!user) {
      console.warn(`[reset-password] 계정 없음: ${email}`);
      continue;
    }

    // password 를 평문으로 설정하면 pre('save') 훅이 bcrypt 해싱 처리
    user.password = password;
    user.markModified("password");
    await user.save();

    console.log(`[reset-password] ✅ 비밀번호 재설정 완료: ${email}`);
  }
}

run()
  .catch((err) => {
    console.error("[reset-password] 실패:", err);
    process.exit(1);
  })
  .finally(() => disconnectDb());
