// 세척.패킹 불완전가공 — 사진, 페인트, 기공소 메시지.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/shared/components/practice/ViewPaintSurface.tsx
// - web/frontend/src/shared/components/practice/ViewPaintToolbar.tsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ViewPaintSurface } from "@/shared/components/practice/ViewPaintSurface";
import {
  useViewPaint,
  ViewPaintToolbar,
  viewPaintSurfaceProps,
} from "@/shared/components/practice/ViewPaintToolbar";

export type UnmachinableLabNoticeFile = {
  kind: "photo" | "painted";
  file: File;
};

export type UnmachinableLabNoticePayload = {
  message: string;
  files: UnmachinableLabNoticeFile[];
};

export type UnmachinableLabNoticeHandle = {
  build: () => Promise<
    | { ok: true; payload: UnmachinableLabNoticePayload }
    | { ok: false; message: string }
  >;
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("사진을 불러오지 못했습니다."));
    image.src = url;
  });

const imageFileToCanvas = async (file: File) => {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) {
      throw new Error("사진을 준비하지 못했습니다.");
    }
    ctx.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const UnmachinableLabNoticeFields = forwardRef<
  UnmachinableLabNoticeHandle,
  {
    resetKey: string;
    onStateChange?: (state: { hasPhoto: boolean; hasMessage: boolean }) => void;
  }
>(function UnmachinableLabNoticeFields({ resetKey, onStateChange }, ref) {
  const paint = useViewPaint({ open: true, resetKey });
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    onStateChange?.({ hasPhoto: Boolean(photoFile), hasMessage: Boolean(message.trim()) });
  }, [message, onStateChange, photoFile]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useImperativeHandle(
    ref,
    () => ({
      build: async () => {
        const text = message.trim();
        if (!photoFile) {
          return { ok: false, message: "문제 부위 사진을 올려 주세요." };
        }
        if (!text) {
          return { ok: false, message: "기공소에 전달할 메시지를 입력해 주세요." };
        }
        const files: UnmachinableLabNoticeFile[] = [
          { kind: "photo", file: photoFile },
        ];
        if (paint.paintRef.current?.hasInk()) {
          const base = await imageFileToCanvas(photoFile);
          const blob = await paint.paintRef.current.compositePng(base);
          if (!blob) {
            return { ok: false, message: "페인트 표시를 저장하지 못했습니다." };
          }
          const paintedName = photoFile.name.replace(/\.[^.]+$/, "") || "unmachinable";
          files.push({
            kind: "painted",
            file: new File([blob], `${paintedName}-paint.png`, { type: "image/png" }),
          });
        }
        return { ok: true, payload: { message: text, files } };
      },
    }),
    [message, paint.paintRef, photoFile],
  );

  const pickPhoto = (file: File | null) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/") && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      return;
    }
    paint.paintRef.current?.clear();
    paint.setPaintOn(false);
    setPhotoFile(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-700">
          문제 부위 사진 <span className="text-destructive">*</span>
        </div>
        {photoFile ? (
          <span className="text-[11px] text-slate-500">
            페인트로 문제 부위를 표시하세요
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="h-3.5 w-3.5" />
          사진 촬영
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => fileInputRef.current?.click()}
        >
          파일 선택
        </Button>
        {photoFile ? (
          <Button
            type="button"
            size="sm"
            variant={paint.paintOn ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            aria-pressed={paint.paintOn}
            onClick={() => paint.setPaintOn((on) => !on)}
          >
            페인트
          </Button>
        ) : null}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            pickPhoto(event.target.files?.[0] || null);
            event.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            pickPhoto(event.target.files?.[0] || null);
            event.target.value = "";
          }}
        />
      </div>
      {photoUrl ? (
        <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          <div className="relative mx-auto w-fit max-w-full">
            <img
              src={photoUrl}
              alt="불완전가공 사진"
              className="max-h-[min(42vh,24rem)] max-w-full object-contain"
            />
            <ViewPaintSurface {...viewPaintSurfaceProps(paint)} />
          </div>
          {paint.paintOn ? (
            <div className="border-t border-slate-200 bg-white p-2">
              <ViewPaintToolbar paint={paint} />
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-[11px] text-slate-500 hover:border-accent-muted hover:bg-accent-soft/40"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-5 w-5 text-slate-400" />
          <span>가공 부위 사진을 올려 주세요</span>
          <span className="text-slate-400">눌러서 파일 선택</span>
        </button>
      )}
      <label className="block space-y-1">
        <span className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
          <span>
            기공소 메시지 <span className="text-destructive">*</span>
          </span>
          <span className="font-normal text-slate-400">{message.length}/1000</span>
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(String(event.target.value || "").slice(0, 1000))}
          placeholder="문제 부위와 출고 안내를 적어 주세요."
          rows={3}
          className="w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-xs"
        />
      </label>
    </div>
  );
});
