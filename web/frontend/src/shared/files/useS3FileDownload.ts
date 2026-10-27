// change-log:
// - 2026-09-28: DCM → STL 변환 저장(PLY와 같은 경로).
// - 2026-09-27: Mac도 연결 프로그램 흐름(설치 안내·저장·Finder로 열기). 안내를 닫으면 브라우저 저장 또는 zip.
// - 2026-09-27: saveToLabWorkFolder — Windows 연결 프로그램(v3)이 있으면 케이스 폴더에 풀어서 저장하고 탐색기로 연다.
//   reuseSaved면 이미 받은 파일은 건너뛰고 폴더만 연다. 없으면 Chrome·Edge 폴더 저장 → Windows는 설치 안내 → zip.
//   labSaveProgress(0~100, 크기 가중)로 버튼 진행률.
// - 2026-09-27: 로컬 헬퍼 폐기 — saveToLabWorkFolder는 브라우저만으로 케이스 폴더 저장(미지원 브라우저는 zip).
//   openInDesignSoftware 삭제(3Shape·exocad는 인자로 주문 등록 불가).
// - 2026-09-27: 헬퍼 v2 — 작업열기·다운로드 모두 작업 폴더(케이스 폴더)에 저장. saveToLabWorkFolder 추가.
// - 2026-09-27: 열기 — 헬퍼 대기·파일 준비가 길면 onOpenPhase로 화면 상태.
// - 2026-09-24: openInDesignSoftware — 로컬 CAD 헬퍼로 3D 모델 열기(3Shape/ExoCAD).
// - 2026-09-20: downloadAsZip — 여러 S3 파일을 DEFLATE zip 하나로 저장.
// - 2026-10-27: 기공소 저장은 고른 포맷(DCM·PLY·STL). .3ox·.3oxz 스캔도 그 포맷으로 푼다.
// - 2026-09-10: DCM 다운로드 시 PLY(칼라) 클라이언트 변환 옵션.
// - 2026-08-16: IndexedDB(s3:key) 캐시 — 다운로드·프리뷰 공통.
// - 2026-08-16: fetchS3Blob — 프리뷰용 blob fetch(저장 없음).
// related files:
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/shared/files/hpsDcmToPly.ts
// - web/frontend/src/shared/files/dcmDownloadFormat.ts
// - web/frontend/src/shared/files/labWorkFolder.ts
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
import { useCallback, useRef, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { saveBlobAsDownload } from "@/shared/files/downloadWithProgress";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import {
  readDcmDownloadFormat,
  writeDcmDownloadFormat,
  type DcmDownloadFormat,
} from "@/shared/files/dcmDownloadFormat";
import { replaceExt } from "@/shared/files/hpsDcmToPly";
import {
  materializeLabDownload,
  planLabDownloadFile,
} from "@/shared/files/labDownloadMeshes";
import {
  clearLabWorkFolderHandle,
  dedupeLabCaseFiles,
  uniqueLabCaseFileName,
  ensureLabWorkFolderPermission,
  findMissingInLabCaseFolder,
  labCaseFolderLabel,
  readLabWorkFolderHandle,
  supportsLabWorkFolder,
  writeLabCaseFile,
} from "@/shared/files/labWorkFolder";
import {
  checkLabHelperCase,
  findLabHelper,
  LAB_HELPER_CURRENT_VERSION,
  LabHelperError,
  putLabHelperCaseFile,
  readLabHelperInstallDeclined,
  readLabHelperWorkFolder,
  supportsLabHelper,
  revealLabHelperCase,
  writeLabHelperInstallDeclined,
  writeLabHelperWorkFolder,
  type LabHelperHealth,
} from "@/shared/files/labHelperClient";

/** missing: 처음, denied: 저장한 폴더 권한 거절, not_found: 폴더가 사라짐 */
export type LabWorkFolderAskReason = "missing" | "denied" | "not_found";

/** helper: Windows 연결 프로그램 경로, browser: Chrome·Edge 폴더 핸들 */
export type LabWorkFolderMode = "helper" | "browser";

export type LabWorkFolderPick =
  | { kind: "helper"; path: string }
  | { kind: "browser"; handle: FileSystemDirectoryHandle };

/** 작업 폴더를 사용자에게 받는다. 취소면 null. */
export type LabWorkFolderResolver = (ctx: {
  reason: LabWorkFolderAskReason;
  mode: LabWorkFolderMode;
}) => Promise<LabWorkFolderPick | null>;

export type LabWorkFolderSaveResult = {
  /** helper: 연결 프로그램으로 저장·폴더 열기, folder: 브라우저가 직접 저장, zip: 케이스 폴더 이름 zip */
  mode: "helper" | "folder" | "zip";
  /** 케이스 폴더 경로 또는 zip 파일명 */
  folder: string;
  /** 이번에 새로 받은 파일 수. 0이면 이미 저장된 케이스 */
  count: number;
  /** 탐색기로 폴더를 열었는지 */
  revealed: boolean;
};

export type S3DownloadTarget = {
  s3Key?: string;
  fileName?: string;
  busyKey?: string;
  /** 원본 크기(byte). 진행률 가중치·이미 받은 파일 확인에 쓴다. */
  size?: number;
  /** 받을 포맷. 생략 시 localStorage 선호. */
  dcmFormat?: DcmDownloadFormat;
  /**
   * true: 의뢰·작업 스캔 메시를 포맷에 맞춘다.
   * false: 어벗 디자인·보철물은 올린 그대로.
   * 생략: DCM·PLY·OBJ·묶음과, 이름이 스캔인 STL만.
   */
  labFormat?: boolean;
};

export type ZipDownloadGroup = {
  /** zip 안 폴더. 비우면 루트. */
  folder?: string;
  files: S3DownloadTarget[];
};

function sanitizeZipSegment(name: string, fallback: string): string {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function uniqueZipEntryPath(
  used: Set<string>,
  folder: string,
  fileName: string,
): string {
  const safeFolder = folder ? sanitizeZipSegment(folder, "") : "";
  const base = sanitizeZipSegment(fileName, "file");
  const prefix = safeFolder ? `${safeFolder}/` : "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let candidate = `${prefix}${base}`;
  if (!used.has(candidate.toLowerCase())) {
    used.add(candidate.toLowerCase());
    return candidate;
  }
  let index = 2;
  while (used.has(`${prefix}${stem} (${index})${ext}`.toLowerCase())) {
    index += 1;
  }
  candidate = `${prefix}${stem} (${index})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function sanitizeZipArchiveName(name: string): string {
  const stem = sanitizeZipSegment(String(name || "").replace(/\.zip$/i, ""), "download");
  return `${stem}.zip`;
}

export function s3DownloadBusyKey(file: {
  s3Key?: string;
  id?: string;
  fileId?: string;
}): string {
  return String(file.s3Key || file.id || file.fileId || "").trim();
}

export function buildS3ProxyDownloadUrl(
  s3Key: string,
  fileName: string,
  opts?: { thumbW?: number },
): string {
  const name = String(fileName || "download").trim() || "download";
  const params = new URLSearchParams({
    key: s3Key,
    fileName: name,
    _ts: String(Date.now()),
  });
  const thumbW = Number(opts?.thumbW);
  if (Number.isFinite(thumbW) && thumbW > 0) {
    params.set("thumbW", String(Math.floor(thumbW)));
  }
  return `/api/files/s3/download?${params.toString()}`;
}

export function useS3FileDownload(token?: string | null) {
  const { toast } = useToast();
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [downloadProgressByKey, setDownloadProgressByKey] = useState<
    Record<string, number>
  >({});
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [downloadZipBusy, setDownloadZipBusy] = useState(false);
  const [openInCadBusy, setOpenInCadBusy] = useState(false);
  /** 작업 폴더 저장 진행률 0~100. 저장 중이 아니면 null */
  const [labSaveProgress, setLabSaveProgress] = useState<number | null>(null);
  const downloadZipBusyRef = useRef(false);
  const labSaveBusyRef = useRef(false);
  const helperUpdateAskedRef = useRef(false);
  const downloadingKeysRef = useRef<Set<string>>(new Set());

  const beginBusy = useCallback((busyKey: string) => {
    if (!busyKey) return;
    downloadingKeysRef.current.add(busyKey);
    setDownloadingKeys(Array.from(downloadingKeysRef.current));
    setDownloadProgressByKey((prev) => ({ ...prev, [busyKey]: 0 }));
  }, []);

  const endBusy = useCallback((busyKey: string) => {
    if (!busyKey) return;
    downloadingKeysRef.current.delete(busyKey);
    setDownloadingKeys(Array.from(downloadingKeysRef.current));
    setDownloadProgressByKey((prev) => {
      const next = { ...prev };
      delete next[busyKey];
      return next;
    });
  }, []);

  const loadCachedBlob = useCallback(
    async (
      file: S3DownloadTarget & {
        signal?: AbortSignal;
        onPercent?: (percent: number) => void;
      },
    ) => {
      const s3Key = String(file.s3Key || "").trim();
      const fileName = String(file.fileName || "download").trim() || "download";
      if (!token) throw new Error("로그인이 필요합니다.");
      if (!s3Key) throw new Error("파일 키가 없어 불러올 수 없습니다.");

      return fetchS3BlobCached({
        s3Key,
        fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: file.signal,
        onProgress: (percent) => {
          file.onPercent?.(percent);
          const busyKey = String(file.busyKey || s3Key).trim();
          if (!busyKey) return;
          setDownloadProgressByKey((prev) => ({
            ...prev,
            [busyKey]: percent,
          }));
        },
      });
    },
    [token],
  );

  const downloadS3File = useCallback(
    async (file: S3DownloadTarget) => {
      const s3Key = String(file.s3Key || "").trim();
      const fileName = String(file.fileName || "download").trim() || "download";
      const busyKey = String(file.busyKey || s3Key).trim();

      if (!token) return;
      if (!s3Key) {
        toast({
          title: "다운로드 실패",
          description: "파일 키가 없어 다운로드할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }
      if (busyKey && downloadingKeysRef.current.has(busyKey)) return;

      beginBusy(busyKey);

      try {
        const blob = await loadCachedBlob(file);
        const format = file.dcmFormat || readDcmDownloadFormat();
        if (file.dcmFormat) writeDcmDownloadFormat(file.dcmFormat);
        const pieces = await materializeLabDownload({
          blob,
          fileName,
          format,
          labFormat: file.labFormat,
        });
        if (pieces.length <= 1) {
          const piece = pieces[0];
          saveBlobAsDownload(piece?.blob || blob, piece?.fileName || fileName);
        } else {
          const { default: JSZip } = await import("jszip");
          const zip = new JSZip();
          const used = new Set<string>();
          for (const piece of pieces) {
            zip.file(uniqueLabCaseFileName(used, piece.fileName), piece.blob);
          }
          const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
          });
          saveBlobAsDownload(zipBlob, replaceExt(fileName, "zip"));
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        toast({
          title: "다운로드 실패",
          description:
            err instanceof Error
              ? err.message
              : "다운로드 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        endBusy(busyKey);
      }
    },
    [beginBusy, endBusy, loadCachedBlob, toast, token],
  );

  const fetchS3Blob = useCallback(
    async (
      file: S3DownloadTarget & { signal?: AbortSignal },
    ): Promise<Blob | null> => {
      const s3Key = String(file.s3Key || "").trim();
      const busyKey = String(file.busyKey || s3Key).trim();

      if (!token) return null;
      if (!s3Key) {
        toast({
          title: "미리보기 실패",
          description: "파일 키가 없어 불러올 수 없습니다.",
          variant: "destructive",
        });
        return null;
      }
      if (busyKey && downloadingKeysRef.current.has(busyKey)) return null;

      beginBusy(busyKey);

      try {
        return await loadCachedBlob(file);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return null;
        toast({
          title: "미리보기 실패",
          description:
            err instanceof Error
              ? err.message
              : "파일을 불러오는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      } finally {
        endBusy(busyKey);
      }
    },
    [beginBusy, endBusy, loadCachedBlob, toast, token],
  );

  const downloadAll = useCallback(
    async (files: S3DownloadTarget[]) => {
      const targets = Array.isArray(files) ? files.filter((file) => String(file.s3Key || "").trim()) : [];
      if (!targets.length || downloadAllBusy) return;
      setDownloadAllBusy(true);
      try {
        await Promise.all(targets.map((file) => downloadS3File(file)));
      } finally {
        setDownloadAllBusy(false);
      }
    },
    [downloadAllBusy, downloadS3File],
  );

  /**
   * 의뢰 파일 전부를 작업 폴더 안 케이스 폴더에 풀어서 저장한다(작업열기·다운로드 공통).
   * 1) 연결 프로그램(Windows·Mac)이 있으면: 저장 후 탐색기·Finder로 연다. reuseSaved면 이미 받은 파일은 건너뛴다.
   * 2) 없는 Windows·Mac(모든 브라우저): onNeedHelperInstall(설치 안내) → 연결되면 1).
   *    안내를 닫으면 3) 또는 4)로 저장하고, 다음부터는 묻지 않는다(알림 「폴더 자동 열기」로 설치).
   * 3) Chrome·Edge: 폴더 핸들에 직접 쓴다(폴더 열기는 브라우저가 못 한다).
   * 4) 나머지(Firefox·Safari): 케이스 폴더 이름 zip.
   * 진행률은 labSaveProgress(크기 가중 0~100).
   */
  const saveToLabWorkFolder = useCallback(
    async (opts: {
      files: S3DownloadTarget[];
      caseFolder: string;
      dcmFormat?: DcmDownloadFormat;
      /** 버튼 「처리 중」 표시: 작업열기(open) 또는 다운로드(download) */
      busy?: "open" | "download";
      /** 케이스 폴더에 같은 파일이 이미 있으면 받지 않고 폴더만 연다 */
      reuseSaved?: boolean;
      resolveWorkFolder?: LabWorkFolderResolver;
      /** 연결 프로그램 설치 안내. 연결되면 true */
      onNeedHelperInstall?: () => Promise<boolean>;
      /** 구버전 연결 프로그램. 갱신하면 true */
      onNeedHelperUpdate?: () => Promise<boolean>;
      onSaved?: (result: LabWorkFolderSaveResult) => void;
    }) => {
      if (labSaveBusyRef.current) return;
      const targets = (Array.isArray(opts.files) ? opts.files : []).filter(
        (file) => String(file.s3Key || "").trim(),
      );
      if (!targets.length) return;
      if (!token) {
        toast({
          title: "다운로드 실패",
          description: "로그인이 필요합니다.",
          variant: "destructive",
        });
        return;
      }
      const dcmFormat = opts.dcmFormat || readDcmDownloadFormat();
      const setBusy = opts.busy === "open" ? setOpenInCadBusy : setDownloadAllBusy;
      labSaveBusyRef.current = true;
      setBusy(true);

      const planned = dedupeLabCaseFiles(
        targets.map((file) => {
          const original = String(file.fileName || "download").trim() || "download";
          const format = file.dcmFormat || dcmFormat;
          const plan = planLabDownloadFile({
            fileName: original,
            format,
            labFormat: file.labFormat,
            size: Number(file.size) || 0,
          });
          return {
            target: file,
            format,
            refresh: plan.refresh,
            fileName: plan.fileName,
            size: plan.size,
          };
        }),
      );
      type Planned = (typeof planned)[number];

      const fetchPlanned = async (
        rows: Planned[],
        write: (fileName: string, blob: Blob) => Promise<void>,
      ) => {
        const weights = rows.map((row) => Math.max(1, Number(row.target.size) || 0));
        const total = weights.reduce((a, b) => a + b, 0);
        const percents = rows.map(() => 0);
        const report = () => {
          const done = percents.reduce((acc, p, i) => acc + p * weights[i], 0) / total;
          setLabSaveProgress(Math.min(99, Math.round(done)));
        };
        setLabSaveProgress(0);
        const produced = await Promise.all(
          rows.map(async (row, i) => {
            const busyKey = String(row.target.busyKey || row.target.s3Key || "").trim();
            beginBusy(busyKey);
            try {
              const blob = await loadCachedBlob({
                ...row.target,
                onPercent: (p) => {
                  percents[i] = Math.max(0, Math.min(100, p));
                  report();
                },
              });
              const outputs = await materializeLabDownload({
                blob,
                fileName: String(row.target.fileName || row.fileName),
                format: row.format,
                labFormat: row.target.labFormat,
              });
              percents[i] = 100;
              report();
              return { row, outputs };
            } finally {
              endBusy(busyKey);
            }
          }),
        );
        const used = new Set(
          planned.filter((row) => !row.refresh).map((row) => row.fileName.toLowerCase()),
        );
        const named: Array<{ fileName: string; blob: Blob }> = [];
        for (const item of produced) {
          if (!item.row.refresh) {
            const piece = item.outputs[0];
            if (piece) named.push({ fileName: item.row.fileName, blob: piece.blob });
            continue;
          }
          for (const piece of item.outputs) {
            named.push({
              fileName: uniqueLabCaseFileName(used, piece.fileName),
              blob: piece.blob,
            });
          }
        }
        await Promise.all(named.map((item) => write(item.fileName, item.blob)));
        setLabSaveProgress(100);
        return named.length;
      };

      const askFolder = async <K extends LabWorkFolderPick["kind"]>(
        mode: LabWorkFolderMode,
        reason: LabWorkFolderAskReason,
        kind: K,
      ) => {
        const picked = opts.resolveWorkFolder
          ? await opts.resolveWorkFolder({ reason, mode })
          : null;
        return picked && picked.kind === kind
          ? (picked as Extract<LabWorkFolderPick, { kind: K }>)
          : null;
      };

      const saveWithHelper = async (
        health: LabHelperHealth,
      ): Promise<LabWorkFolderSaveResult | null> => {
        let workFolder = readLabHelperWorkFolder();
        if (!workFolder && health.workFolderExists) {
          workFolder = String(health.workFolder || "").trim();
        }
        if (!workFolder) {
          workFolder = (await askFolder("helper", "missing", "helper"))?.path || "";
          if (!workFolder) return null;
        }
        const checkWith = (folder: string) =>
          checkLabHelperCase({
            workFolder: folder,
            caseFolder: opts.caseFolder,
            files: planned.map((row) => ({ name: row.fileName, size: row.size })),
          });
        let check: Awaited<ReturnType<typeof checkLabHelperCase>>;
        try {
          check = await checkWith(workFolder);
        } catch (err) {
          if (!(err instanceof LabHelperError) || err.code !== "WORK_FOLDER_NOT_FOUND") throw err;
          writeLabHelperWorkFolder("");
          workFolder = (await askFolder("helper", "not_found", "helper"))?.path || "";
          if (!workFolder) return null;
          check = await checkWith(workFolder);
        }
        writeLabHelperWorkFolder(workFolder);
        const ref = { workFolder, caseFolder: opts.caseFolder };
        const missing = new Set(check.missing);
        const todo = opts.reuseSaved
          ? planned.filter((row) => row.refresh || missing.has(row.fileName))
          : planned;
        const written = todo.length
          ? await fetchPlanned(todo, (fileName, blob) =>
              putLabHelperCaseFile({ ...ref, name: fileName, blob }),
            )
          : 0;
        const folder = await revealLabHelperCase(ref).catch(() => "");
        return {
          mode: "helper",
          folder: folder || check.folder,
          count: written,
          revealed: Boolean(folder),
        };
      };

      const saveWithBrowser = async (): Promise<LabWorkFolderSaveResult | null> => {
        let root = await readLabWorkFolderHandle();
        if (root && !(await ensureLabWorkFolderPermission(root))) {
          root = (await askFolder("browser", "denied", "browser"))?.handle || null;
        } else if (!root) {
          root = (await askFolder("browser", "missing", "browser"))?.handle || null;
        }
        if (!root) return null;
        const findMissing = (dir: FileSystemDirectoryHandle) =>
          findMissingInLabCaseFolder({ root: dir, caseFolder: opts.caseFolder, files: planned });
        let missing: string[];
        try {
          missing = await findMissing(root);
        } catch (err) {
          if ((err as { name?: string })?.name !== "NotFoundError") throw err;
          await clearLabWorkFolderHandle();
          root = (await askFolder("browser", "not_found", "browser"))?.handle || null;
          if (!root) return null;
          missing = await findMissing(root);
        }
        const dir = root;
        const missingSet = new Set(missing);
        const todo = opts.reuseSaved
          ? planned.filter((row) => row.refresh || missingSet.has(row.fileName))
          : planned;
        const written = todo.length
          ? await fetchPlanned(todo, (fileName, blob) =>
              writeLabCaseFile({
                root: dir,
                caseFolder: opts.caseFolder,
                file: { fileName, blob },
              }),
            )
          : 0;
        return {
          mode: "folder",
          folder: labCaseFolderLabel(dir, opts.caseFolder),
          count: written,
          revealed: false,
        };
      };

      const saveAsZip = async (): Promise<LabWorkFolderSaveResult> => {
        const blobs: Array<{ fileName: string; blob: Blob }> = [];
        const written = await fetchPlanned(planned, async (fileName, blob) => {
          blobs.push({ fileName, blob });
        });
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const item of blobs) zip.file(item.fileName, item.blob);
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        const zipName = sanitizeZipArchiveName(opts.caseFolder);
        saveBlobAsDownload(zipBlob, zipName);
        return { mode: "zip", folder: zipName, count: written, revealed: false };
      };

      try {
        let result: LabWorkFolderSaveResult | null;
        let health = await findLabHelper();
        if (
          health &&
          Number(health.version || 0) < LAB_HELPER_CURRENT_VERSION &&
          opts.onNeedHelperUpdate &&
          !helperUpdateAskedRef.current
        ) {
          helperUpdateAskedRef.current = true;
          setLabSaveProgress(null);
          const updated = await opts.onNeedHelperUpdate();
          if (updated) health = (await findLabHelper()) || health;
        }
        if (health) {
          result = await saveWithHelper(health);
        } else if (
          supportsLabHelper() &&
          opts.onNeedHelperInstall &&
          !readLabHelperInstallDeclined()
        ) {
          setLabSaveProgress(null);
          const connected = await opts.onNeedHelperInstall();
          const next = connected ? await findLabHelper() : null;
          if (next) {
            result = await saveWithHelper(next);
          } else {
            writeLabHelperInstallDeclined(true);
            result = supportsLabWorkFolder() ? await saveWithBrowser() : await saveAsZip();
          }
        } else if (supportsLabWorkFolder()) {
          result = await saveWithBrowser();
        } else {
          result = await saveAsZip();
        }
        if (!result) return;
        if (opts.onSaved) opts.onSaved(result);
        else toast({ title: `작업 폴더에 ${result.count}개 저장했습니다`, description: result.folder });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        toast({
          title: "작업 폴더 저장 실패",
          description:
            err instanceof Error
              ? err.message
              : "파일을 저장하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        labSaveBusyRef.current = false;
        setBusy(false);
        setLabSaveProgress(null);
      }
    },
    [beginBusy, endBusy, loadCachedBlob, toast, token],
  );

  const downloadAsZip = useCallback(
    async (opts: { groups: ZipDownloadGroup[]; zipFileName: string }) => {
      if (downloadZipBusyRef.current) return;
      const used = new Set<string>();
      const targets = (Array.isArray(opts.groups) ? opts.groups : []).flatMap(
        (group) => {
          const folder = String(group.folder || "").trim();
          return (Array.isArray(group.files) ? group.files : [])
            .map((file) => {
              const s3Key = String(file.s3Key || "").trim();
              const fileName =
                String(file.fileName || "file").trim() || "file";
              if (!s3Key) return null;
              return {
                s3Key,
                fileName,
                busyKey: String(file.busyKey || s3Key).trim(),
                zipPath: uniqueZipEntryPath(used, folder, fileName),
              };
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row));
        },
      );
      if (!targets.length) return;
      if (!token) {
        toast({
          title: "다운로드 실패",
          description: "로그인이 필요합니다.",
          variant: "destructive",
        });
        return;
      }

      downloadZipBusyRef.current = true;
      setDownloadZipBusy(true);
      try {
        const blobs = await Promise.all(
          targets.map(async (file) => {
            const blob = await loadCachedBlob(file);
            return { zipPath: file.zipPath, blob };
          }),
        );
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const item of blobs) {
          zip.file(item.zipPath, item.blob);
        }
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        saveBlobAsDownload(zipBlob, sanitizeZipArchiveName(opts.zipFileName));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        toast({
          title: "다운로드 실패",
          description:
            err instanceof Error
              ? err.message
              : "압축 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        downloadZipBusyRef.current = false;
        setDownloadZipBusy(false);
      }
    },
    [loadCachedBlob, toast, token],
  );

  const resetDownloads = useCallback(() => {
    downloadingKeysRef.current.clear();
    downloadZipBusyRef.current = false;
    labSaveBusyRef.current = false;
    setDownloadingKeys([]);
    setDownloadProgressByKey({});
    setDownloadAllBusy(false);
    setDownloadZipBusy(false);
    setOpenInCadBusy(false);
    setLabSaveProgress(null);
  }, []);

  return {
    downloadingKeys,
    downloadProgressByKey,
    downloadAllBusy,
    downloadZipBusy,
    openInCadBusy,
    labSaveProgress,
    downloadS3File,
    fetchS3Blob,
    downloadAll,
    downloadAsZip,
    saveToLabWorkFolder,
    resetDownloads,
  };
}
