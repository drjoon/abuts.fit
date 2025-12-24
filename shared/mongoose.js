// Shared mongoose entry to ensure single mongoose instance from backend node_modules
// 1) 우선 ../backend/node_modules (EB 런타임 및 로컬 backend 설치)
// 2) 실패 시 루트 node_modules를 폴백 (로컬에서 backend 설치가 안 된 경우)
import { createRequire } from "module";

const require = createRequire(import.meta.url);

let mongoose;
try {
  mongoose = require("../backend/node_modules/mongoose/index.js");
} catch (err) {
  mongoose = require("../node_modules/mongoose/index.js");
}

export default mongoose;
