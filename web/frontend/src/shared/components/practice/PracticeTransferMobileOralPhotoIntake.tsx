import { useRef } from "react";
import {
  Camera,
  ImagePlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
// - 2026-08-20: 모바일 구강스캔 — 환자명 후 구강포토 촬영·업로드·임시저장(기공소는 전송 시).
// - 2026-08-20: 상단 새로/최근/임시 1줄, 제목·안내 제거, 여백 보정.
// - 2026-08-20: 세그먼트 툴바·큰 촬영 CTA·터치 친화 카드.
// - 2026-08-20: 상단 메뉴 새로작성·임시저장 2칸만.
// - 2026-08-27: 상단 메뉴 새로작성·최근의뢰·임시저장·휴지통 4칸(2×2).
// - 2026-08-28: 최근의뢰를 2×2 왼쪽 상단으로.
// - 2026-08-28: 상단 메뉴 1줄(새로작성·임시저장·휴지). 최근의뢰 제거. hideToolbar로 헤더 이관.
// - 2026-08-28: 모바일 툴바 휴지만. 환자사진-only 안내. 임시/새로작성 제거.
// - 2026-08-28: 모바일 툴바 pill 버튼·촬영 CTA 카드 스타일.
// - 2026-08-28: 작성 모달 툴바 — 저장&새로작성·삭제&새로작성.
// - 2026-08-31: 모바일 — 사진 업로드 전용. 기공소 선택 제거, 저장/취소를 사진 영역 아래로.
// - 2026-08-20: iPhone HEIC→JPEG 변환 시도, 빈 파일 거부, MIME 보정.
// - 2026-08-20: 썸네일 클릭 시 원본 미리보기.
// - 2026-08-27: normalizeOralPhotoFiles namePrefix 옵션(채팅 사진찍기 재사용).

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

const normalizeImageMime = (type: string, ext: string) => {
  const mime = String(type || "").trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif")) {
    return mime;
  }
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
};

/** iOS 앨범 HEIC — Safari가 디코드 가능하면 JPEG로 변환. */
const tryConvertHeicToJpeg = async (file: File): Promise<File | null> => {
  if (typeof window === "undefined") return null;
  try {
    let bitmap: ImageBitmap | null = null;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
    }
    const canvas = document.createElement("canvas");
    if (bitmap) {
      canvas.width = Math.max(1, bitmap.width);
      canvas.height = Math.max(1, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } else {
      const objectUrl = URL.createObjectURL(file);
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("heic decode failed"));
          img.src = objectUrl;
        });
        canvas.width = Math.max(1, image.naturalWidth || image.width || 0);
        canvas.height = Math.max(1, image.naturalHeight || image.height || 0);
        if (!canvas.width || !canvas.height) return null;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((next) => resolve(next), "image/jpeg", 0.92);
    });
    if (!blob || blob.size <= 0) return null;
    const stamp = Date.now();
    return new File([blob], `oral-photo-${stamp}.jpg`, {
      type: "image/jpeg",
      lastModified: stamp,
    });
  } catch {
    return null;
  }
};

export const normalizeOralPhotoFiles = async (
  raw: File[],
  options?: { namePrefix?: string },
) => {
  const stamp = Date.now();
  const namePrefix = String(options?.namePrefix || "구강포토").trim() || "구강포토";
  const out: File[] = [];
  let skippedHeic = 0;
  let skippedEmpty = 0;

  for (let index = 0; index < raw.length; index += 1) {
    const file = raw[index];
    if (!file) continue;
    if (!Number.isFinite(file.size) || file.size <= 0) {
      skippedEmpty += 1;
      continue;
    }

    let source = file;
    if (isHeicLike(file)) {
      const converted = await tryConvertHeicToJpeg(file);
      if (!converted) {
        skippedHeic += 1;
        continue;
      }
      source = converted;
    }

    const ext = extensionForOralPhoto(source);
    const nextName = `${namePrefix}-${stamp}-${out.length + 1}${ext}`;
    const mime = normalizeImageMime(source.type, ext);
    out.push(
      new File([source], nextName, {
        type: mime,
        lastModified: stamp + out.length,
      }),
    );
  }

  return { files: out, skippedHeic, skippedEmpty };
};

type PracticeTransferMobileOralPhotoIntakeProps = {
  requestIntakeProps: PracticeTransferRequestIntakePanelProps;
  canCapture: boolean;
  photos: PracticeTransferMobilePhotoItem[];
  onPickPhotos: (files: File[]) => void;
  onRemovePhoto: (key: string) => void;
  onClearPhotos: () => void;
  onPreviewPhoto?: (photo: PracticeTransferMobilePhotoItem) => void;
  onSave?: () => void;
  onCancel?: () => void;
  canSave?: boolean;
};

export function PracticeTransferMobileComposeToolbar({
  onSave,
  onCancel,
  canSave = true,
  className,
}: {
  onSave: () => void;
  onCancel: () => void;
  canSave?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 shrink-0 flex-nowrap items-center justify-center gap-2.5",
        className,
      )}
    >
      <Button
        type="button"
        size="sm"
        className="h-10 min-w-[5.5rem] flex-1 rounded-full px-4 shadow-sm"
        aria-label="저장"
        title="작성 내용을 임시저장합니다"
        disabled={!canSave}
        onClick={onSave}
      >
        저장
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 min-w-[5.5rem] flex-1 rounded-full border-slate-200 bg-white px-4 shadow-sm"
        aria-label="취소"
        title="닫기"
        onClick={onCancel}
      >
        취소
      </Button>
    </div>
  );
}

export function PracticeTransferMobileOralPhotoIntake({
  requestIntakeProps,
  canCapture,
  photos,
  onPickPhotos,
  onRemovePhoto,
  onClearPhotos,
  onPreviewPhoto,
  onSave,
  onCancel,
  canSave = true,
}: PracticeTransferMobileOralPhotoIntakeProps) {
  const { toast } = useToast();
  const albumInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesFromInput = (input: HTMLInputElement | null) => {
    const next = Array.from(input?.files || []);
    if (input) input.value = "";
    if (!next.length) return;
    void (async () => {
      const { files: normalized, skippedHeic, skippedEmpty } =
        await normalizeOralPhotoFiles(next);
      if (skippedEmpty > 0) {
        toast({
          title: "빈 사진은 올릴 수 없어요",
          description: "다시 촬영하거나 앨범에서 다른 사진을 골라 주세요.",
          variant: "destructive",
        });
      }
      if (skippedHeic > 0) {
        toast({
          title: "HEIC는 올릴 수 없어요",
          description: "카메라로 촬영하거나 JPG·PNG로 저장한 뒤 올려 주세요.",
          variant: "destructive",
        });
      }
      if (normalized.length) onPickPhotos(normalized);
    })();
  };

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2 px-1">
        <Badge
          variant="outline"
          className="justify-center rounded-lg border-slate-200/90 bg-white px-2 py-1 text-[10px] font-medium leading-snug text-muted-foreground"
        >
          모바일: 사진만 업로드
        </Badge>
        <Badge
          variant="outline"
          className="justify-center rounded-lg border-slate-200/90 bg-white px-2 py-1 text-[10px] font-medium leading-snug text-muted-foreground"
        >
          PC: 기공소 의뢰 전송
        </Badge>
      </div>

      <PracticeTransferRequestIntakePanel
        {...requestIntakeProps}
        showLabField={false}
        showDateFields={false}
        showProsthesisSection={false}
        showMemoSection={false}
        showFeeEstimate={false}
        className="min-w-0 px-3"
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

      <div className="flex min-w-0 flex-col gap-2">
        <label
          htmlFor={canCapture ? CAMERA_INPUT_ID : undefined}
          aria-disabled={!canCapture || undefined}
          className={cn(
            "box-border flex min-h-[5.5rem] w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-3 text-center transition-[transform,colors,box-shadow] active:scale-[0.99]",
            canCapture
              ? "cursor-pointer border-primary/30 bg-white text-primary-strong shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-primary/45 hover:shadow-sm"
              : "cursor-not-allowed border-slate-200 bg-slate-50 text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full",
              canCapture
                ? "bg-primary-soft text-primary-strong"
                : "bg-white text-slate-400",
            )}
          >
            <Camera className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">구강포토 촬영</span>
        </label>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full min-w-0 rounded-xl border-slate-200 bg-white text-sm font-medium shadow-sm"
          disabled={!canCapture}
          onClick={() => albumInputRef.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4 shrink-0" />
          앨범에서 선택
        </Button>
      </div>

      {photos.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {photos.length}장
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={onClearPhotos}
            >
              전체삭제
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
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
                  <button
                    type="button"
                    className={cn(
                      "block w-full text-left",
                      photo.previewUrl ? "cursor-zoom-in" : "cursor-default",
                    )}
                    disabled={!photo.previewUrl || !onPreviewPhoto}
                    aria-label={`${photo.name} 크게 보기`}
                    onClick={() => {
                      if (!photo.previewUrl || !onPreviewPhoto) return;
                      onPreviewPhoto(photo);
                    }}
                  >
                    {photo.previewUrl ? (
                      <img
                        src={photo.previewUrl}
                        alt={photo.name}
                        className="aspect-[5/4] w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback = event.currentTarget.nextElementSibling;
                          if (fallback instanceof HTMLElement) {
                            fallback.style.display = "flex";
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "aspect-[5/4] w-full items-center justify-center text-slate-400",
                        photo.previewUrl ? "hidden" : "flex",
                      )}
                    >
                      <ImagePlus className="h-5 w-5" />
                    </div>
                    <p
                      className={cn(
                        "truncate px-1 py-0.5 text-center text-[9px] font-medium leading-tight",
                        photo.uploadStatus === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {statusLabel}
                    </p>
                  </button>
                  {photo.uploadStatus === "uploading" ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-5 h-1 bg-slate-200/90">
                      <div
                        className="h-full bg-primary-strong transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white active:bg-black/70"
                    aria-label={`${photo.name} 삭제`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemovePhoto(photo.key);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {onSave && onCancel ? (
        <PracticeTransferMobileComposeToolbar
          onSave={onSave}
          onCancel={onCancel}
          canSave={canSave}
          className="pt-1"
        />
      ) : null}
    </div>
  );
}
