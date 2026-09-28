// related files:
// - web/backend/jest.config.js
// - web/backend/tests/setup.js
import { TestEnvironment as NodeEnvironment } from "jest-environment-node";

/**
 * 테스트 파일이 app.js를 import하면 모듈 로드 시점에 Mongo 연결이 열린다.
 * 파일의 테스트가 전부 skip이면 setup.js의 afterAll이 돌지 않아 연결이 남고
 * Jest가 종료되지 않는다. 환경 teardown은 항상 돌므로 여기서 닫는다.
 */
export default class JestMongoEnvironment extends NodeEnvironment {
  async teardown() {
    const mongoose = this.global.__abutsJestMongoose;
    if (mongoose && mongoose.connection?.readyState !== 0) {
      try {
        if (mongoose.connection.readyState === 2) {
          await mongoose.connection.asPromise().catch(() => {});
        }
        await mongoose.disconnect();
      } catch (err) {
        console.warn("[jestMongoEnvironment] disconnect failed", err?.message);
      }
    }
    await super.teardown();
  }
}
