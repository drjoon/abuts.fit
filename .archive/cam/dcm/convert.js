const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DCM_DIR = path.join(__dirname, "files");
const OUTPUT_DIR = path.join(__dirname, "output");

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

function readBinaryStlTriangles(buffer) {
  if (buffer.length < 84) {
    throw new Error("STL 파일이 너무 짧습니다 (binary STL 아님?)");
  }
  const header = buffer.subarray(0, 80);
  const triCount = buffer.readUInt32LE(80);
  const triangles = [];
  let offset = 84;
  const TRIANGLE_SIZE = 50;

  for (let i = 0; i < triCount; i++) {
    if (offset + TRIANGLE_SIZE > buffer.length) {
      throw new Error("STL 데이터가 손상되었거나 triCount가 잘못되었습니다");
    }
    const normal = [
      buffer.readFloatLE(offset + 0),
      buffer.readFloatLE(offset + 4),
      buffer.readFloatLE(offset + 8),
    ];
    const vertices = [];
    for (let v = 0; v < 3; v++) {
      const base = offset + 12 + v * 12;
      vertices.push([
        buffer.readFloatLE(base + 0),
        buffer.readFloatLE(base + 4),
        buffer.readFloatLE(base + 8),
      ]);
    }
    const attr = buffer.readUInt16LE(offset + 48);
    triangles.push({ normal, vertices, attr });
    offset += TRIANGLE_SIZE;
  }
  return { header, triangles };
}

function triangleKey(tri, tol = 1e-5) {
  const round = (x) => Math.round(x / tol) * tol;
  const verts = tri.vertices.map(([x, y, z]) => [round(x), round(y), round(z)]);
  verts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return verts.map((v) => v.join(",")).join("|");
}

function writeBinaryStl(headerSource, triangles, outPath) {
  const header = Buffer.alloc(80);
  if (headerSource) {
    headerSource.copy(header, 0, 0, Math.min(80, headerSource.length));
  }
  const triCountBuf = Buffer.alloc(4);
  triCountBuf.writeUInt32LE(triangles.length, 0);

  const TRIANGLE_SIZE = 50;
  const dataBuf = Buffer.alloc(TRIANGLE_SIZE * triangles.length);

  let offset = 0;
  for (const tri of triangles) {
    const normal = tri.normal || [0, 0, 0];
    dataBuf.writeFloatLE(normal[0], offset + 0);
    dataBuf.writeFloatLE(normal[1], offset + 4);
    dataBuf.writeFloatLE(normal[2], offset + 8);
    for (let v = 0; v < 3; v++) {
      const [x, y, z] = tri.vertices[v];
      const base = offset + 12 + v * 12;
      dataBuf.writeFloatLE(x, base + 0);
      dataBuf.writeFloatLE(y, base + 4);
      dataBuf.writeFloatLE(z, base + 8);
    }
    const attr = typeof tri.attr === "number" ? tri.attr : 0;
    dataBuf.writeUInt16LE(attr, offset + 48);
    offset += TRIANGLE_SIZE;
  }

  const outBuf = Buffer.concat([header, triCountBuf, dataBuf]);
  fs.writeFileSync(outPath, outBuf);
}

async function mergeStlFiles(inputFiles, mergedOutPath) {
  const allTriangles = [];
  let header = null;

  for (const file of inputFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`입력 STL 파일을 찾을 수 없습니다: ${file}`);
    }
    console.log(`Reading STL for merge: ${file}`);
    const buf = fs.readFileSync(file);
    const { header: h, triangles } = readBinaryStlTriangles(buf);
    if (!header) header = h;
    allTriangles.push(...triangles);
  }

  console.log(`Total triangles before dedupe: ${allTriangles.length}`);

  const seen = new Map();
  const unique = [];
  for (const tri of allTriangles) {
    const key = triangleKey(tri);
    if (!seen.has(key)) {
      seen.set(key, true);
      unique.push(tri);
    }
  }

  console.log(`Total triangles after dedupe: ${unique.length}`);

  writeBinaryStl(header, unique, mergedOutPath);
  console.log(`Merged STL written to: ${mergedOutPath}`);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  // files 폴더 내의 모든 .dcm 파일을 자동으로 찾는다.
  const dcmFiles = fs
    .readdirSync(DCM_DIR)
    .filter((name) => name.toLowerCase().endsWith(".dcm"))
    .sort();

  if (dcmFiles.length === 0) {
    throw new Error(`DCM 폴더에 .dcm 파일이 없습니다: ${DCM_DIR}`);
  }

  const filePaths = dcmFiles.map((name) => path.join(DCM_DIR, name));

  // 머지 결과 파일 이름: 마지막 DCM 파일명을 기준으로, ScanAbutment_ 접두사는 제거하고 .stl 확장자로 저장
  const lastDcm = dcmFiles[dcmFiles.length - 1];
  const lastBase = path.basename(lastDcm, path.extname(lastDcm));
  const mergedBase = lastBase.replace(/^ScanAbutment_?/i, "");
  const mergedOutPath = path.join(OUTPUT_DIR, `${mergedBase}.stl`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const stlFiles = [];

  try {
    // 파일 입력이 multiple이 아니므로, 각 DCM 파일마다 페이지를 새로 로드해서 업로드/변환한다.
    for (const dcmPath of filePaths) {
      const baseName = path.basename(dcmPath, path.extname(dcmPath));
      console.log(`Opening dcm2stl.appspot.com for: ${baseName}`);

      await page.goto("https://dcm2stl.appspot.com/", {
        waitUntil: "networkidle",
        timeout: 120000,
      });

      // NOTE: 사이트 DOM 구조에 따라 셀렉터는 조정될 수 있습니다.
      const fileInput = page.locator('input[type="file"]').first();
      const convertButton = page.getByRole("button", {
        name: /convert|upload|start/i,
      });

      console.log(`Uploading and converting: ${baseName}`);

      await fileInput.setInputFiles(dcmPath, { timeout: 120000 });

      await convertButton.click();
      console.log("Conversion started, waiting for download...");

      const download = await page.waitForEvent("download", { timeout: 300000 });
      const suggestedName = download.suggestedFilename();
      const ext = path.extname(suggestedName || "").toLowerCase();

      // 개별 STL은 최종 결과와 이름이 겹치지 않도록 항상 __tmp 접미사를 붙여 저장한다.
      const outFileName = `${baseName}__tmp.stl`;
      const savePath = path.join(OUTPUT_DIR, outFileName);

      await download.saveAs(savePath);
      console.log(`Downloaded file saved to: ${savePath}`);
      if (path.extname(savePath).toLowerCase() === ".stl") {
        stlFiles.push(savePath);
      } else {
        console.warn(
          `경고: STL이 아닌 파일 형식(${savePath})은 자동 머지 대상에서 제외됩니다.`
        );
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (stlFiles.length > 0) {
    await mergeStlFiles(stlFiles, mergedOutPath);

    // 개별 STL 파일은 더 이상 필요 없으므로 삭제한다.
    for (const file of stlFiles) {
      try {
        fs.unlinkSync(file);
        console.log(`Deleted temporary STL: ${file}`);
      } catch (err) {
        console.warn(`STL 삭제 실패 (${file}):`, err.message || err);
      }
    }
  } else {
    console.warn("병합할 STL 파일이 없어 merged STL을 생성하지 못했습니다.");
  }
}

main().catch((err) => {
  console.error("Conversion failed:", err);
  process.exit(1);
});
