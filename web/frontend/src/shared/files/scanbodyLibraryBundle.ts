// 스캔바디 라이브러리 업로드 묶음. 해석은 서버가 하고, 브라우저는 필요한 파일만 골라 ZIP으로 묶는다.
// - 3Shape `.dme`: 한 개면 그대로, 여러 개면 25MB 안팎으로 묶는다(이미 압축돼 STORE).
//   .dme도 zip이라 GuardDuty가 안쪽 파일까지 센다. 묶음 하나의 파일 수가 한도를 넘으면 UNSUPPORTED로 거절되니
//   용량과 함께 안쪽 파일 수(SCAN_FILES)로도 나눈다. 작게 나누면 검사도 병렬로 빨리 끝난다.
//   제조사 배포 .zip 안의 .dme도 꺼내 같이 묶는다.
// - exocad: config.xml과 .stl만 넣는다(.sdfa 등 암호화 형상은 서버도 못 읽어서 뺀다).
//   .zip은 안쪽 zip까지 3단계 열어 같은 파일만 꺼낸다. config.xml 폴더 단위로 나눠 묶는다.
// - 제조사 형상(.dcm·.stl·.stp·.step): config.xml 없는 파일은 한 개면 그대로, 여러 개면 zip으로 올린다.
// 서버는 이 규칙을 믿지 않고 다시 검사한다(scanbodyLibraryImport.service.js).
// related files:
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/backend/services/scanbodyLibraryImport.service.js

export type ScanbodyUploadBundle = {
  fileName: string;
  blob: Blob;
  /** 목록에 보여 줄 설명. */
  label: string;
};

const BUNDLE_BYTES = 25 * 1024 * 1024;
/** GuardDuty 압축 한 개 검사 한도(문서 1,000개, 안쪽 압축 포함)보다 여유 있게. */
const SCAN_FILES = 800;
const MAX_NESTED_ZIP_BYTES = 1536 * 1024 * 1024;
const MAX_ZIP_DEPTH = 3;

type Entry = { path: string; data: Blob };

const relPath = (file: File) =>
  (file.webkitRelativePath || file.name).replace(/\\/g, "/").replace(/^\/+/, "");
const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const wanted = (path: string) => /(^|\/)config\.xml$/i.test(path) || /\.stl$/i.test(path);
const looseShape = (path: string) => /\.(dcm|stp|step)$/i.test(path);
const leafName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

async function zipEntries(entries: readonly Entry[], compress: boolean): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, entry.data);
  return zip.generateAsync({
    type: "blob",
    compression: compress ? "DEFLATE" : "STORE",
    compressionOptions: { level: 6 },
  });
}

/** 크기·파일 수 합이 한도를 넘지 않게 순서대로 나눈다. 하나가 한도보다 크면 혼자 간다. */
function pack<T>(items: readonly T[], size: (item: T) => number, count: (item: T) => number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  let files = 0;
  for (const item of items) {
    const n = size(item);
    const c = count(item);
    if (cur.length > 0 && (bytes + n > BUNDLE_BYTES || files + c > SCAN_FILES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
      files = 0;
    }
    cur.push(item);
    bytes += n;
    files += c;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** zip(.dme) 안 항목 수. 끝 레코드에서 읽고, 못 읽으면 한도만큼으로 봐서 혼자 묶이게 한다. */
async function zipEntryCount(data: Blob): Promise<number> {
  const tail = new Uint8Array(await data.slice(Math.max(0, data.size - 22 - 0xffff)).arrayBuffer());
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] !== 0x50 || tail[i + 1] !== 0x4b || tail[i + 2] !== 5 || tail[i + 3] !== 6) continue;
    const total = tail[i + 10]! | (tail[i + 11]! << 8);
    return total === 0xffff ? SCAN_FILES : total + 1;
  }
  return SCAN_FILES;
}

/**
 * ZIP64 끝 레코드가 있는데 일반 끝 레코드(EOCD) 값을 0xFFFF로 채우지 않은 zip(GeoMedi 3Shape 등)을
 * JSZip 3.10은 ZIP64로 보지 않고 끝 레코드 길이만큼 오프셋을 밀어 읽어 항목이 0개가 된다.
 * EOCD 바로 앞에 ZIP64 locator가 있으면 디스크 번호를 0xFFFF로 바꿔 ZIP64 경로로 읽게 한다.
 */
function markZip64Eocd(bytes: Uint8Array): Uint8Array {
  const sig = (at: number, b3: number, b4: number) =>
    bytes[at] === 0x50 && bytes[at + 1] === 0x4b && bytes[at + 2] === b3 && bytes[at + 3] === b4;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (!sig(i, 5, 6)) continue;
    if (i >= 20 && sig(i - 20, 6, 7)) {
      bytes[i + 4] = 0xff;
      bytes[i + 5] = 0xff;
    }
    break;
  }
  return bytes;
}

/**
 * 제조사가 배포한 zip 안의 exocad 파일(config.xml·.stl), 3Shape .dme, 형상(.dcm·.stp).
 * 제조사 zip은 zip 안에 zip을 넣어 배포하기도 해서(GeoMedi exocad) 안쪽 zip도 MAX_ZIP_DEPTH까지 연다.
 */
async function entriesFromZip(
  data: Blob,
  label: string,
  prefix: string,
  notes: string[],
  depth = 1,
): Promise<{ exocad: Entry[]; dmes: Entry[]; meshes: Entry[] }> {
  const out = { exocad: [] as Entry[], dmes: [] as Entry[], meshes: [] as Entry[] };
  if (data.size > MAX_NESTED_ZIP_BYTES) {
    notes.push(`${label}: 너무 커서 건너뛰었습니다. 풀어서 폴더로 올려 주세요.`);
    return out;
  }
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(markZip64Eocd(new Uint8Array(await data.arrayBuffer())));
  } catch {
    notes.push(`${label}: 열지 못했습니다.`);
    return out;
  }
  for (const key of Object.keys(zip.files)) {
    const entry = zip.files[key]!;
    const name = entry.name.replace(/\\/g, "/");
    if (entry.dir || name.startsWith("__MACOSX/")) continue;
    if (/\.dme$/i.test(name)) {
      out.dmes.push({ path: leafName(name), data: await entry.async("blob") });
    } else if (wanted(name)) {
      out.exocad.push({ path: `${prefix}/${name}`, data: await entry.async("blob") });
    } else if (looseShape(name)) {
      out.meshes.push({ path: `${prefix}/${name}`, data: await entry.async("blob") });
    } else if (/\.zip$/i.test(name) && depth < MAX_ZIP_DEPTH) {
      const inner = await entriesFromZip(
        await entry.async("blob"),
        `${label}/${name}`,
        `${prefix}/${name.replace(/\.zip$/i, "")}`,
        notes,
        depth + 1,
      );
      out.exocad.push(...inner.exocad);
      out.dmes.push(...inner.dmes);
      out.meshes.push(...inner.meshes);
    }
  }
  return out;
}

/** 고른 파일(또는 폴더)을 업로드 묶음으로 만든다. */
export async function buildScanbodyUploadBundles(
  files: readonly File[],
): Promise<{ bundles: ScanbodyUploadBundle[]; notes: string[] }> {
  const notes: string[] = [];
  const bundles: ScanbodyUploadBundle[] = [];

  const entries: Entry[] = files
    .filter((file) => wanted(relPath(file)))
    .map((file) => ({ path: relPath(file), data: file }));
  const meshes: Entry[] = files
    .filter((file) => looseShape(relPath(file)))
    .map((file) => ({ path: relPath(file), data: file }));
  const dmes: Entry[] = files
    .filter((file) => /\.dme$/i.test(file.name))
    .map((file) => ({ path: file.name, data: file }));
  for (const file of files.filter((row) => /\.zip$/i.test(row.name))) {
    const found = await entriesFromZip(file, file.name, relPath(file).replace(/\.zip$/i, ""), notes);
    entries.push(...found.exocad);
    dmes.push(...found.dmes);
    meshes.push(...found.meshes);
  }

  if (dmes.length === 1) {
    bundles.push({ fileName: dmes[0]!.path, blob: dmes[0]!.data, label: dmes[0]!.path });
  } else if (dmes.length > 1) {
    const counts = new Map(await Promise.all(dmes.map(async (entry) => [entry, await zipEntryCount(entry.data)] as const)));
    const groups = pack(
      dmes,
      (entry) => entry.data.size,
      (entry) => counts.get(entry) ?? SCAN_FILES,
    );
    for (const [i, group] of groups.entries()) {
      bundles.push({
        fileName: `3shape-${i + 1}.zip`,
        blob: await zipEntries(group, false),
        label: `3Shape .dme ${group.length}개${groups.length > 1 ? ` (${i + 1}/${groups.length})` : ""}`,
      });
    }
  }
  const configDirs = new Set(
    entries.filter((entry) => /(^|\/)config\.xml$/i.test(entry.path)).map((entry) => dirOf(entry.path)),
  );
  if (configDirs.size > 0) {
    const groups = [...configDirs].sort().map((dir) => entries.filter((entry) => dirOf(entry.path) === dir));
    const packs = pack(
      groups,
      (group) => group.reduce((n, entry) => n + entry.data.size, 0),
      (group) => group.length,
    );
    for (const [i, group] of packs.entries()) {
      bundles.push({
        fileName: `exocad-${i + 1}.zip`,
        blob: await zipEntries(group.flat(), true),
        label: `exocad 라이브러리 ${group.length}개${packs.length > 1 ? ` (${i + 1}/${packs.length})` : ""}`,
      });
    }
  }
  for (const entry of entries) {
    if (/\.stl$/i.test(entry.path) && !configDirs.has(dirOf(entry.path))) meshes.push(entry);
  }
  if (meshes.length === 1 && bundles.length === 0) {
    const one = meshes[0]!;
    bundles.push({ fileName: leafName(one.path), blob: one.data, label: leafName(one.path) });
  } else if (meshes.length > 0) {
    const groups = pack(meshes, (entry) => entry.data.size, () => 1);
    for (const [i, group] of groups.entries()) {
      bundles.push({
        fileName: `scanbody-meshes-${i + 1}.zip`,
        blob: await zipEntries(group, true),
        label: `스캔바디 형상 ${group.length}개${groups.length > 1 ? ` (${i + 1}/${groups.length})` : ""}`,
      });
    }
  }

  const skipped = files.filter((file) => /\.(sdfa|ipflib)$/i.test(file.name)).length;
  if (skipped > 0) notes.push(`암호화된 형상(.sdfa·.ipflib) ${skipped}개는 읽을 수 없어 뺐습니다.`);
  return { bundles, notes };
}
