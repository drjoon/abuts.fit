// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// - web/frontend/src/shared/hooks/useS3TempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/features/chat/components/ChatComposer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { useCallback, useMemo, useRef, useState } from "react";
import {
  chatAttachmentOpensWorkFiles,
  chatFileOpensWorkFiles,
} from "@/shared/chat/chatOpenWorkFiles";
import { useToast } from "@/shared/hooks/use-toast";
import {
  toTempUploadFileKey,
  useFilePreUpload,
} from "@/shared/hooks/useFilePreUpload";
import type { TempUploadedFile } from "@/shared/hooks/useS3TempUpload";

export type BackgroundUploadStatus =
  | "queued"
  | "uploading"
  | "done"
  | "error";

export type BackgroundUploadItem = {
  id: string;
  file: File;
  fileKey: string;
  progressKey: string;
  status: BackgroundUploadStatus;
  progress: number;
  result?: TempUploadedFile;
  error?: string;
  /** 채팅 썸네일 클릭 시 작업 파일 프리뷰를 연다. */
  openWorkFiles?: boolean;
};

export type ChatMessageAttachment = {
  fileId?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  s3Url: string;
  openWorkFiles?: boolean;
};

type Options = {
  token?: string | null;
};

const progressKeyOf = (file: File) => toTempUploadFileKey(file);

const toErrorMessage = (err: unknown) =>
  err instanceof Error
    ? err.message
    : String(err || "파일 업로드에 실패했습니다.");

export function toChatMessageAttachments(
  files: TempUploadedFile[],
  extras?: Array<{ openWorkFiles?: boolean } | undefined>,
): ChatMessageAttachment[] {
  return files
    .map((file, index) => {
      const fileId = String(file._id || "").trim();
      const s3Key = String(file.key || "").trim();
      const s3Url = String(file.location || "").trim();
      if (!s3Key || !s3Url) return null;
      return {
        fileId: fileId || undefined,
        fileName: String(file.originalName || "").trim(),
        fileType: String(
          file.mimetype || file.fileType || "application/octet-stream",
        ).trim(),
        fileSize: Number(file.size || 0),
        s3Key,
        s3Url,
        ...((extras?.[index]?.openWorkFiles ||
        chatAttachmentOpensWorkFiles({
          fileName: String(file.originalName || "").trim(),
        }))
          ? { openWorkFiles: true }
          : {}),
      };
    })
    .filter((row): row is ChatMessageAttachment => Boolean(row?.fileName));
}

/**
 * 첨부 직후 S3 임시 업로드를 백그라운드로 시작하고, 파일별 진행률을 유지한다.
 * 제출/전송 시 ensureUploaded로 이미 올라간 결과를 재사용한다.
 */
export function useBackgroundTempUpload(options: Options) {
  const { token } = options;
  const { toast } = useToast();
  const {
    ensureFilesUploaded,
    forgetFile,
    clearPreUploadCache,
  } = useFilePreUpload({ token });
  const [items, setItems] = useState<BackgroundUploadItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const runSeqRef = useRef(0);

  const patchByFileKeys = useCallback(
    (
      fileKeys: Set<string>,
      updater: (item: BackgroundUploadItem) => BackgroundUploadItem,
    ) => {
      setItems((prev) =>
        prev.map((item) => (fileKeys.has(item.fileKey) ? updater(item) : item)),
      );
    },
    [],
  );

  const runUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const fileKeys = new Set(files.map((file) => toTempUploadFileKey(file)));
      const seq = ++runSeqRef.current;

      patchByFileKeys(fileKeys, (item) =>
        item.status === "done"
          ? item
          : { ...item, status: "uploading", error: undefined },
      );

      try {
        const uploaded = await ensureFilesUploaded(files, (progressMap) => {
          setItems((prev) =>
            prev.map((item) => {
              if (!fileKeys.has(item.fileKey) || item.status === "done") {
                return item;
              }
              const pct = progressMap[item.progressKey];
              if (typeof pct !== "number") return item;
              return {
                ...item,
                status: "uploading",
                progress: Math.max(0, Math.min(100, pct)),
              };
            }),
          );
        });

        setItems((prev) =>
          prev.map((item) => {
            const index = files.findIndex(
              (file) => toTempUploadFileKey(file) === item.fileKey,
            );
            if (index < 0) return item;
            const result = uploaded[index];
            if (!result) return item;
            return {
              ...item,
              status: "done",
              progress: 100,
              result,
              error: undefined,
            };
          }),
        );
      } catch (err) {
        if (seq !== runSeqRef.current) return;
        patchByFileKeys(fileKeys, (item) =>
          item.status === "done"
            ? item
            : {
                ...item,
                status: "error",
                error: toErrorMessage(err),
              },
        );
      }
    },
    [ensureFilesUploaded, patchByFileKeys],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const incoming = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!incoming.length) return;

      const currentToken = String(tokenRef.current || "").trim();
      if (!currentToken) {
        toast({
          title: "로그인이 필요합니다",
          description: "파일을 올리려면 먼저 로그인하세요.",
          variant: "destructive",
        });
        return;
      }

      const existing = new Set(itemsRef.current.map((item) => item.fileKey));
      const nextItems: BackgroundUploadItem[] = [];
      const nextFiles: File[] = [];

      for (const file of incoming) {
        const fileKey = toTempUploadFileKey(file);
        if (existing.has(fileKey)) continue;
        existing.add(fileKey);
        nextFiles.push(file);
        nextItems.push({
          id: fileKey,
          file,
          fileKey,
          progressKey: progressKeyOf(file),
          status: "queued",
          progress: 0,
          ...(chatFileOpensWorkFiles(file) ? { openWorkFiles: true } : {}),
        });
      }

      if (!nextItems.length) return;

      setItems((prev) => [...prev, ...nextItems]);
      void runUpload(nextFiles);
    },
    [runUpload, toast],
  );

  const removeItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (target) forgetFile(target.file);
      setItems((prev) => prev.filter((item) => item.id !== id));
    },
    [forgetFile],
  );

  /** 페인트 썸네일 순서를 첨부 목록의 같은 칸에 다시 놓는다. */
  const orderItems = useCallback((orderedIds: string[]) => {
    if (!orderedIds.length) return;
    setItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      const ranked = orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is BackgroundUploadItem => Boolean(item));
      if (ranked.length === 0) return prev;
      const rankSet = new Set(ranked.map((item) => item.id));
      let cursor = 0;
      return prev.map((item) => {
        if (!rankSet.has(item.id)) return item;
        const next = ranked[cursor];
        cursor += 1;
        return next ?? item;
      });
    });
  }, []);

  const retryItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target) return;
      forgetFile(target.file);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "queued",
                progress: 0,
                error: undefined,
                result: undefined,
              }
            : item,
        ),
      );
      void runUpload([target.file]);
    },
    [forgetFile, runUpload],
  );

  const clear = useCallback(() => {
    clearPreUploadCache();
    setItems([]);
  }, [clearPreUploadCache]);

  const ensureUploaded = useCallback(async (): Promise<TempUploadedFile[]> => {
    const current = itemsRef.current;
    if (!current.length) return [];

    const files = current.map((item) => item.file);
    const uploaded = await ensureFilesUploaded(files, (progressMap) => {
      setItems((prev) =>
        prev.map((item) => {
          const pct = progressMap[item.progressKey];
          if (typeof pct !== "number" || item.status === "done") return item;
          return {
            ...item,
            status: "uploading",
            progress: Math.max(0, Math.min(100, pct)),
            error: undefined,
          };
        }),
      );
    });

    setItems((prev) =>
      prev.map((item, index) => {
        const result = uploaded[index];
        if (!result) return item;
        return {
          ...item,
          status: "done",
          progress: 100,
          result,
          error: undefined,
        };
      }),
    );

    return uploaded;
  }, [ensureFilesUploaded]);

  const ensureChatAttachments = useCallback(async () => {
    const uploaded = await ensureUploaded();
    return toChatMessageAttachments(uploaded, itemsRef.current);
  }, [ensureUploaded]);

  const isUploading = items.some(
    (item) => item.status === "queued" || item.status === "uploading",
  );
  const hasError = items.some((item) => item.status === "error");

  return useMemo(
    () => ({
      items,
      addFiles,
      removeItem,
      orderItems,
      retryItem,
      clear,
      ensureUploaded,
      ensureChatAttachments,
      isUploading,
      hasError,
    }),
    [
      addFiles,
      clear,
      ensureUploaded,
      ensureChatAttachments,
      hasError,
      isUploading,
      items,
      removeItem,
      orderItems,
      retryItem,
    ],
  );
}
