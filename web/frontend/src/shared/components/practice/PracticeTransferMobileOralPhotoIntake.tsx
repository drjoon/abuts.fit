import { useRef } from "react";
import {
  BookmarkPlus,
  Camera,
  ClipboardList,
  ImagePlus,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { useToast } from "@/shared/hooks/use-toast";
import {
  PracticeTransferRequestIntakePanel,
  type PracticeTransferRequestIntakePanelProps,
} from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { PRACTICE_TRANSFER_IMAGE_EXTENSIONS } from "@/shared/practice/practiceTransferAccept";
import type { PreUploadFileStatus } from "@/shared/hooks/useFilePreUpload";

// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceTransferAccept.ts
// - 2026-08-20: 모바일 구강스캔 — 기공소·환자명 후 구강포토 촬영·업로드·임시저장.
// - 2026-08-20: 상단 새로/최근/임시 1줄, 제목·안내 제거, 여백 보정.
// - 2026-08-20: 세그먼트 툴바·큰 촬영 CTA·터치 친화 카드.

export type PracticeTransferMobilePhotoItem = {
  key: string;
  name: string;
  previewUrl?: string | null;
  uploadPercent?: number;
  uploadStatus?: PreUploadFileStatus | "pending";
  synced?: boolean;
};

const CAMERA_INPUT_ID = "practice-oral-photo-camera-input";
const ALBUM_INPUT_ID = "practice-oral-photo-album-input";

const ORAL_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp";

const isHeicLike = (file: File) => {
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type.includes("heic") ||
    type.includes("heif")
  );
};

const extensionForOralPhoto = (file: File) => {
  const name = String(file.name || "").trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  const fromName = dot >= 0 ? name.slice(dot) : "";
  if (PRACTICE_TRANSFER_IMAGE_EXTENSIONS.has(fromName)) {
    return fromName === ".jpeg" ? ".jpg" : fromName;
  }
  const type = String(file.type || "").toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  if (type === "image/bmp") return ".bmp";
  return ".jpg";
};

export const normalizeOralPhotoFiles = (raw: File[]) => {
  const stamp = Date.now();
  return raw
    .filter((file) => file && !isHeicLike(file))
    .map((file, index) => {
      const ext = extensionForOralPhoto(file);
      const nextName = `구강포토-${stamp}-${index + 1}${ext}`;
      const mime =
        file.type && file.type.startsWith("image/")
          ? file.type
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "image/jpeg";
      return new File([file], nextName, {
        type: mime,
        lastModified: stamp + index,
      });
    });
};

type PracticeTransferMobileOralPhotoIntakeProps = {
  requestIntakeProps: PracticeTransferRequestIntakePanelProps;
  canCapture: boolean;
  photos: PracticeTransferMobilePhotoItem[];
  onPickPhotos: (files: File[]) => void;
  onRemovePhoto: (key: string) => void;
  onClearPhotos: () => void;
  onStartNew: () => void;
  onOpenDrafts: () => void;
  onOpenRecent: () => void;
  draftCount: number;
  recentActionNeededCount: number;
};

export function PracticeTransferMobileOralPhotoIntake({
  requestIntakeProps,
  canCapture,
  photos,
  onPickPhotos,
  onRemovePhoto,
  onClearPhotos,
  onStartNew,
  onOpenDrafts,
  onOpenRecent,
  draftCount,
  recentActionNeededCount,
}: PracticeTransferMobileOralPhotoIntakeProps) {
  const { toast } = useToast();
  const albumInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesFromInput = (input: HTMLInputElement | null) => {
    const next = Array.from(input?.files || []);
    if (input) input.value = "";
    if (!next.length) return;
    const skippedHeic = next.filter(isHeicLike).length;
    const normalized = normalizeOralPhotoFiles(next);
    if (skippedHeic > 0) {
      toast({
        title: "HEIC는 올릴 수 없어요",
        description: "카메라로 촬영하거나 JPG·PNG로 저장한 뒤 올려 주세요.",
        variant: "destructive",
      });
    }
    if (normalized.length) onPickPhotos(normalized);
  };

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-3.5">
      <div className="grid w-full min-w-0 grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 min-w-0 rounded-xl px-2 text-sm font-medium hover:bg-white hover:shadow-sm"
          onClick={onStartNew}
        >
          <Plus className="mr-1 h-3.5 w-3.5 shrink-0" />
          새로
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 min-w-0 gap-1 rounded-xl px-2 text-sm font-medium hover:bg-white hover:shadow-sm"
          onClick={onOpenRecent}
        >
          <ClipboardList className="h-3.5 w-3.5 shrink-0" />
          최근
          {recentActionNeededCount > 0 ? (
            <Badge className="ml-0.5 h-5 min-w-5 rounded-full border-0 bg-primary-strong px-1.5 text-[10px] tabular-nums text-white hover:bg-primary-strong">
              {recentActionNeededCount}
            </Badge>
          ) : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 min-w-0 gap-1 rounded-xl px-2 text-sm font-medium hover:bg-white hover:shadow-sm"
          onClick={onOpenDrafts}
        >
          <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
          임시
          {draftCount > 0 ? (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 text-[10px] tabular-nums"
            >
              {draftCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      <PracticeTransferRequestIntakePanel
        {...requestIntakeProps}
        showDateFields={false}
        showProsthesisSection={false}
        showMemoSection={false}
        showFeeEstimate={false}
        className="min-w-0"
      />

      <input
        id={CAMERA_INPUT_ID}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={!canCapture}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => handleFilesFromInput(e.currentTarget)}
      />
      <input
        ref={albumInputRef}
        id={ALBUM_INPUT_ID}
        type="file"
        accept={ORAL_PHOTO_ACCEPT}
        multiple
        disabled={!canCapture}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => handleFilesFromInput(e.currentTarget)}
      />

      <div className="flex min-w-0 flex-col gap-2.5">
        <label
          htmlFor={canCapture ? CAMERA_INPUT_ID : undefined}
          aria-disabled={!canCapture || undefined}
          className={cn(
            "box-border flex min-h-[9rem] w-full min-w-0 flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-3 py-5 text-center transition-[transform,colors] active:scale-[0.99]",
            canCapture
              ? "cursor-pointer border-primary/35 bg-gradient-to-b from-primary-soft/70 to-white text-primary-strong shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              : "cursor-not-allowed border-slate-200 bg-slate-50 text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "inline-flex h-14 w-14 items-center justify-center rounded-full shadow-sm",
              canCapture ? "bg-white text-primary-strong" : "bg-white text-slate-400",
            )}
          >
            <Camera className="h-6 w-6" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">구강포토 촬영</span>
        </label>

        <Button
          type="button"
          variant="outline"
          className="h-12 w-full min-w-0 rounded-2xl border-slate-200 text-base font-medium"
          disabled={!canCapture}
          onClick={() => albumInputRef.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4 shrink-0" />
          앨범에서 선택
        </Button>
      </div>

      {photos.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {photos.length}장
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={onClearPhotos}
            >
              전체삭제
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => {
              const pct = Math.max(
                0,
                Math.min(100, Math.round(photo.uploadPercent ?? 0)),
              );
              const statusLabel =
                photo.uploadStatus === "uploading"
                  ? `${pct}%`
                  : photo.uploadStatus === "error"
                    ? "실패"
                    : photo.synced || photo.uploadStatus === "done"
                      ? "동기화됨"
                      : "대기";
              return (
                <div
                  key={photo.key}
                  className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50"
                >
                  {photo.previewUrl ? (
                    <img
                      src={photo.previewUrl}
                      alt={photo.name}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-slate-400">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                  )}
                  <p
                    className={cn(
                      "truncate px-1.5 py-1 text-center text-[10px] font-medium",
                      photo.uploadStatus === "error"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {statusLabel}
                  </p>
                  {photo.uploadStatus === "uploading" ? (
                    <div className="absolute inset-x-0 bottom-6 h-1 bg-slate-200/90">
                      <div
                        className="h-full bg-primary-strong transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white active:bg-black/70"
                    aria-label={`${photo.name} 삭제`}
                    onClick={() => onRemovePhoto(photo.key)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
