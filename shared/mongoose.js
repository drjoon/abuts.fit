// Local dev용 mongoose 단일 인스턴스 로더
// 우선 backend/node_modules에서 찾고, 실패하면 루트 node_modules를 fallback
import { createRequire } from "module";

const require = createRequire(import.meta.url);

let mongoose;
try {
  mongoose = require("../web/backend/node_modules/mongoose/index.js");
} catch (err) {
  mongoose = require("../node_modules/mongoose/index.js");
}

export default mongoose;
