// 업로드 ZIP을 메모리에서 푼다. 압축 폭탄을 막으려고 항목 수·항목별·전체 해제 크기를 제한한다.
// fflate는 선언된 해제 크기만큼만 버퍼를 잡고 넘치는 출력은 버리므로, 선언 크기 검사가 곧 상한이다.
// 원하는 항목(want)만 풀고 나머지는 이름만 센다. 디스크에는 쓰지 않는다.
// related files:
// - web/backend/services/scanbodyLibraryImport.service.js
import { unzipSync } from "fflate";
import { ScanbodyInputError } from "./scanbodyGeometry.js";

export function isZip(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export function normalizeEntryName(name) {
  return String(name || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "");
}

/**
 * @param {Uint8Array} buffer
 * @param {{ want: (name: string) => boolean, maxEntries: number, maxEntryBytes: number, budget: { remaining: number }, label?: string }} opts
 * budget는 여러 ZIP(묶음 안 .dme)이 전체 해제 크기를 나눠 쓰도록 호출자가 넘긴다.
 * @returns {{ files: Map<string, Uint8Array>, entryCount: number, ignored: string[] }}
 */
export function safeUnzip(buffer, { want, maxEntries, maxEntryBytes, budget, label = "압축 파일" }) {
  if (!isZip(buffer)) throw new ScanbodyInputError(`${label}이 ZIP 형식이 아닙니다.`);
  let entryCount = 0;
  const ignored = [];
  let raw;
  try {
    raw = unzipSync(buffer, {
      filter(file) {
        entryCount += 1;
        if (entryCount > maxEntries) {
          throw new ScanbodyInputError(`${label} 안 파일이 너무 많습니다(최대 ${maxEntries}개).`);
        }
        const name = normalizeEntryName(file.name);
        if (!name || name.endsWith("/")) return false;
        if (name.includes("\0")) throw new ScanbodyInputError(`${label} 안 파일 이름이 올바르지 않습니다.`);
        if (!want(name)) {
          ignored.push(name);
          return false;
        }
        if (file.compression !== 0 && file.compression !== 8) {
          throw new ScanbodyInputError(`${label} 안 ${name}의 압축 방식을 지원하지 않습니다.`);
        }
        if (file.originalSize > maxEntryBytes) {
          throw new ScanbodyInputError(`${label} 안 ${name}이 너무 큽니다.`);
        }
        budget.remaining -= file.originalSize;
        if (budget.remaining < 0) throw new ScanbodyInputError("압축을 푼 전체 크기가 허용량을 넘습니다.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ScanbodyInputError) throw error;
    throw new ScanbodyInputError(`${label}을 풀지 못했습니다. 손상됐거나 암호가 걸린 파일입니다.`);
  }
  const files = new Map();
  for (const [name, data] of Object.entries(raw)) files.set(normalizeEntryName(name), data);
  return { files, entryCount, ignored };
}
