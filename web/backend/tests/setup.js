import mongoose from "mongoose";
import { config } from "dotenv";

// 환경 변수 로드
config({ path: ".env.test" });

async function clearCollections() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

// 테스트 전 MongoDB 연결
beforeAll(async () => {
  // 테스트용 MongoDB 연결 (별도 테스트 DB 사용)
  const mongoURI =
    process.env.MONGODB_URI_TEST || "mongodb://localhost:27017/abutsFitTest";
  await mongoose.connect(mongoURI);
});

// 각 테스트 후 컬렉션 정리
afterEach(async () => {
  await clearCollections();
});

// 모든 테스트 후 연결 종료
afterAll(async () => {
  // dropDatabase 대신 각 컬렉션 정리 (권한 문제 해결)
  await clearCollections();
  await mongoose.disconnect();
});
