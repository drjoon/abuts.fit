// related files:
// - web/eb.sh (람다 변경 감지 후 배포)
// - web/backend/scripts/abutment-stl-js/build-stl-{filled,cuff,correct}-lambda.mjs
//
// 람다 번들을 디스크에 쓰지 않고 메모리에서 빌드해 sha256을 출력한다.
// 번들은 핸들러가 import하는 모든 소스를 포함하므로, 람다가 쓰는 코드가 바뀐 경우에만 해시가 바뀐다.
// 배포 스크립트(메모리·타임아웃 등 설정)와 빌드 스크립트도 해시에 넣는다.
//
//   cd web/backend && node scripts/abutment-stl-js/lambda-bundle-hash.mjs <filled|cuff|correct>
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const ENTRIES = {
  filled: "services/abutmentStl/filledLambda.handler.js",
  cuff: "services/abutmentStl/cuffBlendLambda.handler.js",
  correct: "services/abutmentStl/correctLambda.handler.js",
};

const kind = process.argv[2];
if (!ENTRIES[kind]) {
  console.error("사용법: lambda-bundle-hash.mjs <filled|cuff|correct>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "../..");

const result = await build({
  entryPoints: [path.join(backendDir, ENTRIES[kind])],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  write: false,
  outfile: path.join(backendDir, `dist/hash-only-${kind}/index.mjs`),
  banner: {
    js: "import { createRequire as __abutsCreateRequire } from 'module'; const require = __abutsCreateRequire(import.meta.url);",
  },
  logLevel: "error",
});

const hash = crypto.createHash("sha256");
for (const file of result.outputFiles) hash.update(file.contents);
for (const script of [`build-stl-${kind}-lambda.mjs`, `deploy-stl-${kind}-lambda.sh`]) {
  hash.update(await fs.readFile(path.join(here, script)));
}
process.stdout.write(hash.digest("hex"));
