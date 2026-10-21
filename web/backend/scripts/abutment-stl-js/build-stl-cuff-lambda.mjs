// related files:
// - web/backend/services/abutmentStl/cuffBlendLambda.handler.js
// - web/backend/scripts/abutment-stl-js/deploy-stl-cuff-lambda.sh
//
// 커프 보정 람다 배포 zip을 만든다. 결과: web/backend/dist/stl-cuff-lambda/
//
//   cd web/backend && node scripts/abutment-stl-js/build-stl-cuff-lambda.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "../..");
const outDir = path.resolve(backendDir, "dist/stl-cuff-lambda");

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(backendDir, "services/abutmentStl/cuffBlendLambda.handler.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(outDir, "index.mjs"),
  banner: {
    js: "import { createRequire as __abutsCreateRequire } from 'module'; const require = __abutsCreateRequire(import.meta.url);",
  },
  logLevel: "warning",
});

await fs.writeFile(
  path.join(outDir, "package.json"),
  JSON.stringify({ type: "module", name: "abuts-stl-cuff-lambda" }, null, 2),
);

const { size } = await fs.stat(path.join(outDir, "index.mjs"));
console.log(`[build-stl-cuff-lambda] out=${outDir} index.mjs ${(size / 1024 / 1024).toFixed(2)}MB`);
