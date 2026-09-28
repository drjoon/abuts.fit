// related files:
// - bg/pc1/abutment-stl-shadow/shadow-worker.cmd
// - web/backend/scripts/abutment-stl-js/shadow-remote-worker.js
//
// PC1(git·npm 없음)에 폴더째 복사할 섀도 워커 패키지를 만든다.
// 결과: bg/pc1/abutment-stl-shadow/dist/{shadow-remote-worker.js, evaluate.worker.js, pipeline.worker.js, package.json}
// 비밀값은 넣지 않는다. PC1의 rhino-server\compute\local.env(BACKEND_BASE·RHINO_SHARED_SECRET)를 그대로 읽는다.
//
//   cd web/backend && node scripts/abutment-stl-js/build-pc1-shadow-package.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "../..");
const outDir = path.resolve(backendDir, "../../bg/pc1/abutment-stl-shadow/dist");

await fs.rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: [
    path.join(backendDir, "scripts/abutment-stl-js/shadow-remote-worker.js"),
    path.join(backendDir, "services/abutmentStl/evaluate.worker.js"),
    path.join(backendDir, "services/abutmentStl/pipeline.worker.js"),
  ],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outdir: outDir,
  entryNames: "[name]",
  // CJS 의존성(three 예제 등)의 require를 ESM 번들 안에서 쓰게 한다.
  banner: { js: "import { createRequire as __abutsCreateRequire } from 'module'; const require = __abutsCreateRequire(import.meta.url);" },
  logLevel: "warning",
});
await fs.writeFile(path.join(outDir, "package.json"), JSON.stringify({ type: "module" }, null, 2));

console.log(`[build-pc1-shadow] out=${outDir}`);
for (const f of await fs.readdir(outDir)) {
  const { size } = await fs.stat(path.join(outDir, f));
  console.log(`  ${f} ${(size / 1024).toFixed(0)}KB`);
}
